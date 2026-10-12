-- Keep stock changes even when the advertised price is unchanged, while
-- still deduplicating repeated observations of the same state each UTC day.
DROP INDEX IF EXISTS public.idx_price_points_daily_observation;
CREATE UNIQUE INDEX idx_price_points_daily_observation
  ON public.price_points(
    item_id,
    COALESCE(offer_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(store, ''),
    currency,
    observation_day,
    price,
    COALESCE(availability, '')
  );

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
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id UUID;
  v_is_service BOOLEAN := COALESCE(auth.role() = 'service_role', FALSE);
  v_recorded_at TIMESTAMPTZ := CASE WHEN COALESCE(auth.role() = 'service_role', FALSE) THEN p_recorded_at ELSE now() END;
  v_day DATE;
BEGIN
  IF p_price IS NULL OR p_price <= 0 OR p_currency IS NULL OR trim(p_currency) = '' THEN
    RETURN NULL;
  END IF;
  IF NOT v_is_service AND NOT EXISTS (
    SELECT 1 FROM public.items i JOIN public.wishlists w ON w.id = i.wishlist_id
    WHERE i.id = p_item_id AND w.owner_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized to record a price for this item' USING ERRCODE = '42501';
  END IF;
  v_day := (v_recorded_at AT TIME ZONE 'UTC')::date;
  INSERT INTO public.price_points(item_id, price, store, recorded_at, currency, source, offer_id, source_url, availability, is_verified, observation_day)
  VALUES(p_item_id, p_price, COALESCE(p_store, 'Unknown'), v_recorded_at, upper(p_currency), p_source, p_offer_id, p_source_url, p_availability, v_is_service AND p_is_verified, v_day)
  ON CONFLICT DO NOTHING RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.price_points
    WHERE item_id = p_item_id
      AND COALESCE(offer_id, '00000000-0000-0000-0000-000000000000'::uuid) = COALESCE(p_offer_id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND COALESCE(store, '') = COALESCE(p_store, 'Unknown')
      AND currency = upper(p_currency)
      AND observation_day = v_day
      AND price = p_price
      AND COALESCE(availability, '') = COALESCE(p_availability, '')
    ORDER BY recorded_at DESC LIMIT 1;
  END IF;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_price_observation(UUID, NUMERIC, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, BOOLEAN, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_price_observation(UUID, NUMERIC, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, BOOLEAN, TIMESTAMPTZ) TO authenticated, service_role;
