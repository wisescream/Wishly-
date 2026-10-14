-- Add auditable verification fields while preserving existing offers.
ALTER TABLE public.store_offers
  ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verification_reason_code TEXT,
  ADD COLUMN IF NOT EXISTS verification_evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS canonical_url TEXT,
  ADD COLUMN IF NOT EXISTS source_url TEXT,
  ADD COLUMN IF NOT EXISTS product_gtin TEXT,
  ADD COLUMN IF NOT EXISTS product_sku TEXT,
  ADD COLUMN IF NOT EXISTS product_model_number TEXT,
  ADD COLUMN IF NOT EXISTS gender_category TEXT;

UPDATE public.store_offers
SET verification_status = CASE WHEN is_verified THEN 'verified' ELSE 'unverified' END,
    last_checked_at = COALESCE(last_checked_at, last_verified_at, updated_at),
    shipping_cost = CASE WHEN shipping_known THEN shipping_cost ELSE NULL END,
    taxes = CASE WHEN taxes_known THEN taxes ELSE NULL END
WHERE true;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.store_offers'::regclass AND conname = 'store_offers_verification_status_check') THEN
    ALTER TABLE public.store_offers ADD CONSTRAINT store_offers_verification_status_check
      CHECK (verification_status IN ('unverified', 'verified', 'unavailable', 'stale', 'rejected', 'failed'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_store_offers_verification_state
  ON public.store_offers(item_id, verification_status, last_verified_at DESC);

UPDATE public.store_offers SET source_url = url WHERE source_url IS NULL;
