-- Extend the existing global catalog and offer tables without recreating data.
ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS offers_last_checked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS enrichment_error TEXT;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS offers_last_checked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS offer_search_status TEXT;

ALTER TABLE public.store_offers
  ADD COLUMN IF NOT EXISTS id UUID,
  ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES public.product_variants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS shipping_known BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS taxes_known BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS total_is_estimated BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS destination_country TEXT,
  ADD COLUMN IF NOT EXISTS seller TEXT,
  ADD COLUMN IF NOT EXISTS currency_converted_to TEXT,
  ADD COLUMN IF NOT EXISTS converted_price NUMERIC,
  ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC,
  ADD COLUMN IF NOT EXISTS exchange_rate_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_error TEXT;

-- Offers were originally keyed by (item_id, store). Add a stable identifier
-- for price-history references while preserving the existing composite key.
UPDATE public.store_offers SET id = uuid_generate_v4() WHERE id IS NULL;
ALTER TABLE public.store_offers ALTER COLUMN id SET DEFAULT uuid_generate_v4();
ALTER TABLE public.store_offers ALTER COLUMN id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_store_offers_id_unique ON public.store_offers(id);

ALTER TABLE public.price_points
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'MAD',
  ADD COLUMN IF NOT EXISTS source TEXT,
  ADD COLUMN IF NOT EXISTS offer_id UUID REFERENCES public.store_offers(id) ON DELETE SET NULL;

ALTER TABLE public.import_jobs
  ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES public.products(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_products_gtin_normalized
  ON public.products ((regexp_replace(gtin, '[^0-9]', '', 'g')))
  WHERE gtin IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_brand_model_normalized
  ON public.products (lower(brand), lower(model_number))
  WHERE brand IS NOT NULL AND model_number IS NOT NULL;

-- Serialize canonical product and variant resolution to prevent duplicate rows
-- when two imports for the same identity arrive at once.
CREATE OR REPLACE FUNCTION public.resolve_catalog_product(
  p_title TEXT,
  p_brand TEXT DEFAULT NULL,
  p_model_number TEXT DEFAULT NULL,
  p_gtin TEXT DEFAULT NULL,
  p_image_url TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_gtin TEXT := regexp_replace(COALESCE(p_gtin, ''), '[^0-9]', '', 'g');
  v_identity TEXT;
BEGIN
  IF v_gtin = '' AND (COALESCE(p_brand, '') = '' OR COALESCE(p_model_number, '') = '') THEN
    RETURN NULL;
  END IF;
  v_identity := CASE WHEN v_gtin <> '' THEN 'gtin:' || v_gtin
    ELSE 'model:' || lower(trim(p_brand)) || ':' || lower(trim(p_model_number)) END;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_identity, 0));
  IF v_gtin <> '' THEN
    SELECT id INTO v_id FROM public.products
      WHERE regexp_replace(gtin, '[^0-9]', '', 'g') = v_gtin LIMIT 1;
  ELSE
    SELECT id INTO v_id FROM public.products
      WHERE lower(trim(brand)) = lower(trim(p_brand))
        AND lower(trim(model_number)) = lower(trim(p_model_number)) LIMIT 1;
  END IF;
  IF v_id IS NULL THEN
    INSERT INTO public.products (title, brand, model_number, gtin, primary_image_url)
      VALUES (trim(p_title), NULLIF(trim(p_brand), ''), NULLIF(trim(p_model_number), ''), NULLIF(v_gtin, ''), p_image_url)
      RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_product_variant(p_product_id UUID, p_name TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF p_product_id IS NULL OR COALESCE(trim(p_name), '') = '' THEN RETURN NULL; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('variant:' || p_product_id::text || ':' || lower(trim(p_name)), 0));
  SELECT id INTO v_id FROM public.product_variants
    WHERE product_id = p_product_id AND lower(trim(name)) = lower(trim(p_name)) LIMIT 1;
  IF v_id IS NULL THEN
    INSERT INTO public.product_variants (product_id, name)
      VALUES (p_product_id, trim(p_name)) RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.resolve_catalog_product(TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resolve_product_variant(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_catalog_product(TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_product_variant(UUID, TEXT) TO service_role;
CREATE INDEX IF NOT EXISTS idx_offers_product_freshness
  ON public.store_offers (product_id, last_verified_at DESC);
CREATE INDEX IF NOT EXISTS idx_import_jobs_retry
  ON public.import_jobs (status, next_attempt_at)
  WHERE status IN ('failed', 'partial');
CREATE INDEX IF NOT EXISTS idx_price_points_recorded
  ON public.price_points (recorded_at DESC);

CREATE TABLE IF NOT EXISTS public.price_alert_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  offer_id UUID NOT NULL REFERENCES public.store_offers(id) ON DELETE CASCADE,
  observed_at TIMESTAMPTZ NOT NULL,
  price NUMERIC NOT NULL CHECK (price > 0),
  currency TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (item_id, offer_id, observed_at)
);
ALTER TABLE public.price_alert_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY price_alert_events_select_own ON public.price_alert_events
  FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);
CREATE INDEX IF NOT EXISTS idx_price_alert_events_user ON public.price_alert_events (user_id, created_at DESC);

ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS price_drop_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_price_drop_key
  ON public.notifications (user_id, price_drop_key)
  WHERE price_drop_key IS NOT NULL;

-- Catalog data is shared. Clients can read it, while trusted server functions
-- own catalog and offer writes. This avoids arbitrary authenticated users
-- poisoning shared identity and price data.
DROP POLICY IF EXISTS products_write_auth ON public.products;
DROP POLICY IF EXISTS variants_write_auth ON public.product_variants;
DROP POLICY IF EXISTS store_offers_read ON public.store_offers;
CREATE POLICY store_offers_read ON public.store_offers FOR SELECT USING (true);

DROP POLICY IF EXISTS import_jobs_user ON public.import_jobs;
CREATE POLICY import_jobs_select_own ON public.import_jobs
  FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);
CREATE POLICY import_jobs_insert_own ON public.import_jobs
  FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY import_jobs_update_own ON public.import_jobs
  FOR UPDATE TO authenticated USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- Existing offer rows had no reliable destination/shipping details. Do not
-- backfill them as known totals; callers must preserve the unknown state.
UPDATE public.store_offers SET total_is_estimated = true
WHERE total_is_estimated IS DISTINCT FROM true;

-- Existing offers predate product-level verification metadata. Preserve the
-- records while preventing migration defaults from making them look live.
UPDATE public.store_offers
SET source = 'legacy_unverified',
    availability = 'unknown',
    last_verified_at = LEAST(last_verified_at, now() - interval '2 days'),
    shipping_known = false,
    taxes_known = false,
    total_price = NULL,
    total_is_estimated = true
WHERE product_id IS NULL;
