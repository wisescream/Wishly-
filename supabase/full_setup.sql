-- =====================================================================
-- WISHLY COMPLETE DATABASE SCHEMA & DEMO SEED
-- Project: pjpyfupkaubencuxnjyf
-- =====================================================================

-- 1. Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS "pg_cron";
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron not supported or already managed';
END $$;

-- 2. Enums
DO $$ BEGIN
  CREATE TYPE privacy_level AS ENUM ('private', 'friends', 'public');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE item_status AS ENUM ('wanted', 'reserved', 'purchased');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE friendship_status AS ENUM ('pending', 'accepted', 'declined', 'blocked');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- 3. Profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  birthday DATE,
  country TEXT DEFAULT 'MA',
  currency TEXT DEFAULT 'MAD',
  language TEXT DEFAULT 'en',
  is_premium BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Style profiles table
CREATE TABLE IF NOT EXISTS style_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  clothing_sizes JSONB DEFAULT '{}',
  shoe_size TEXT,
  brands TEXT[] DEFAULT '{}',
  colors TEXT[] DEFAULT '{}',
  style_tags TEXT[] DEFAULT '{}',
  budget_min NUMERIC,
  budget_max NUMERIC,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Wishlists table
CREATE TABLE IF NOT EXISTS wishlists (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  occasion TEXT,
  event_date DATE,
  cover_url TEXT,
  privacy privacy_level DEFAULT 'public',
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(owner_id, slug)
);

-- 6. Items table
CREATE TABLE IF NOT EXISTS items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wishlist_id UUID NOT NULL REFERENCES wishlists(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  image_url TEXT,
  url TEXT,
  store TEXT,
  current_price NUMERIC,
  currency TEXT DEFAULT 'MAD',
  priority INTEGER DEFAULT 2 CHECK (priority BETWEEN 1 AND 3),
  notes TEXT,
  status item_status DEFAULT 'wanted',
  target_price NUMERIC,
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 7. Price points table
CREATE TABLE IF NOT EXISTS price_points (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  price NUMERIC NOT NULL,
  store TEXT,
  recorded_at TIMESTAMPTZ DEFAULT now()
);

-- 8. Store offers table
CREATE TABLE IF NOT EXISTS store_offers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  store TEXT NOT NULL,
  price NUMERIC NOT NULL,
  url TEXT NOT NULL,
  affiliate_url TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 9. Reservations table (hidden from list owner)
CREATE TABLE IF NOT EXISTS reservations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  reserver_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(item_id)
);

-- 10. Friendships table
CREATE TABLE IF NOT EXISTS friendships (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  requester_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  addressee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status friendship_status DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(requester_id, addressee_id),
  CHECK (requester_id != addressee_id)
);

-- 11. Notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  payload JSONB,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_wishlists_owner ON wishlists(owner_id);
CREATE INDEX IF NOT EXISTS idx_wishlists_privacy ON wishlists(privacy);
CREATE INDEX IF NOT EXISTS idx_wishlists_slug ON wishlists(slug);
CREATE INDEX IF NOT EXISTS idx_items_wishlist ON items(wishlist_id);
CREATE INDEX IF NOT EXISTS idx_items_status ON items(status);
CREATE INDEX IF NOT EXISTS idx_price_points_item ON price_points(item_id);
CREATE INDEX IF NOT EXISTS idx_store_offers_item ON store_offers(item_id);
CREATE INDEX IF NOT EXISTS idx_reservations_item ON reservations(item_id);
CREATE INDEX IF NOT EXISTS idx_reservations_reserver ON reservations(reserver_id);
CREATE INDEX IF NOT EXISTS idx_friendships_requester ON friendships(requester_id);
CREATE INDEX IF NOT EXISTS idx_friendships_addressee ON friendships(addressee_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id) WHERE read_at IS NULL;

-- Triggers & functions
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public
AS $$
DECLARE
  base_username TEXT;
  final_username TEXT;
  suffix INT := 1;
