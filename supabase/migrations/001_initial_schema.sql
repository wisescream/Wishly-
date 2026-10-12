-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS "pg_cron";
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron not supported or already managed';
END $$;

-- Enums
CREATE TYPE privacy_level AS ENUM ('private', 'friends', 'public');
CREATE TYPE item_status AS ENUM ('wanted', 'reserved', 'purchased');
CREATE TYPE friendship_status AS ENUM ('pending', 'accepted', 'declined', 'blocked');

-- profiles table (auto-created on sign-up via trigger)
CREATE TABLE profiles (
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

-- style_profiles
CREATE TABLE style_profiles (
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

-- wishlists
CREATE TABLE wishlists (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  occasion TEXT,
  event_date DATE,
  cover_url TEXT,
  privacy privacy_level DEFAULT 'private',
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(owner_id, slug)
);

-- items
CREATE TABLE items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wishlist_id UUID NOT NULL REFERENCES wishlists(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  image_url TEXT,
  url TEXT,
  store TEXT,
  current_price NUMERIC,
  currency TEXT DEFAULT 'MAD',
  priority INTEGER DEFAULT 1 CHECK (priority BETWEEN 1 AND 3),
  notes TEXT,
  status item_status DEFAULT 'wanted',
  target_price NUMERIC,
  position INTEGER DEFAULT 0,
  brand TEXT,
  model_number TEXT,
  gtin TEXT,
  variant_name TEXT,
  description TEXT,
  category TEXT,
  is_verified BOOLEAN DEFAULT false,
  enrichment_status TEXT DEFAULT 'manual',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- price_points (historical price tracking)
CREATE TABLE price_points (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  price NUMERIC NOT NULL,
  store TEXT NOT NULL,
  recorded_at TIMESTAMPTZ DEFAULT now()
);

-- store_offers (current offers across stores)
CREATE TABLE store_offers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  store TEXT NOT NULL,
  price NUMERIC NOT NULL,
  currency TEXT DEFAULT 'MAD',
  shipping_cost NUMERIC DEFAULT 0,
  taxes NUMERIC DEFAULT 0,
  total_price NUMERIC,
  condition TEXT DEFAULT 'new',
  availability TEXT DEFAULT 'in_stock',
  delivery_estimate TEXT,
  source TEXT DEFAULT 'manual',
  url TEXT NOT NULL,
  affiliate_url TEXT,
  last_verified_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(item_id, store)
);

-- reservations (hidden from list owner)
CREATE TABLE reservations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  reserver_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(item_id, reserver_id)
);

-- friendships
CREATE TABLE friendships (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  requester_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  addressee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status friendship_status DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(requester_id, addressee_id),
  CHECK (requester_id != addressee_id)
);

-- notifications
CREATE TABLE notifications (
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
CREATE INDEX idx_wishlists_owner ON wishlists(owner_id);
CREATE INDEX idx_wishlists_privacy ON wishlists(privacy);
CREATE INDEX idx_wishlists_slug ON wishlists(slug);
CREATE INDEX idx_items_wishlist ON items(wishlist_id);
CREATE INDEX idx_items_status ON items(status);
CREATE INDEX idx_price_points_item ON price_points(item_id);
CREATE INDEX idx_store_offers_item ON store_offers(item_id);
CREATE INDEX idx_reservations_item ON reservations(item_id);
CREATE INDEX idx_reservations_reserver ON reservations(reserver_id);
CREATE INDEX idx_friendships_requester ON friendships(requester_id);
CREATE INDEX idx_friendships_addressee ON friendships(addressee_id);
CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_unread ON notifications(user_id) WHERE read_at IS NULL;

-- Auto-create profile on sign-up trigger
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

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
EXCEPTION WHEN undefined_column THEN
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON style_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON wishlists FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON items FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON friendships FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Helper function to get friend IDs
CREATE OR REPLACE FUNCTION get_friend_ids(uid UUID)
RETURNS SETOF UUID AS $$
  SELECT addressee_id FROM friendships WHERE requester_id = uid AND status = 'accepted'
  UNION
  SELECT requester_id FROM friendships WHERE addressee_id = uid AND status = 'accepted';
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- View for items without reservation details (for list owners)
CREATE OR REPLACE VIEW items_for_owner AS
SELECT
  i.*,
  CASE WHEN EXISTS(SELECT 1 FROM reservations r WHERE r.item_id = i.id) THEN true ELSE false END AS is_reserved
FROM items i;

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE style_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE wishlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- PROFILES: Anyone can read, owners can update
CREATE POLICY profiles_select ON profiles FOR SELECT USING (true);
CREATE POLICY profiles_update ON profiles FOR UPDATE USING (auth.uid() = id);

-- STYLE_PROFILES: Owner only
CREATE POLICY style_profiles_all ON style_profiles FOR ALL USING (auth.uid() = user_id);

-- WISHLISTS
CREATE POLICY wishlists_owner ON wishlists FOR ALL USING (auth.uid() = owner_id);
CREATE POLICY wishlists_public_read ON wishlists FOR SELECT USING (privacy = 'public');
CREATE POLICY wishlists_friends_read ON wishlists FOR SELECT USING (
  privacy = 'friends' AND owner_id IN (SELECT get_friend_ids(auth.uid()))
);

-- ITEMS
CREATE POLICY items_owner ON items FOR ALL USING (
  wishlist_id IN (SELECT id FROM wishlists WHERE owner_id = auth.uid())
);
CREATE POLICY items_public_read ON items FOR SELECT USING (
  wishlist_id IN (SELECT id FROM wishlists WHERE privacy = 'public')
);
CREATE POLICY items_friends_read ON items FOR SELECT USING (
  wishlist_id IN (SELECT id FROM wishlists WHERE privacy = 'friends' AND owner_id IN (SELECT get_friend_ids(auth.uid())))
);

-- PRICE_POINTS: Read by item viewers, insert by system
CREATE POLICY price_points_read ON price_points FOR SELECT USING (true);
CREATE POLICY price_points_insert ON price_points FOR INSERT WITH CHECK (
  item_id IN (SELECT id FROM items WHERE wishlist_id IN (SELECT id FROM wishlists WHERE owner_id = auth.uid()))
);

-- STORE_OFFERS: Read by all, write by list owner
CREATE POLICY store_offers_read ON store_offers FOR SELECT USING (true);
CREATE POLICY store_offers_insert ON store_offers FOR INSERT WITH CHECK (
  item_id IN (SELECT id FROM items WHERE wishlist_id IN (SELECT id FROM wishlists WHERE owner_id = auth.uid()))
);
CREATE POLICY store_offers_update ON store_offers FOR UPDATE USING (
  item_id IN (SELECT id FROM items WHERE wishlist_id IN (SELECT id FROM wishlists WHERE owner_id = auth.uid()))
);
CREATE POLICY store_offers_delete ON store_offers FOR DELETE USING (
  item_id IN (SELECT id FROM items WHERE wishlist_id IN (SELECT id FROM wishlists WHERE owner_id = auth.uid()))
);

-- RESERVATIONS: Reserver sees their own only, owner NEVER sees
CREATE POLICY reservations_own ON reservations FOR ALL USING (auth.uid() = reserver_id);
CREATE POLICY reservations_insert ON reservations FOR INSERT WITH CHECK (auth.uid() = reserver_id);

-- FRIENDSHIPS
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

-- NOTIFICATIONS: Own only
CREATE POLICY notifications_own ON notifications FOR ALL USING (auth.uid() = user_id);

-- Storage buckets (run via Supabase dashboard or SQL)
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('covers', 'covers', true) ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY avatar_upload ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]
);
CREATE POLICY avatar_read ON storage.objects FOR SELECT USING (bucket_id = 'avatars');
CREATE POLICY cover_upload ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'covers' AND auth.uid()::text = (storage.foldername(name))[1]
);
CREATE POLICY cover_read ON storage.objects FOR SELECT USING (bucket_id = 'covers');
