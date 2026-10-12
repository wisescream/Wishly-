-- Preserve when an offer was first discovered so alerts can distinguish new
-- retailer listings from existing offers that were merely refreshed.
ALTER TABLE public.store_offers ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;
UPDATE public.store_offers
SET created_at = COALESCE(last_verified_at, updated_at, now())
WHERE created_at IS NULL;
ALTER TABLE public.store_offers ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE public.store_offers ALTER COLUMN created_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_store_offers_first_seen
  ON public.store_offers(item_id, created_at DESC);
