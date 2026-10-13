-- Preserve seller classification on each offer so users can filter the
-- marketplace and resale results without implying that unknown sellers are
-- trusted or counterfeit.
ALTER TABLE public.store_offers
  ADD COLUMN IF NOT EXISTS seller_type TEXT NOT NULL DEFAULT 'unknown';

ALTER TABLE public.store_offers
  DROP CONSTRAINT IF EXISTS store_offers_seller_type_check,
  ADD CONSTRAINT store_offers_seller_type_check
    CHECK (seller_type IN ('official','authorized','independent','marketplace','reseller','outlet','second_hand','unknown'));

CREATE INDEX IF NOT EXISTS idx_store_offers_seller_type
  ON public.store_offers (seller_type, last_verified_at DESC);
