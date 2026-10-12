-- Distinguish prices observed by search providers from prices confirmed on
-- the retailer's own product page. Legacy and search-only offers stay false.
ALTER TABLE public.store_offers
  ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_store_offers_verified_freshness
  ON public.store_offers(item_id, is_verified, last_verified_at DESC);
