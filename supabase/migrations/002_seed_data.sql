-- Demo Data Seed for Wishly (Morocco)

-- Creating mock users in auth.users first to satisfy foreign key constraints
-- Real passwords won't work but this sets up the data
INSERT INTO auth.users (id, instance_id, role, aud, email, raw_user_meta_data, created_at, updated_at)
VALUES 
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'amina@demo.ma', '{"username": "amina_design", "display_name": "Amina B.", "avatar_url": "https://i.pravatar.cc/150?u=amina"}', now(), now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'youssef@demo.ma', '{"username": "youssef.tech", "display_name": "Youssef Tech", "avatar_url": "https://i.pravatar.cc/150?u=youssef"}', now(), now()),
  ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'fatima@demo.ma', '{"username": "fatima.z", "display_name": "Fatima Zahra", "avatar_url": "https://i.pravatar.cc/150?u=fatima"}', now(), now());

-- Update profiles created by the trigger to add MA specific details
UPDATE profiles SET country = 'MA', currency = 'MAD' WHERE id IN (
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333333'
);

-- Style Profiles
INSERT INTO style_profiles (user_id, clothing_sizes, shoe_size, brands, colors, budget_min, budget_max)
VALUES
  ('11111111-1111-1111-1111-111111111111', '{"top": "M", "bottom": "M"}', '38', '{"Zara", "Mango", "IKEA"}', '{"Beige", "White", "Earth tones"}', 100, 2000),
  ('22222222-2222-2222-2222-222222222222', '{"top": "L", "bottom": "L"}', '42', '{"Apple", "Sony", "Nike"}', '{"Black", "Grey"}', 500, 10000),
  ('33333333-3333-3333-3333-333333333333', '{"top": "S", "bottom": "S"}', '37', '{"Sephora", "Flormar"}', '{"Pink", "Gold"}', 50, 1000);

-- Wishlists
INSERT INTO wishlists (id, owner_id, name, slug, occasion, event_date, privacy)
VALUES
  ('a1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'New Apartment Deco', 'new-apartment-deco', 'Moving', '2024-05-01', 'public'),
  ('a2222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'Birthday 2024', 'birthday-2024', 'Birthday', '2024-08-15', 'friends'),
  ('b1111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'Tech Setup Upgrade', 'tech-setup', 'Personal', NULL, 'public'),
  ('b2222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 'Gaming Gear', 'gaming-gear', 'Personal', NULL, 'friends'),
  ('c1111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 'Wedding Registry', 'wedding-registry', 'Wedding', '2024-09-10', 'public'),
  ('c2222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333', 'Summer Wardrobe', 'summer-wardrobe', 'Personal', NULL, 'private');

-- Items
INSERT INTO items (id, wishlist_id, title, store, current_price, currency, url, image_url)
VALUES
  -- Amina's Deco
  ('d1111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', 'STRANDMON Wing chair', 'IKEA Maroc', 2495.00, 'MAD', 'https://www.ikea.ma/en/products/living-room/armchairs', 'https://www.ikea.com/ma/en/images/products/strandmon-wing-chair-djuparp-dark-green__0837292_pe722709_s5.jpg'),
  ('d1111111-1111-1111-1111-111111111112', 'a1111111-1111-1111-1111-111111111111', 'Ceramic Vase', 'Zara Home', 399.00, 'MAD', 'https://www.zarahome.com/ma/', 'https://static.zarahome.net/8/photos4/2023/I/4/1/p/4320/046/250/4320046250_1_1_3.jpg'),
  -- Youssef's Tech
  ('d2222222-2222-2222-2222-222222222221', 'b1111111-1111-1111-1111-111111111111', 'Sony WH-1000XM5', 'Electroplanet', 3999.00, 'MAD', 'https://www.electroplanet.ma/', 'https://www.electroplanet.ma/media/catalog/product/cache/1/image/9df78eab33525d08d6e5fb8d27136e95/w/h/wh1000xm5b_1.jpg'),
  ('d2222222-2222-2222-2222-222222222222', 'b1111111-1111-1111-1111-111111111111', 'Logitech MX Master 3S', 'Jumia', 1250.00, 'MAD', 'https://www.jumia.ma/', 'https://ma.jumia.is/unsafe/fit-in/500x500/filters:fill(white)/product/84/647415/1.jpg'),
  -- Fatima's Wedding
  ('d3333333-3333-3333-3333-333333333331', 'c1111111-1111-1111-1111-111111111111', 'KitchenAid Artisan Mixer', 'Marjane', 5999.00, 'MAD', 'https://www.marjane.ma/', 'https://marjanemall.ma/media/catalog/product/k/i/kitchenaid-artisan.jpg'),
  ('d3333333-3333-3333-3333-333333333332', 'c1111111-1111-1111-1111-111111111111', 'Nespresso Essenza Mini', 'Nespresso Maroc', 1190.00, 'MAD', 'https://ma.buynespresso.com/', 'https://www.nespresso.com/ecom/medias/sys_master/public/1246182104332/C-Essenza-Mini-Black-Front-Reflection.jpg');

-- Friendships
INSERT INTO friendships (requester_id, addressee_id, status)
VALUES
  ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'accepted'),
  ('22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333', 'accepted'),
  ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 'pending');

-- Price Points (History)
INSERT INTO price_points (item_id, price, store, recorded_at)
VALUES
  ('d2222222-2222-2222-2222-222222222221', 4200.00, 'Electroplanet', now() - interval '60 days'),
  ('d2222222-2222-2222-2222-222222222221', 4100.00, 'Electroplanet', now() - interval '30 days'),
  ('d2222222-2222-2222-2222-222222222221', 3999.00, 'Electroplanet', now() - interval '5 days');

-- Store Offers
INSERT INTO store_offers (item_id, store, price, url)
VALUES
  ('d2222222-2222-2222-2222-222222222221', 'Jumia', 3850.00, 'https://www.jumia.ma/sony-wh-1000xm5'),
  ('d2222222-2222-2222-2222-222222222221', 'Virgin Megastore', 4199.00, 'https://virginmegastore.ma/sony');

-- Notifications
INSERT INTO notifications (user_id, type, title, body)
VALUES
  ('22222222-2222-2222-2222-222222222222', 'price_drop', 'Price dropped for Sony WH-1000XM5!', 'The price decreased from 4100 MAD to 3999 MAD at Electroplanet.'),
  ('33333333-3333-3333-3333-333333333333', 'friend_request', 'New friend request', 'Amina B. sent you a friend request.');
