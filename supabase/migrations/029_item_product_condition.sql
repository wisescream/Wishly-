ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS condition TEXT NOT NULL DEFAULT 'unknown';

DROP FUNCTION IF EXISTS public.claim_due_price_alert_items(INTEGER);
CREATE FUNCTION public.claim_due_price_alert_items(p_limit INTEGER DEFAULT 10)
RETURNS TABLE (
  id UUID,
  wishlist_id UUID,
  title TEXT,
  variant_label TEXT,
  target_price NUMERIC,
  current_price NUMERIC,
  price_drop_percent INTEGER,
  alert_on_any_lower_price BOOLEAN,
  alert_on_new_cheaper_offer BOOLEAN,
  alert_on_back_in_stock BOOLEAN,
  currency TEXT,
  condition TEXT,
  owner_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Only the service role can claim price alert work' USING ERRCODE = '42501';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 25 THEN
    RAISE EXCEPTION 'Invalid price alert batch size';
  END IF;

  RETURN QUERY
  WITH due AS (
    SELECT i.id
    FROM public.items AS i
    WHERE i.status = 'wanted'
      AND i.next_price_alert_check_at <= now()
      AND (i.target_price IS NOT NULL OR i.price_drop_percent IS NOT NULL
        OR i.alert_on_any_lower_price OR i.alert_on_new_cheaper_offer OR i.alert_on_back_in_stock)
    ORDER BY i.next_price_alert_check_at ASC,
      (i.target_price IS NOT NULL OR i.price_drop_percent IS NOT NULL) DESC,
      i.priority DESC,
      i.created_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  ), leased AS (
    UPDATE public.items AS i
      SET next_price_alert_check_at = now() + interval '30 minutes'
    FROM due
    WHERE i.id = due.id
    RETURNING i.id, i.wishlist_id, i.title, i.variant_label, i.target_price,
      i.current_price, i.price_drop_percent, i.alert_on_any_lower_price,
      i.alert_on_new_cheaper_offer, i.alert_on_back_in_stock, i.currency, i.condition
  )
  SELECT leased.id, leased.wishlist_id, leased.title, leased.variant_label,
    leased.target_price, leased.current_price, leased.price_drop_percent,
    leased.alert_on_any_lower_price, leased.alert_on_new_cheaper_offer,
    leased.alert_on_back_in_stock, leased.currency, leased.condition, w.owner_id
  FROM leased
  JOIN public.wishlists AS w ON w.id = leased.wishlist_id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_due_price_alert_items(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_due_price_alert_items(INTEGER) TO service_role;

UPDATE public.items
SET condition = CASE
  WHEN lower(condition) IN ('new', 'refurbished', 'open_box', 'used', 'unknown') THEN lower(condition)
  WHEN lower(condition) IN ('renewed', 'reconditioned') THEN 'refurbished'
  WHEN lower(condition) IN ('open box', 'open-box', 'openbox') THEN 'open_box'
  WHEN lower(condition) IN ('pre-owned', 'pre_owned', 'second-hand', 'second_hand', 'damaged') THEN 'used'
  ELSE 'unknown'
END;

CREATE OR REPLACE FUNCTION public.save_wishlist_item_once_with_condition(
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
  p_price_source TEXT,
  p_condition TEXT
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
  v_condition TEXT := CASE
    WHEN lower(COALESCE(p_condition, '')) IN ('new', 'refurbished', 'open_box', 'used', 'unknown') THEN lower(p_condition)
    ELSE 'unknown'
  END;
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
    AND COALESCE(i.condition, 'unknown') = v_condition
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
    variant_label, condition, url, store, current_price, original_price, currency, priority,
    notes, status, target_price, position, product_id, variant_id, brand,
    model_number, gtin, is_verified, price_source, enrichment_status
  ) VALUES (
    p_wishlist_id, trim(p_title), p_image_url, COALESCE(p_additional_images, ARRAY[]::TEXT[]),
    p_description, p_category, NULLIF(trim(COALESCE(p_variant_label, '')), ''), v_condition, v_url,
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

REVOKE ALL ON FUNCTION public.save_wishlist_item_once_with_condition(UUID, TEXT, TEXT, TEXT[], TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, INTEGER, TEXT, NUMERIC, UUID, UUID, TEXT, TEXT, TEXT, BOOLEAN, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_wishlist_item_once_with_condition(UUID, TEXT, TEXT, TEXT[], TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, INTEGER, TEXT, NUMERIC, UUID, UUID, TEXT, TEXT, TEXT, BOOLEAN, TEXT, TEXT) TO authenticated;