BEGIN
  -- Extract username from metadata or email or fallback
  base_username := COALESCE(
    NULLIF(NEW.raw_user_meta_data->>'username', ''),
    split_part(NEW.email, '@', 1),
    'user_' || substr(NEW.id::text, 1, 8)
  );
  
  -- Clean username: only lowercase alphanumeric and underscores
  base_username := lower(regexp_replace(base_username, '[^a-zA-Z0-9_]', '_', 'g'));
  IF base_username = '' THEN
    base_username := 'user_' || substr(NEW.id::text, 1, 8);
  END IF;
  final_username := base_username;

  -- Ensure unique username without throwing collision error
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = final_username) LOOP
    final_username := base_username || '_' || suffix;
    suffix := suffix + 1;
  END LOOP;

  -- Insert profile
  INSERT INTO public.profiles (id, username, display_name, avatar_url)
  VALUES (
    NEW.id,
    final_username,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'display_name', ''), NULLIF(NEW.raw_user_meta_data->>'full_name', ''), final_username),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', '')
  )
  ON CONFLICT (id) DO UPDATE SET
    username = EXCLUDED.username,
    display_name = COALESCE(NULLIF(EXCLUDED.display_name, ''), public.profiles.display_name),
    avatar_url = COALESCE(NULLIF(EXCLUDED.avatar_url, ''), public.profiles.avatar_url);

  -- Also initialize an empty style_profile
  INSERT INTO public.style_profiles (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Log warning and return NEW so user signup in auth.users never fails
  RAISE WARNING 'handle_new_user failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
EXCEPTION WHEN undefined_column THEN
  -- Table does not have an updated_at column; skip silently
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at ON profiles;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON style_profiles;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON style_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON wishlists;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON wishlists FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON items;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON items FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON friendships;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON friendships FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE FUNCTION get_friend_ids(uid UUID)
RETURNS SETOF UUID AS $$
  SELECT addressee_id FROM friendships WHERE requester_id = uid AND status = 'accepted'
  UNION
  SELECT requester_id FROM friendships WHERE addressee_id = uid AND status = 'accepted';
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE VIEW items_for_owner AS
SELECT
  i.*,
  CASE WHEN EXISTS(SELECT 1 FROM reservations r WHERE r.item_id = i.id) THEN true ELSE false END AS is_reserved
FROM items i;

-- RLS setup
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE style_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE wishlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to allow re-running idempotently
DROP POLICY IF EXISTS profiles_select ON profiles;
DROP POLICY IF EXISTS profiles_update ON profiles;
DROP POLICY IF EXISTS style_profiles_all ON style_profiles;
DROP POLICY IF EXISTS wishlists_owner ON wishlists;
DROP POLICY IF EXISTS wishlists_public_read ON wishlists;
DROP POLICY IF EXISTS wishlists_friends_read ON wishlists;
DROP POLICY IF EXISTS items_owner ON items;
DROP POLICY IF EXISTS items_public_read ON items;
DROP POLICY IF EXISTS items_friends_read ON items;
DROP POLICY IF EXISTS price_points_read ON price_points;
DROP POLICY IF EXISTS price_points_insert ON price_points;
DROP POLICY IF EXISTS store_offers_read ON store_offers;
DROP POLICY IF EXISTS reservations_own ON reservations;
DROP POLICY IF EXISTS reservations_insert ON reservations;
DROP POLICY IF EXISTS friendships_own ON friendships;
DROP POLICY IF EXISTS friendships_insert ON friendships;
DROP POLICY IF EXISTS friendships_update ON friendships;
DROP POLICY IF EXISTS friendships_delete ON friendships;
DROP POLICY IF EXISTS notifications_own ON notifications;

CREATE POLICY profiles_select ON profiles FOR SELECT USING (true);
CREATE POLICY profiles_update ON profiles FOR UPDATE USING (auth.uid() = id);

CREATE POLICY style_profiles_all ON style_profiles FOR ALL USING (auth.uid() = user_id);

CREATE POLICY wishlists_owner ON wishlists FOR ALL USING (auth.uid() = owner_id);
CREATE POLICY wishlists_public_read ON wishlists FOR SELECT USING (privacy = 'public');
CREATE POLICY wishlists_friends_read ON wishlists FOR SELECT USING (
  privacy = 'friends' AND owner_id IN (SELECT get_friend_ids(auth.uid()))
);

CREATE POLICY items_owner ON items FOR ALL USING (
  wishlist_id IN (SELECT id FROM wishlists WHERE owner_id = auth.uid())
);
CREATE POLICY items_public_read ON items FOR SELECT USING (
  wishlist_id IN (SELECT id FROM wishlists WHERE privacy = 'public')
);
CREATE POLICY items_friends_read ON items FOR SELECT USING (
  wishlist_id IN (SELECT id FROM wishlists WHERE privacy = 'friends' AND owner_id IN (SELECT get_friend_ids(auth.uid())))
);

CREATE POLICY price_points_read ON price_points FOR SELECT USING (true);
CREATE POLICY price_points_insert ON price_points FOR INSERT WITH CHECK (
  item_id IN (SELECT id FROM items WHERE wishlist_id IN (SELECT id FROM wishlists WHERE owner_id = auth.uid()))
);

CREATE POLICY store_offers_read ON store_offers FOR SELECT USING (true);

CREATE POLICY reservations_own ON reservations FOR ALL USING (auth.uid() = reserver_id);
CREATE POLICY reservations_insert ON reservations FOR INSERT WITH CHECK (auth.uid() = reserver_id);

CREATE POLICY friendships_own ON friendships FOR SELECT USING (
  auth.uid() = requester_id OR auth.uid() = addressee_id
);
CREATE POLICY friendships_insert ON friendships FOR INSERT WITH CHECK (auth.uid() = requester_id);
CREATE POLICY friendships_update ON friendships FOR UPDATE USING (
  auth.uid() = addressee_id OR auth.uid() = requester_id
);
CREATE POLICY friendships_delete ON friendships FOR DELETE USING (
  auth.uid() = requester_id OR auth.uid() = addressee_id
);

CREATE POLICY notifications_own ON notifications FOR ALL USING (auth.uid() = user_id);

-- Storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('covers', 'covers', true) ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS avatar_upload ON storage.objects;
DROP POLICY IF EXISTS avatar_read ON storage.objects;
DROP POLICY IF EXISTS cover_upload ON storage.objects;
DROP POLICY IF EXISTS cover_read ON storage.objects;

CREATE POLICY avatar_upload ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]
);
CREATE POLICY avatar_read ON storage.objects FOR SELECT USING (bucket_id = 'avatars');
CREATE POLICY cover_upload ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'covers' AND auth.uid()::text = (storage.foldername(name))[1]
);
CREATE POLICY cover_read ON storage.objects FOR SELECT USING (bucket_id = 'covers');

