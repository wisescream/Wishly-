-- Normalize ad-tagged URLs so repeated imports match the same retailer page
-- while retaining query parameters that may select a real product variant.
CREATE OR REPLACE FUNCTION public.normalize_product_import_url(p_url TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_url TEXT;
  v_base TEXT;
  v_query TEXT;
  v_query_pos INTEGER;
  v_pair TEXT;
  v_key TEXT;
  v_pairs TEXT[] := ARRAY[]::TEXT[];
  v_match TEXT[];
  v_authority TEXT;
BEGIN
  IF p_url IS NULL OR trim(p_url) = '' THEN
    RETURN NULL;
  END IF;
  v_url := split_part(trim(p_url), '#', 1);

  v_query_pos := strpos(v_url, '?');
  IF v_query_pos > 0 THEN
    v_base := substring(v_url FROM 1 FOR v_query_pos - 1);
    v_query := substring(v_url FROM v_query_pos + 1);
    FOREACH v_pair IN ARRAY string_to_array(v_query, '&') LOOP
      v_key := lower(split_part(v_pair, '=', 1));
      IF v_pair <> '' AND v_key !~ '^utm_' AND v_key <> ALL(ARRAY['gclid','fbclid','dclid','msclkid','yclid','mc_cid','mc_eid']) THEN
        v_pairs := array_append(v_pairs, v_pair);
      END IF;
    END LOOP;
    v_url := v_base || CASE WHEN cardinality(v_pairs) > 0 THEN '?' || array_to_string(v_pairs, '&') ELSE '' END;
  END IF;

  v_match := regexp_match(v_url, '^([A-Za-z][A-Za-z0-9+.-]*://)([^/?#]+)(.*)$');
  IF v_match IS NOT NULL THEN
    v_authority := lower(v_match[2]);
    IF lower(v_match[1]) = 'https://' THEN
      v_authority := regexp_replace(v_authority, ':443$', '');
    ELSIF lower(v_match[1]) = 'http://' THEN
      v_authority := regexp_replace(v_authority, ':80$', '');
    END IF;
    v_url := lower(v_match[1]) || v_authority || v_match[3];
  END IF;
  RETURN v_url;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_items_wishlist_product_variant
  ON public.items(wishlist_id, product_id, variant_id)
  WHERE product_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_items_wishlist_gtin_normalized
  ON public.items(wishlist_id, (regexp_replace(gtin, '[^0-9]', '', 'g')))
  WHERE gtin IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_items_wishlist_import_url_normalized
  ON public.items(wishlist_id, public.normalize_product_import_url(url))
  WHERE url IS NOT NULL;

-- A wishlist-scoped advisory transaction lock serializes simultaneous imports
-- for the same list. The function returns the existing row on a duplicate and
-- never overwrites its user's edits or historical price observations.
CREATE OR REPLACE FUNCTION public.save_wishlist_item_once(
  p_wishlist_id UUID,
  p_title TEXT,
  p_image_url TEXT,
  p_additional_images TEXT[],
  p_description TEXT,
  p_category TEXT,
  p_variant_label TEXT,
  p_url TEXT,
  p_store TEXT,
  p_current_price NUMERIC,
  p_original_price NUMERIC,
  p_currency TEXT,
  p_priority INTEGER,
  p_notes TEXT,
  p_target_price NUMERIC,
  p_product_id UUID,
  p_variant_id UUID,
  p_brand TEXT,
  p_model_number TEXT,
  p_gtin TEXT,
  p_is_verified BOOLEAN,
  p_price_source TEXT
)
RETURNS TABLE(item_id UUID, is_duplicate BOOLEAN)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_existing UUID;
  v_new_item UUID;
  v_gtin TEXT := nullif(regexp_replace(COALESCE(p_gtin, ''), '[^0-9]', '', 'g'), '');
  v_variant TEXT := lower(regexp_replace(trim(COALESCE(p_variant_label, '')), '[[:space:]]+', ' ', 'g'));
  v_url TEXT := public.normalize_product_import_url(p_url);
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.wishlists AS w WHERE w.id = p_wishlist_id AND w.owner_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Wishlist not found or not owned by the caller' USING ERRCODE = '42501';
  END IF;
  IF p_title IS NULL OR trim(p_title) = '' THEN
    RAISE EXCEPTION 'Product title is required';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_wishlist_id::TEXT, 0));

  SELECT i.id INTO v_existing
  FROM public.items AS i
  WHERE i.wishlist_id = p_wishlist_id
    AND (
      (p_product_id IS NOT NULL AND i.product_id = p_product_id AND (
        (p_variant_id IS NOT NULL AND i.variant_id = p_variant_id)
        OR (p_variant_id IS NULL AND i.variant_id IS NULL
          AND lower(regexp_replace(trim(COALESCE(i.variant_label, '')), '[[:space:]]+', ' ', 'g')) = v_variant)
      ))
      OR (v_gtin IS NOT NULL
        AND regexp_replace(COALESCE(i.gtin, ''), '[^0-9]', '', 'g') = v_gtin
        AND lower(regexp_replace(trim(COALESCE(i.variant_label, '')), '[[:space:]]+', ' ', 'g')) = v_variant)
      OR (v_url IS NOT NULL
        AND public.normalize_product_import_url(i.url) = v_url
        AND lower(regexp_replace(trim(COALESCE(i.variant_label, '')), '[[:space:]]+', ' ', 'g')) = v_variant)
    )
  ORDER BY i.created_at ASC
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RETURN QUERY SELECT v_existing, TRUE;
    RETURN;
  END IF;

  INSERT INTO public.items(
    wishlist_id, title, image_url, additional_images, description, category,
    variant_label, url, store, current_price, original_price, currency, priority,
    notes, status, target_price, position, product_id, variant_id, brand,
    model_number, gtin, is_verified, price_source, enrichment_status
  ) VALUES (
    p_wishlist_id, trim(p_title), p_image_url, COALESCE(p_additional_images, ARRAY[]::TEXT[]),
    p_description, p_category, NULLIF(trim(COALESCE(p_variant_label, '')), ''), v_url,
    p_store, CASE WHEN p_current_price > 0 THEN p_current_price ELSE NULL END,
    CASE WHEN p_original_price > 0 THEN p_original_price ELSE NULL END,
    upper(COALESCE(NULLIF(trim(p_currency), ''), 'USD')), p_priority, p_notes, 'wanted',
    CASE WHEN p_target_price > 0 THEN p_target_price ELSE NULL END, 0,
    p_product_id, p_variant_id, p_brand, p_model_number, v_gtin,
    COALESCE(p_is_verified, FALSE), COALESCE(NULLIF(p_price_source, ''), 'user_entered'), 'processing'
  ) RETURNING id INTO v_new_item;

  IF p_current_price > 0 THEN
    PERFORM public.record_price_observation(
      p_item_id => v_new_item,
      p_price => p_current_price,
      p_currency => upper(COALESCE(NULLIF(trim(p_currency), ''), 'USD')),
      p_store => COALESCE(p_store, 'Initial Listing'),
      p_source => COALESCE(NULLIF(p_price_source, ''), 'user_entered'),
      p_offer_id => NULL,
      p_source_url => v_url,
      p_availability => NULL,
      p_is_verified => FALSE,
      p_recorded_at => now()
    );
  END IF;

  RETURN QUERY SELECT v_new_item, FALSE;
END;
$$;

REVOKE ALL ON FUNCTION public.normalize_product_import_url(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.normalize_product_import_url(TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.save_wishlist_item_once(UUID, TEXT, TEXT, TEXT[], TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, INTEGER, TEXT, NUMERIC, UUID, UUID, TEXT, TEXT, TEXT, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_wishlist_item_once(UUID, TEXT, TEXT, TEXT[], TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, INTEGER, TEXT, NUMERIC, UUID, UUID, TEXT, TEXT, TEXT, BOOLEAN, TEXT) TO authenticated;
