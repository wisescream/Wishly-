BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT extensions.plan(11);

CREATE TEMP TABLE import_limit_test_ids (user_id UUID);

DO $$
DECLARE
  v_user_id UUID := gen_random_uuid();
BEGIN
  INSERT INTO auth.users(id, instance_id, role, aud, email, raw_user_meta_data, created_at, updated_at)
  VALUES (v_user_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', v_user_id::TEXT || '@import-limit-test.invalid', '{}'::JSONB, now(), now());
  INSERT INTO import_limit_test_ids VALUES (v_user_id);
END;
$$;

GRANT SELECT ON import_limit_test_ids TO authenticated;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT user_id::TEXT FROM import_limit_test_ids), true);

DO $$
DECLARE
  v_allowed BOOLEAN;
  v_attempt INTEGER;
BEGIN
  FOR v_attempt IN 1..10 LOOP
    v_allowed := public.reserve_product_import();
    PERFORM extensions.ok(v_allowed, format('authenticated import %s is allowed', v_attempt));
  END LOOP;

  PERFORM extensions.ok(NOT public.reserve_product_import(), 'eleventh import in the same minute is rejected');
END;
$$;

SELECT * FROM extensions.finish();
ROLLBACK;
