-- Run with `supabase test db` after migrations. Fixtures and the assertions are
-- wrapped in a transaction and leave no rows behind.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT extensions.plan(11);

CREATE TEMP TABLE import_test_ids (
  owner_a UUID,
  owner_b UUID,
  wishlist_a UUID,
  wishlist_b UUID,
  wishlist_other_owner UUID
);

DO $$
DECLARE
  v_owner_a UUID := gen_random_uuid();
  v_owner_b UUID := gen_random_uuid();
  v_wishlist_a UUID;
  v_wishlist_b UUID;
  v_wishlist_other_owner UUID;
BEGIN
  INSERT INTO auth.users(id, instance_id, role, aud, email, raw_user_meta_data, created_at, updated_at)
  VALUES
    (v_owner_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', v_owner_a::TEXT || '@import-test.invalid', '{}'::JSONB, now(), now()),
    (v_owner_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', v_owner_b::TEXT || '@import-test.invalid', '{}'::JSONB, now(), now());

  INSERT INTO public.wishlists(owner_id, name, slug)
  VALUES (v_owner_a, 'Import RPC test A', 'import-rpc-test-a') RETURNING id INTO v_wishlist_a;
  INSERT INTO public.wishlists(owner_id, name, slug)
  VALUES (v_owner_a, 'Import RPC test B', 'import-rpc-test-b') RETURNING id INTO v_wishlist_b;
  INSERT INTO public.wishlists(owner_id, name, slug)
  VALUES (v_owner_b, 'Import RPC test other owner', 'import-rpc-test-other-owner') RETURNING id INTO v_wishlist_other_owner;

  INSERT INTO import_test_ids VALUES (v_owner_a, v_owner_b, v_wishlist_a, v_wishlist_b, v_wishlist_other_owner);
END;
$$;

GRANT SELECT ON import_test_ids TO authenticated;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT owner_a::TEXT FROM import_test_ids), true);

DO $$
DECLARE
  v_ids import_test_ids%ROWTYPE;
  v_first RECORD;
  v_duplicate RECORD;
  v_other_variant RECORD;
  v_gtin_duplicate RECORD;
  v_other_list RECORD;
  v_existing_title TEXT;
  v_cross_owner_denied BOOLEAN := FALSE;
  v_out_of_stock_id UUID;
  v_same_out_of_stock_id UUID;
  v_back_in_stock_id UUID;
