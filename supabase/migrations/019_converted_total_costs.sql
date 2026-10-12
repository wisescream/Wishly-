ALTER TABLE public.store_offers
  ADD COLUMN IF NOT EXISTS converted_total_price NUMERIC,
  ADD COLUMN IF NOT EXISTS exchange_rate_source TEXT;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.store_offers'::regclass AND conname = 'store_offers_converted_total_nonnegative'
  ) THEN
    ALTER TABLE public.store_offers ADD CONSTRAINT store_offers_converted_total_nonnegative
      CHECK (converted_total_price IS NULL OR converted_total_price >= 0);
  END IF;
END $$;
