-- Retailer-page confirmation is bounded per listing but adds time after
-- provider search, so let the scheduled request finish within 90 seconds.
DO $$
DECLARE
  existing_job BIGINT;
BEGIN
  SELECT jobid INTO existing_job FROM cron.job WHERE jobname = 'wishly-refresh-tracked-products';
  IF existing_job IS NOT NULL THEN
    PERFORM cron.unschedule(existing_job);
  END IF;

  PERFORM cron.schedule(
    'wishly-refresh-tracked-products',
    '*/15 * * * *',
    $job$
      SELECT net.http_post(
        url := 'https://pjpyfupkaubencuxnjyf.supabase.co/functions/v1/refresh-tracked-products',
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
        timeout_milliseconds := 90000
      );
    $job$
  );
END;
$$;
