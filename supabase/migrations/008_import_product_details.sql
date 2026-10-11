-- Preserve URL extraction data on the user's saved item, even when a shared
-- canonical product identity cannot yet be established.
ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS additional_images TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS variant_label TEXT,
  ADD COLUMN IF NOT EXISTS price_source TEXT,
  ADD COLUMN IF NOT EXISTS last_offer_search_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_items_offer_search_due
  ON public.items (last_offer_search_at)
  WHERE status = 'wanted';
