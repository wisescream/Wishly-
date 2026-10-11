-- The connected project has an older notifications shape than the app's
-- generated types. Add the display fields without replacing existing rows.
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS body TEXT;

UPDATE public.notifications
SET title = COALESCE(title, initcap(replace(type, '_', ' '))),
    body = COALESCE(body, '');
ALTER TABLE public.notifications
  ALTER COLUMN title SET DEFAULT 'Wishly update',
  ALTER COLUMN title SET NOT NULL;

-- PostgreSQL cannot infer a partial unique index for ON CONFLICT without a
-- predicate. NULL keys remain distinct, so this full index is safe.
DROP INDEX IF EXISTS public.idx_notifications_price_drop_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_user_price_key_unique
  ON public.notifications (user_id, price_drop_key);