BEGIN
  SELECT * INTO v_ids FROM import_test_ids;

  SELECT * INTO v_first FROM public.save_wishlist_item_once(
    p_wishlist_id => v_ids.wishlist_a, p_title => 'Sony WH-1000XM5', p_image_url => NULL,
    p_additional_images => ARRAY[]::TEXT[], p_description => NULL, p_category => 'Audio',
    p_variant_label => 'Black', p_url => 'https://shop.example/headphones?color=black&utm_source=mail#details',
    p_store => 'shop.example', p_current_price => 299, p_original_price => NULL, p_currency => 'EUR',
    p_priority => 2, p_notes => NULL, p_target_price => NULL, p_product_id => NULL,
    p_variant_id => NULL, p_brand => 'Sony', p_model_number => 'WH-1000XM5',
    p_gtin => '4548736132610', p_is_verified => TRUE, p_price_source => 'retailer_page'
  );
  PERFORM extensions.ok(NOT v_first.is_duplicate, 'first product import creates an item');
  PERFORM extensions.is(
    (SELECT COUNT(*)::TEXT FROM public.price_points WHERE item_id = v_first.item_id),
    '1', 'first product import records its initial price in the same transaction'
  );

  v_out_of_stock_id := public.record_price_observation(
    p_item_id => v_first.item_id, p_price => 50, p_currency => 'EUR', p_store => 'stock-state-test',
    p_source => 'test', p_availability => 'out_of_stock'
  );
  v_same_out_of_stock_id := public.record_price_observation(
    p_item_id => v_first.item_id, p_price => 50, p_currency => 'EUR', p_store => 'stock-state-test',
    p_source => 'test', p_availability => 'out_of_stock'
  );
  v_back_in_stock_id := public.record_price_observation(
    p_item_id => v_first.item_id, p_price => 50, p_currency => 'EUR', p_store => 'stock-state-test',
    p_source => 'test', p_availability => 'in_stock'
  );
  PERFORM extensions.ok(v_out_of_stock_id = v_same_out_of_stock_id,
    'repeated same-state daily price observations are deduplicated');
  PERFORM extensions.ok(v_back_in_stock_id <> v_out_of_stock_id,
    'same-day stock transition is preserved when the price does not change');

  SELECT * INTO v_duplicate FROM public.save_wishlist_item_once(
    p_wishlist_id => v_ids.wishlist_a, p_title => 'Edited title must not replace the saved item', p_image_url => NULL,
    p_additional_images => ARRAY[]::TEXT[], p_description => NULL, p_category => 'Audio',
    p_variant_label => 'black', p_url => 'https://SHOP.EXAMPLE:443/headphones?color=black&gclid=ad#details',
    p_store => 'shop.example', p_current_price => 250, p_original_price => NULL, p_currency => 'EUR',
    p_priority => 2, p_notes => NULL, p_target_price => NULL, p_product_id => NULL,
    p_variant_id => NULL, p_brand => 'Sony', p_model_number => 'WH-1000XM5',
    p_gtin => NULL, p_is_verified => TRUE, p_price_source => 'retailer_page'
  );
  PERFORM extensions.ok(v_duplicate.is_duplicate AND v_duplicate.item_id = v_first.item_id,
    'tracking-tag URL duplicate returns the original item');
  PERFORM extensions.is(
    (SELECT COUNT(*)::TEXT FROM public.price_points WHERE item_id = v_first.item_id AND price = 299 AND source = 'retailer_page'),
    '1', 'duplicate import does not add another initial price observation'
  );
  SELECT title INTO v_existing_title FROM public.items WHERE id = v_first.item_id;
  PERFORM extensions.is(v_existing_title, 'Sony WH-1000XM5', 'duplicate import preserves the existing item');

  SELECT * INTO v_other_variant FROM public.save_wishlist_item_once(
    p_wishlist_id => v_ids.wishlist_a, p_title => 'Sony WH-1000XM5', p_image_url => NULL,
    p_additional_images => ARRAY[]::TEXT[], p_description => NULL, p_category => 'Audio',
    p_variant_label => 'White', p_url => 'https://shop.example/headphones?color=white',
    p_store => 'shop.example', p_current_price => 299, p_original_price => NULL, p_currency => 'EUR',
    p_priority => 2, p_notes => NULL, p_target_price => NULL, p_product_id => NULL,
    p_variant_id => NULL, p_brand => 'Sony', p_model_number => 'WH-1000XM5',
    p_gtin => '4548736132603', p_is_verified => TRUE, p_price_source => 'retailer_page'
  );
  PERFORM extensions.ok(NOT v_other_variant.is_duplicate AND v_other_variant.item_id <> v_first.item_id,
    'different product variant remains a separate item');

  SELECT * INTO v_gtin_duplicate FROM public.save_wishlist_item_once(
    p_wishlist_id => v_ids.wishlist_a, p_title => 'Sony WH-1000XM5 listing on another retailer', p_image_url => NULL,
    p_additional_images => ARRAY[]::TEXT[], p_description => NULL, p_category => 'Audio',
    p_variant_label => 'Black', p_url => 'https://another-shop.example/sony',
    p_store => 'another-shop.example', p_current_price => 310, p_original_price => NULL, p_currency => 'EUR',
    p_priority => 2, p_notes => NULL, p_target_price => NULL, p_product_id => NULL,
    p_variant_id => NULL, p_brand => 'Sony', p_model_number => 'WH-1000XM5',
    p_gtin => '4548736132610', p_is_verified => TRUE, p_price_source => 'retailer_page'
  );
  PERFORM extensions.ok(v_gtin_duplicate.is_duplicate AND v_gtin_duplicate.item_id = v_first.item_id,
    'GTIN and variant duplicate returns the original item');

  SELECT * INTO v_other_list FROM public.save_wishlist_item_once(
    p_wishlist_id => v_ids.wishlist_b, p_title => 'Sony WH-1000XM5', p_image_url => NULL,
    p_additional_images => ARRAY[]::TEXT[], p_description => NULL, p_category => 'Audio',
    p_variant_label => 'Black', p_url => 'https://shop.example/headphones?color=black',
    p_store => 'shop.example', p_current_price => 299, p_original_price => NULL, p_currency => 'EUR',
    p_priority => 2, p_notes => NULL, p_target_price => NULL, p_product_id => NULL,
    p_variant_id => NULL, p_brand => 'Sony', p_model_number => 'WH-1000XM5',
    p_gtin => '4548736132610', p_is_verified => TRUE, p_price_source => 'retailer_page'
  );
  PERFORM extensions.ok(NOT v_other_list.is_duplicate AND v_other_list.item_id <> v_first.item_id,
    'same product may be saved in another wishlist');

  BEGIN
    PERFORM * FROM public.save_wishlist_item_once(
      p_wishlist_id => v_ids.wishlist_other_owner, p_title => 'Unauthorized', p_image_url => NULL,
      p_additional_images => ARRAY[]::TEXT[], p_description => NULL, p_category => NULL,
      p_variant_label => NULL, p_url => NULL, p_store => NULL, p_current_price => NULL,
      p_original_price => NULL, p_currency => 'USD', p_priority => 2, p_notes => NULL,
      p_target_price => NULL, p_product_id => NULL, p_variant_id => NULL, p_brand => NULL,
      p_model_number => NULL, p_gtin => NULL, p_is_verified => FALSE, p_price_source => 'manual'
    );
  EXCEPTION WHEN SQLSTATE '42501' THEN
    v_cross_owner_denied := TRUE;
  END;
  PERFORM extensions.ok(v_cross_owner_denied, 'cross-owner wishlist import is rejected');
END;
$$;

SELECT * FROM extensions.finish();
ROLLBACK;
