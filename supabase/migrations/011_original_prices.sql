ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS original_price NUMERIC;

ALTER TABLE public.store_offers
  ADD COLUMN IF NOT EXISTS original_price NUMERIC,
  ADD COLUMN IF NOT EXISTS discount_percent NUMERIC;