-- =====================================================================
-- DEMO SEED DATA (Morocco)
-- =====================================================================

INSERT INTO auth.users (id, instance_id, role, aud, email, raw_user_meta_data, created_at, updated_at)
VALUES 
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'amina@demo.ma', '{"username": "amina_design", "display_name": "Amina B.", "avatar_url": "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150"}', now(), now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'youssef@demo.ma', '{"username": "youssef.tech", "display_name": "Youssef Tech", "avatar_url": "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150"}', now(), now()),
  ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'fatima@demo.ma', '{"username": "fatima.z", "display_name": "Fatima Zahra", "avatar_url": "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150"}', now(), now())
ON CONFLICT (id) DO NOTHING;

UPDATE profiles SET country = 'MA', currency = 'MAD' WHERE id IN (
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333333'
);

INSERT INTO style_profiles (user_id, clothing_sizes, shoe_size, brands, colors, budget_min, budget_max)
VALUES
  ('11111111-1111-1111-1111-111111111111', '{"top": "M", "bottom": "M"}', '38', '{"Zara", "Mango", "IKEA"}', '{"Beige", "White", "Earth tones"}', 100, 2000),
  ('22222222-2222-2222-2222-222222222222', '{"top": "L", "bottom": "L"}', '42', '{"Apple", "Sony", "Nike"}', '{"Black", "Grey"}', 500, 10000),
  ('33333333-3333-3333-3333-333333333333', '{"top": "S", "bottom": "S"}', '37', '{"Sephora", "Flormar"}', '{"Pink", "Gold"}', 50, 1000)
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO wishlists (id, owner_id, name, slug, occasion, event_date, privacy)
VALUES
  ('a1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'New Apartment Deco', 'new-apartment-deco', 'Moving', '2025-05-01', 'public'),
  ('a2222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'Birthday Wishlist', 'birthday-wishlist', 'Birthday', '2025-08-15', 'friends'),
  ('b1111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'Tech Setup Upgrade', 'tech-setup', 'Personal', NULL, 'public'),
  ('c1111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 'Wedding Registry', 'wedding-registry', 'Wedding', '2025-09-10', 'public')
ON CONFLICT (id) DO NOTHING;

INSERT INTO items (id, wishlist_id, title, store, current_price, currency, url, image_url)
VALUES
  ('d1111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', 'STRANDMON Wing chair', 'IKEA Maroc', 2495.00, 'MAD', 'https://www.ikea.ma/en/products/living-room/armchairs', 'https://images.unsplash.com/photo-1567538096630-e0c55bd6374c?w=500'),
  ('d1111111-1111-1111-1111-111111111112', 'a1111111-1111-1111-1111-111111111111', 'Ceramic Minimalist Vase', 'Zara Home', 399.00, 'MAD', 'https://www.zarahome.com/ma/', 'https://images.unsplash.com/photo-1578749556568-bc2c40e68b61?w=500'),
  ('d2222222-2222-2222-2222-222222222221', 'b1111111-1111-1111-1111-111111111111', 'Sony WH-1000XM5 Wireless Headphones', 'Electroplanet', 3999.00, 'MAD', 'https://www.electroplanet.ma/', 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500'),
  ('d2222222-2222-2222-2222-222222222222', 'b1111111-1111-1111-1111-111111111111', 'Logitech MX Master 3S', 'Jumia', 1250.00, 'MAD', 'https://www.jumia.ma/', 'https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?w=500'),
  ('d3333333-3333-3333-3333-333333333331', 'c1111111-1111-1111-1111-111111111111', 'KitchenAid Artisan Stand Mixer', 'Marjane', 5999.00, 'MAD', 'https://www.marjane.ma/', 'https://images.unsplash.com/photo-1594385208974-2e75f8d7bb48?w=500'),
  ('d3333333-3333-3333-3333-333333333332', 'c1111111-1111-1111-1111-111111111111', 'Nespresso Essenza Mini Black', 'Nespresso Maroc', 1190.00, 'MAD', 'https://ma.buynespresso.com/', 'https://images.unsplash.com/photo-1517668808822-9ebb02f2a0e6?w=500')
ON CONFLICT (id) DO NOTHING;

INSERT INTO price_points (item_id, price, store, recorded_at)
VALUES
  ('d2222222-2222-2222-2222-222222222221', 4200.00, 'Electroplanet', now() - interval '60 days'),
  ('d2222222-2222-2222-2222-222222222221', 4100.00, 'Electroplanet', now() - interval '30 days'),
  ('d2222222-2222-2222-2222-222222222221', 3999.00, 'Electroplanet', now() - interval '5 days');

INSERT INTO store_offers (item_id, store, price, url)
VALUES
  ('d2222222-2222-2222-2222-222222222221', 'Jumia', 3850.00, 'https://www.jumia.ma/sony-wh-1000xm5'),
  ('d2222222-2222-2222-2222-222222222221', 'Virgin Megastore', 4199.00, 'https://virginmegastore.ma/sony');

INSERT INTO friendships (requester_id, addressee_id, status)
VALUES
  ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'accepted'),
  ('22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333', 'accepted'),
  ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 'pending')
ON CONFLICT (requester_id, addressee_id) DO NOTHING;

INSERT INTO notifications (user_id, type, title, body)
VALUES
  ('22222222-2222-2222-2222-222222222222', 'price_drop', 'Price drop: Sony WH-1000XM5!', 'The price decreased to 3999 MAD at Electroplanet.'),
  ('33333333-3333-3333-3333-333333333333', 'friend_request', 'New friend request', 'Amina B. sent you a friend request.');
