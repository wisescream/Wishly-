-- Repair incomplete price observations and allow multiple listings per retailer.
ALTER TABLE public.price_points
  ADD COLUMN IF NOT EXISTS id UUID,
  ADD COLUMN IF NOT EXISTS availability TEXT,
  ADD COLUMN IF NOT EXISTS source_url TEXT,
  ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS observation_day DATE;

UPDATE public.price_points SET id = uuid_generate_v4() WHERE id IS NULL;
UPDATE public.price_points SET observation_day = (recorded_at AT TIME ZONE 'UTC')::date WHERE observation_day IS NULL;
ALTER TABLE public.price_points ALTER COLUMN id SET DEFAULT uuid_generate_v4();
ALTER TABLE public.price_points ALTER COLUMN id SET NOT NULL;
ALTER TABLE public.price_points ALTER COLUMN observation_day SET NOT NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.price_points'::regclass AND contype = 'p') THEN
    ALTER TABLE public.price_points ADD CONSTRAINT price_points_pkey PRIMARY KEY (id);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_price_points_item_currency_time
  ON public.price_points(item_id, currency, recorded_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_price_points_daily_observation
  ON public.price_points(item_id, COALESCE(offer_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(store, ''), currency, observation_day, price);

ALTER TABLE public.store_offers
  ADD COLUMN IF NOT EXISTS listing_title TEXT,
  ADD COLUMN IF NOT EXISTS image_url TEXT,
  ADD COLUMN IF NOT EXISTS size_label TEXT,
  ADD COLUMN IF NOT EXISTS size_system TEXT,
  ADD COLUMN IF NOT EXISTS color_label TEXT,
  ADD COLUMN IF NOT EXISTS product_match_confidence NUMERIC,
  ADD COLUMN IF NOT EXISTS match_type TEXT;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.store_offers'::regclass AND conname = 'store_offers_pkey') THEN
    ALTER TABLE public.store_offers DROP CONSTRAINT store_offers_pkey;
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS idx_store_offers_listing_identity
  ON public.store_offers(item_id, source, url);
CREATE INDEX IF NOT EXISTS idx_store_offers_item_freshness
  ON public.store_offers(item_id, last_verified_at DESC);

-- Preserve legacy fields, while adding structured private sizing preferences.
ALTER TABLE public.style_profiles
  ADD COLUMN IF NOT EXISTS id UUID DEFAULT uuid_generate_v4(),
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS sizing_context TEXT NOT NULL DEFAULT 'unspecified',
  ADD COLUMN IF NOT EXISTS apparel_sizes JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS shoe_sizes JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS measurements JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS fit_preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS accessory_sizes JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS brand_sizes JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS allowed_alternative_sizes JSONB NOT NULL DEFAULT '{}'::jsonb;
UPDATE public.style_profiles SET id = uuid_generate_v4() WHERE id IS NULL;
ALTER TABLE public.style_profiles ALTER COLUMN id SET NOT NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.style_profiles'::regclass AND conname = 'style_profiles_sizing_context_check') THEN
    ALTER TABLE public.style_profiles ADD CONSTRAINT style_profiles_sizing_context_check
      CHECK (sizing_context IN ('mens', 'womens', 'unisex_mixed', 'unspecified'));
  END IF;
END $$;

-- Idempotent daily observations prevent repeated imports and scheduled runs from
-- writing duplicate unchanged prices. Changed prices remain historical entries.
CREATE OR REPLACE FUNCTION public.record_price_observation(
  p_item_id UUID,
  p_price NUMERIC,
  p_currency TEXT,
  p_store TEXT,
  p_source TEXT DEFAULT NULL,
  p_offer_id UUID DEFAULT NULL,
  p_source_url TEXT DEFAULT NULL,
  p_availability TEXT DEFAULT NULL,
  p_is_verified BOOLEAN DEFAULT false,
  p_recorded_at TIMESTAMPTZ DEFAULT now()
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id UUID;
  v_day DATE := (p_recorded_at AT TIME ZONE 'UTC')::date;
BEGIN
  IF p_price IS NULL OR p_price <= 0 OR p_currency IS NULL OR trim(p_currency) = '' THEN
    RETURN NULL;
  END IF;
  IF auth.role() IS DISTINCT FROM 'service_role' AND NOT EXISTS (
    SELECT 1 FROM public.items i JOIN public.wishlists w ON w.id = i.wishlist_id
    WHERE i.id = p_item_id AND w.owner_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized to record a price for this item' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.price_points(item_id, price, store, recorded_at, currency, source, offer_id, source_url, availability, is_verified, observation_day)
  VALUES(p_item_id, p_price, COALESCE(p_store, 'Unknown'), p_recorded_at, upper(p_currency), p_source, p_offer_id, p_source_url, p_availability, p_is_verified, v_day)
  ON CONFLICT DO NOTHING RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.price_points
    WHERE item_id = p_item_id
      AND COALESCE(offer_id, '00000000-0000-0000-0000-000000000000'::uuid) = COALESCE(p_offer_id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND COALESCE(store, '') = COALESCE(p_store, 'Unknown')
      AND currency = upper(p_currency) AND observation_day = v_day AND price = p_price
    ORDER BY recorded_at DESC LIMIT 1;
  END IF;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.record_price_observation(UUID, NUMERIC, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, BOOLEAN, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_price_observation(UUID, NUMERIC, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, BOOLEAN, TIMESTAMPTZ) TO authenticated, service_role;
