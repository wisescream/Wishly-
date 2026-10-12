-- Per-item alert criteria. Delivery remains in-app until an external channel
-- is configured and verified.
ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS price_drop_percent INTEGER,
  ADD COLUMN IF NOT EXISTS alert_on_any_lower_price BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS alert_on_new_cheaper_offer BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS alert_on_back_in_stock BOOLEAN NOT NULL DEFAULT false;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.items'::regclass AND conname = 'items_price_drop_percent_check'
  ) THEN
    ALTER TABLE public.items ADD CONSTRAINT items_price_drop_percent_check
      CHECK (price_drop_percent IS NULL OR price_drop_percent BETWEEN 1 AND 100);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_items_alert_preferences
  ON public.items(target_price, price_drop_percent)
  WHERE status = 'wanted' AND (target_price IS NOT NULL OR price_drop_percent IS NOT NULL OR alert_on_any_lower_price OR alert_on_new_cheaper_offer OR alert_on_back_in_stock);
