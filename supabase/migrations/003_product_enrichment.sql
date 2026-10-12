-- Migration 003: Product enrichment and store offers schema upgrade

-- 1. Add missing enrichment columns to items table
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS brand TEXT;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS model_number TEXT;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS gtin TEXT;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS variant_name TEXT;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS enrichment_status TEXT DEFAULT 'manual';

-- 2. Add missing columns to store_offers table
ALTER TABLE public.store_offers ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'MAD';
ALTER TABLE public.store_offers ADD COLUMN IF NOT EXISTS shipping_cost NUMERIC DEFAULT 0;
ALTER TABLE public.store_offers ADD COLUMN IF NOT EXISTS taxes NUMERIC DEFAULT 0;
ALTER TABLE public.store_offers ADD COLUMN IF NOT EXISTS total_price NUMERIC;
ALTER TABLE public.store_offers ADD COLUMN IF NOT EXISTS condition TEXT DEFAULT 'new';
ALTER TABLE public.store_offers ADD COLUMN IF NOT EXISTS availability TEXT DEFAULT 'in_stock';
ALTER TABLE public.store_offers ADD COLUMN IF NOT EXISTS delivery_estimate TEXT;
ALTER TABLE public.store_offers ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';
ALTER TABLE public.store_offers ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMPTZ DEFAULT now();

-- 3. Ensure store_offers RLS policies allow insertion and update by item owners
DROP POLICY IF EXISTS store_offers_insert ON public.store_offers;
CREATE POLICY store_offers_insert ON public.store_offers FOR INSERT WITH CHECK (
  item_id IN (SELECT id FROM public.items WHERE wishlist_id IN (SELECT id FROM public.wishlists WHERE owner_id = auth.uid()))
);

DROP POLICY IF EXISTS store_offers_update ON public.store_offers;
CREATE POLICY store_offers_update ON public.store_offers FOR UPDATE USING (
  item_id IN (SELECT id FROM public.items WHERE wishlist_id IN (SELECT id FROM public.wishlists WHERE owner_id = auth.uid()))
);

DROP POLICY IF EXISTS store_offers_delete ON public.store_offers;
CREATE POLICY store_offers_delete ON public.store_offers FOR DELETE USING (
  item_id IN (SELECT id FROM public.items WHERE wishlist_id IN (SELECT id FROM public.wishlists WHERE owner_id = auth.uid()))
);

-- 4. Re-apply resilient handle_new_user trigger
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
  RAISE WARNING 'handle_new_user failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
