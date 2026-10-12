BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT extensions.plan(34);

CREATE TEMP TABLE interactive_limit_test_ids (user_id UUID, other_user_id UUID);

DO $$
DECLARE
  v_user_id UUID := gen_random_uuid();
  v_other_user_id UUID := gen_random_uuid();
BEGIN
  INSERT INTO auth.users(id, instance_id, role, aud, email, raw_user_meta_data, created_at, updated_at)
  VALUES
    (v_user_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', v_user_id::TEXT || '@interactive-limit-test.invalid', '{}'::JSONB, now(), now()),
    (v_other_user_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', v_other_user_id::TEXT || '@interactive-limit-test.invalid', '{}'::JSONB, now(), now());
  INSERT INTO interactive_limit_test_ids VALUES (v_user_id, v_other_user_id);
END;
$$;

GRANT SELECT ON interactive_limit_test_ids TO authenticated;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT user_id::TEXT FROM interactive_limit_test_ids), true);

DO $$
DECLARE
  v_attempt INTEGER;
BEGIN
  FOR v_attempt IN 1..20 LOOP
    PERFORM extensions.ok(
      public.reserve_interactive_provider_request('product_search'),
      format('product search request %s is allowed', v_attempt)
    );
  END LOOP;
  PERFORM extensions.ok(
    NOT public.reserve_interactive_provider_request('product_search'),
    'twenty-first product search in the same minute is rejected'
  );

  FOR v_attempt IN 1..5 LOOP
    PERFORM extensions.ok(
      public.reserve_interactive_provider_request('image_search'),
      format('image search request %s is allowed', v_attempt)
    );
  END LOOP;
  PERFORM extensions.ok(
    NOT public.reserve_interactive_provider_request('image_search'),
    'sixth image search in the same minute is rejected'
  );
END;
$$;

SELECT extensions.throws_ok(
  $$SELECT public.reserve_interactive_provider_request('unbounded_surface')$$,
  '22023',
  'Invalid interactive provider surface',
  'rejects caller-selected rate-limit surfaces'
);

SELECT extensions.ok(
  NOT has_table_privilege('authenticated', 'public.interactive_provider_rate_limits', 'SELECT'),
  'authenticated clients cannot read provider rate-limit rows'
);
SELECT extensions.ok(
  NOT has_table_privilege('service_role', 'public.interactive_provider_rate_limits', 'SELECT'),
  'service-role clients cannot read provider rate-limit rows directly'
);
SELECT extensions.ok(
  has_function_privilege('authenticated', 'public.reserve_interactive_provider_request(text)', 'EXECUTE'),
  'authenticated clients can reserve their own provider quota'
);
SELECT extensions.ok(
  NOT has_function_privilege('anon', 'public.reserve_interactive_provider_request(text)', 'EXECUTE'),
  'anonymous clients cannot reserve provider quota'
);

SELECT set_config('request.jwt.claim.sub', (SELECT other_user_id::TEXT FROM interactive_limit_test_ids), true);
SELECT extensions.ok(
  public.reserve_interactive_provider_request('product_search'),
  'another user receives an independent product-search quota'
);

RESET ROLE;
UPDATE public.interactive_provider_rate_limits
SET window_started_at = now() - interval '61 seconds'
WHERE user_id = (SELECT user_id FROM interactive_limit_test_ids) AND surface = 'product_search';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT user_id::TEXT FROM interactive_limit_test_ids), true);
SELECT extensions.ok(
  public.reserve_interactive_provider_request('product_search'),
  'expired product-search windows reset their allowance'
);

SELECT * FROM extensions.finish();
ROLLBACK;
