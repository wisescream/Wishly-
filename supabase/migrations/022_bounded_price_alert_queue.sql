-- Keep alert processing bounded and fair as wishlists grow. Claiming uses
-- row locks with SKIP LOCKED and immediately leases work for 30 minutes so
-- overlapping scheduler calls cannot repeatedly select the same items.
ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS next_price_alert_check_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_items_due_price_alert_checks
  ON public.items(next_price_alert_check_at, target_price, priority DESC, created_at)
  WHERE status = 'wanted'
    AND (target_price IS NOT NULL OR price_drop_percent IS NOT NULL
      OR alert_on_any_lower_price OR alert_on_new_cheaper_offer OR alert_on_back_in_stock);

CREATE OR REPLACE FUNCTION public.claim_due_price_alert_items(p_limit INTEGER DEFAULT 10)
RETURNS TABLE (
  id UUID,
  wishlist_id UUID,
  title TEXT,
  variant_label TEXT,
  target_price NUMERIC,
  current_price NUMERIC,
  price_drop_percent INTEGER,
  alert_on_any_lower_price BOOLEAN,
  alert_on_new_cheaper_offer BOOLEAN,
  alert_on_back_in_stock BOOLEAN,
  currency TEXT,
  owner_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Only the service role can claim price alert work' USING ERRCODE = '42501';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 25 THEN
    RAISE EXCEPTION 'Invalid price alert batch size';
  END IF;

  RETURN QUERY
  WITH due AS (
    SELECT i.id
    FROM public.items AS i
    WHERE i.status = 'wanted'
      AND i.next_price_alert_check_at <= now()
      AND (i.target_price IS NOT NULL OR i.price_drop_percent IS NOT NULL
        OR i.alert_on_any_lower_price OR i.alert_on_new_cheaper_offer OR i.alert_on_back_in_stock)
    ORDER BY i.next_price_alert_check_at ASC,
      (i.target_price IS NOT NULL OR i.price_drop_percent IS NOT NULL) DESC,
      i.priority DESC,
      i.created_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  ), leased AS (
    UPDATE public.items AS i
      SET next_price_alert_check_at = now() + interval '30 minutes'
    FROM due
    WHERE i.id = due.id
    RETURNING i.id, i.wishlist_id, i.title, i.variant_label, i.target_price,
      i.current_price, i.price_drop_percent, i.alert_on_any_lower_price,
      i.alert_on_new_cheaper_offer, i.alert_on_back_in_stock, i.currency
  )
  SELECT leased.id, leased.wishlist_id, leased.title, leased.variant_label,
    leased.target_price, leased.current_price, leased.price_drop_percent,
    leased.alert_on_any_lower_price, leased.alert_on_new_cheaper_offer,
    leased.alert_on_back_in_stock, leased.currency, w.owner_id
  FROM leased
  JOIN public.wishlists AS w ON w.id = leased.wishlist_id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_due_price_alert_items(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_due_price_alert_items(INTEGER) TO service_role;

-- Frequent small invocations drain the durable queue without asking one Edge
-- Function request to scan the full user base. The lease provides crash recovery.
DO $$
DECLARE
  existing_job BIGINT;
BEGIN
  SELECT jobid INTO existing_job FROM cron.job WHERE jobname = 'wishly-check-prices';
  IF existing_job IS NOT NULL THEN
    PERFORM cron.unschedule(existing_job);
  END IF;

  PERFORM cron.schedule(
    'wishly-check-prices',
    '*/5 * * * *',
    $job$
      SELECT net.http_post(
        url := 'https://pjpyfupkaubencuxnjyf.supabase.co/functions/v1/check-prices',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-price-check-secret', (
            SELECT decrypted_secret
            FROM vault.decrypted_secrets
            WHERE name = 'wishly_price_check_secret'
            LIMIT 1
          )
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 60000
      );
    $job$
  );
END;
$$;
