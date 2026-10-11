-- Run trustworthy price-alert checks from the database scheduler.
-- The request token is generated and held in Vault, never committed to source.
-- The function URL below targets this connected Wishly project; replace its
-- project hostname before applying this migration to a different project.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM vault.decrypted_secrets WHERE name = 'wishly_price_check_secret'
  ) THEN
    PERFORM vault.create_secret(
      gen_random_uuid()::TEXT || gen_random_uuid()::TEXT,
      'wishly_price_check_secret',
      'Private authentication token for the Wishly scheduled price-check function'
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_valid_price_check_secret(p_candidate TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE((
    SELECT decrypted_secret = p_candidate
    FROM vault.decrypted_secrets
    WHERE name = 'wishly_price_check_secret'
    LIMIT 1
  ), FALSE);
$$;

REVOKE ALL ON FUNCTION public.is_valid_price_check_secret(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_valid_price_check_secret(TEXT) TO service_role;

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
    '15 * * * *',
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
        timeout_milliseconds := 10000
      );
    $job$
  );
END;
$$;
