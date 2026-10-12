BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT extensions.plan(5);

CREATE TEMP TABLE condition_test_ids (user_id UUID, wishlist_id UUID);
DO $$
DECLARE
  v_user UUID := gen_random_uuid();
  v_wishlist UUID;
BEGIN
  INSERT INTO auth.users(id, instance_id, role, aud, email, raw_user_meta_data, created_at, updated_at)
  VALUES (v_user, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', v_user::TEXT || '@condition-test.invalid', '{}'::JSONB, now(), now());
  INSERT INTO public.wishlists(owner_id, name, slug)
  VALUES (v_user, 'Condition test', 'condition-test-' || substr(v_user::TEXT, 1, 8))
  RETURNING id INTO v_wishlist;
  INSERT INTO condition_test_ids VALUES (v_user, v_wishlist);
END;
$$;

GRANT SELECT ON condition_test_ids TO authenticated;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT user_id::TEXT FROM condition_test_ids), true);

DO $$
DECLARE
  v_ids condition_test_ids%ROWTYPE;
  v_open_box RECORD;
  v_duplicate RECORD;
  v_used RECORD;
BEGIN
  SELECT * INTO v_ids FROM condition_test_ids;

  SELECT * INTO v_open_box FROM public.save_wishlist_item_once_with_condition(
    p_wishlist_id => v_ids.wishlist_id, p_title => 'Sony WH-1000XM5', p_image_url => NULL,
    p_additional_images => ARRAY[]::TEXT[], p_description => NULL, p_category => 'Audio',
    p_variant_label => 'Black', p_url => 'https://shop.example/headphones?utm_source=test',
    p_store => 'shop.example', p_current_price => NULL, p_original_price => NULL, p_currency => 'EUR',
    p_priority => 2, p_notes => NULL, p_target_price => NULL, p_product_id => NULL,
    p_variant_id => NULL, p_brand => 'Sony', p_model_number => 'WH-1000XM5',
    p_gtin => NULL, p_is_verified => FALSE, p_price_source => 'retailer_page', p_condition => 'open_box'
  );
  PERFORM extensions.ok(NOT v_open_box.is_duplicate, 'first open-box import creates an item');
  PERFORM extensions.is((SELECT condition FROM public.items WHERE id = v_open_box.item_id), 'open_box', 'open-box condition is saved on the tracked item');

  SELECT * INTO v_duplicate FROM public.save_wishlist_item_once_with_condition(
    p_wishlist_id => v_ids.wishlist_id, p_title => 'Edited title', p_image_url => NULL,
    p_additional_images => ARRAY[]::TEXT[], p_description => NULL, p_category => 'Audio',
    p_variant_label => 'Black', p_url => 'https://SHOP.EXAMPLE:443/headphones?gclid=test',
    p_store => 'shop.example', p_current_price => NULL, p_original_price => NULL, p_currency => 'EUR',
    p_priority => 2, p_notes => NULL, p_target_price => NULL, p_product_id => NULL,
    p_variant_id => NULL, p_brand => 'Sony', p_model_number => 'WH-1000XM5',
    p_gtin => NULL, p_is_verified => FALSE, p_price_source => 'retailer_page', p_condition => 'open_box'
  );
  PERFORM extensions.ok(v_duplicate.is_duplicate AND v_duplicate.item_id = v_open_box.item_id, 'same-condition URL reimport is idempotent');

  SELECT * INTO v_used FROM public.save_wishlist_item_once_with_condition(
    p_wishlist_id => v_ids.wishlist_id, p_title => 'Sony WH-1000XM5', p_image_url => NULL,
    p_additional_images => ARRAY[]::TEXT[], p_description => NULL, p_category => 'Audio',
    p_variant_label => 'Black', p_url => 'https://shop.example/headphones?color=black',
    p_store => 'shop.example', p_current_price => NULL, p_original_price => NULL, p_currency => 'EUR',
    p_priority => 2, p_notes => NULL, p_target_price => NULL, p_product_id => NULL,
    p_variant_id => NULL, p_brand => 'Sony', p_model_number => 'WH-1000XM5',
    p_gtin => NULL, p_is_verified => FALSE, p_price_source => 'retailer_page', p_condition => 'used'
  );
  PERFORM extensions.ok(NOT v_used.is_duplicate AND v_used.item_id <> v_open_box.item_id, 'same URL in a different condition remains a separate tracked item');
  PERFORM extensions.is((SELECT COUNT(*)::INTEGER FROM public.items WHERE wishlist_id = v_ids.wishlist_id), 2, 'condition-aware import stores exactly two condition variants');
END;
$$;

SELECT * FROM extensions.finish();
ROLLBACK;
