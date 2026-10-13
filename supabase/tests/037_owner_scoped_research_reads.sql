-- Price and offer reads follow item visibility: private rows are owner-only,
-- while public wishlist rows remain readable by other signed-in users.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT extensions.plan(4);

CREATE TEMP TABLE research_read_test_ids (
  owner_a UUID,
  owner_b UUID,
  private_item UUID,
  public_item UUID
);

DO $$
DECLARE
  v_owner_a UUID := gen_random_uuid();
  v_owner_b UUID := gen_random_uuid();
  v_private_list UUID;
  v_public_list UUID;
  v_private_item UUID;
  v_public_item UUID;
BEGIN
  INSERT INTO auth.users(id, instance_id, role, aud, email, raw_user_meta_data, created_at, updated_at)
  VALUES
    (v_owner_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', v_owner_a::TEXT || '@research-read-test.invalid', '{}'::JSONB, now(), now()),
    (v_owner_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', v_owner_b::TEXT || '@research-read-test.invalid', '{}'::JSONB, now(), now());

  INSERT INTO public.wishlists(owner_id, name, slug, privacy)
  VALUES (v_owner_a, 'Private research read test', 'research-read-private-' || substr(v_owner_a::TEXT, 1, 8), 'private')
  RETURNING id INTO v_private_list;
  INSERT INTO public.wishlists(owner_id, name, slug, privacy)
  VALUES (v_owner_a, 'Public research read test', 'research-read-public-' || substr(v_owner_a::TEXT, 1, 8), 'public')
  RETURNING id INTO v_public_list;

  INSERT INTO public.items(wishlist_id, title, status)
  VALUES (v_private_list, 'Private history fixture', 'wanted') RETURNING id INTO v_private_item;
  INSERT INTO public.items(wishlist_id, title, status)
  VALUES (v_public_list, 'Public history fixture', 'wanted') RETURNING id INTO v_public_item;

  INSERT INTO public.price_points(item_id, price, store, currency, recorded_at, observation_day, source_url)
  VALUES
    (v_private_item, 10, 'private.example', 'USD', now(), (now() AT TIME ZONE 'UTC')::date, 'https://private.example/item'),
    (v_public_item, 20, 'public.example', 'USD', now(), (now() AT TIME ZONE 'UTC')::date, 'https://public.example/item');
  INSERT INTO public.store_offers(item_id, store, price, currency, url)
  VALUES
    (v_private_item, 'private.example', 10, 'USD', 'https://private.example/item'),
    (v_public_item, 'public.example', 20, 'USD', 'https://public.example/item');

  INSERT INTO research_read_test_ids VALUES (v_owner_a, v_owner_b, v_private_item, v_public_item);
END;
$$;

GRANT SELECT ON research_read_test_ids TO authenticated;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT owner_a::TEXT FROM research_read_test_ids), true);
SELECT extensions.is(
  (SELECT count(*)::INTEGER FROM public.price_points WHERE item_id IN (SELECT private_item FROM research_read_test_ids UNION ALL SELECT public_item FROM research_read_test_ids)),
  2,
  'owner can read private and public item price history'
);
SELECT extensions.is(
  (SELECT count(*)::INTEGER FROM public.store_offers WHERE item_id IN (SELECT private_item FROM research_read_test_ids UNION ALL SELECT public_item FROM research_read_test_ids)),
  2,
  'owner can read private and public retailer offers'
);

SELECT set_config('request.jwt.claim.sub', (SELECT owner_b::TEXT FROM research_read_test_ids), true);
SELECT extensions.is(
  (SELECT count(*)::INTEGER FROM public.price_points WHERE item_id IN (SELECT private_item FROM research_read_test_ids UNION ALL SELECT public_item FROM research_read_test_ids)),
  1,
  'another user can read public history but not private history'
);
SELECT extensions.is(
  (SELECT count(*)::INTEGER FROM public.store_offers WHERE item_id IN (SELECT private_item FROM research_read_test_ids UNION ALL SELECT public_item FROM research_read_test_ids)),
  1,
  'another user can read public offers but not private offers'
);

SELECT * FROM extensions.finish();
SELECT extensions.num_failed() AS failed_tests;
ROLLBACK;
