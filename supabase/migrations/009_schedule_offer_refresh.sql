-- Search for fresh retailer listings in bounded batches every six hours.
-- Reuse the Vault-held token created by migration 005; no credential is stored here.
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
    '0 */6 * * *',
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
        timeout_milliseconds := 60000
      );
    $job$
  );
END;
$$;
