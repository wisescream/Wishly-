-- Keep offer research due in the database so a lost browser request is picked
-- up by the scheduled worker. Retry failed provider calls with bounded backoff.
ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS offer_search_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_offer_search_at TIMESTAMPTZ;
ALTER TABLE public.items ALTER COLUMN next_offer_search_at SET DEFAULT now();

-- Preserve the existing six-hour cadence for products already checked before
-- this migration. New saved items remain immediately eligible for research.
UPDATE public.items
SET next_offer_search_at = COALESCE(last_offer_search_at, offers_last_checked_at) + interval '6 hours'
WHERE next_offer_search_at IS NULL
  AND COALESCE(last_offer_search_at, offers_last_checked_at) IS NOT NULL;
UPDATE public.items SET next_offer_search_at = created_at WHERE next_offer_search_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_items_due_offer_research
  ON public.items(next_offer_search_at, target_price, priority DESC, created_at)
  WHERE status = 'wanted';
