-- =====================================================================
-- WISHLY MIGRATION 003: GLOBAL CATALOG, VARIANTS, & ENRICHMENT PIPELINE
-- =====================================================================

-- 1. Canonical Products Table
CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  brand TEXT,
  model_number TEXT,
  gtin TEXT, -- UPC, EAN, ISBN, GTIN-13/14
  description TEXT,
  primary_image_url TEXT,
  additional_images TEXT[] DEFAULT '{}',
  category TEXT,
  attributes JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Product Variants Table
CREATE TABLE IF NOT EXISTS public.product_variants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  name TEXT NOT NULL, -- e.g. "256GB - Natural Titanium"
  sku TEXT,
  gtin TEXT,
  color TEXT,
  size TEXT,
  capacity TEXT,
  condition TEXT DEFAULT 'new', -- 'new', 'refurbished', 'used'
  attributes JSONB DEFAULT '{}',
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Retailers Directory
CREATE TABLE IF NOT EXISTS public.retailers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  domain TEXT NOT NULL,
  country_code TEXT DEFAULT 'GLOBAL',
  logo_url TEXT,
  is_supported BOOLEAN DEFAULT true,
  affiliate_tag TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Import Jobs Table (Asynchronous tracking for URL, Search, Image OCR, Barcode)
CREATE TABLE IF NOT EXISTS public.import_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  import_type TEXT NOT NULL, -- 'url', 'search', 'image', 'barcode', 'manual'
  input_value TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing', -- 'processing', 'identified', 'searching_offers', 'offers_available', 'manual_confirmation', 'partial', 'no_matches', 'failed'
  extracted_data JSONB DEFAULT '{}',
  confidence_score NUMERIC,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Extend Wishlist Items
ALTER TABLE public.items 
  ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES public.product_variants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS brand TEXT,
  ADD COLUMN IF NOT EXISTS model_number TEXT,
  ADD COLUMN IF NOT EXISTS gtin TEXT,
  ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS enrichment_status TEXT DEFAULT 'manual';

-- 6. Extend Store Offers
ALTER TABLE public.store_offers
  ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS shipping_cost NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS taxes NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_price NUMERIC,
  ADD COLUMN IF NOT EXISTS condition TEXT DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS availability TEXT DEFAULT 'in_stock', -- 'in_stock', 'out_of_stock', 'preorder'
  ADD COLUMN IF NOT EXISTS delivery_estimate TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'scraper', -- 'json_ld', 'upcitemdb', 'openfoodfacts', 'google_shopping', 'manual'
  ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMPTZ DEFAULT now();

-- 7. Indexes for Fast Matching & Queries
CREATE INDEX IF NOT EXISTS idx_products_gtin ON public.products(gtin);
CREATE INDEX IF NOT EXISTS idx_products_brand_model ON public.products(brand, model_number);
CREATE INDEX IF NOT EXISTS idx_variants_product ON public.product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_variants_gtin ON public.product_variants(gtin);
CREATE INDEX IF NOT EXISTS idx_retailers_domain ON public.retailers(domain);
CREATE INDEX IF NOT EXISTS idx_import_jobs_user ON public.import_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_items_product ON public.items(product_id);
CREATE INDEX IF NOT EXISTS idx_items_gtin ON public.items(gtin);
CREATE INDEX IF NOT EXISTS idx_store_offers_verified ON public.store_offers(last_verified_at);

-- 8. Row Level Security for New Tables
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retailers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_jobs ENABLE ROW LEVEL SECURITY;

-- Products & Variants: readable by all, writable by authenticated
DROP POLICY IF EXISTS products_read_all ON public.products;
CREATE POLICY products_read_all ON public.products FOR SELECT USING (true);
DROP POLICY IF EXISTS products_write_auth ON public.products;
CREATE POLICY products_write_auth ON public.products FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS variants_read_all ON public.product_variants;
CREATE POLICY variants_read_all ON public.product_variants FOR SELECT USING (true);
DROP POLICY IF EXISTS variants_write_auth ON public.product_variants;
CREATE POLICY variants_write_auth ON public.product_variants FOR ALL USING (auth.role() = 'authenticated');

-- Retailers: readable by all
DROP POLICY IF EXISTS retailers_read_all ON public.retailers;
CREATE POLICY retailers_read_all ON public.retailers FOR SELECT USING (true);

-- Import Jobs: user can read/write their own jobs
DROP POLICY IF EXISTS import_jobs_user ON public.import_jobs;
CREATE POLICY import_jobs_user ON public.import_jobs FOR ALL USING (auth.uid() = user_id);

-- 9. Seed Initial Global & Regional Retailers
INSERT INTO public.retailers (name, domain, country_code, logo_url) VALUES
  ('Amazon', 'amazon.com', 'GLOBAL', 'https://www.google.com/s2/favicons?domain=amazon.com&sz=64'),
  ('Apple Store', 'apple.com', 'GLOBAL', 'https://www.google.com/s2/favicons?domain=apple.com&sz=64'),
  ('Best Buy', 'bestbuy.com', 'US', 'https://www.google.com/s2/favicons?domain=bestbuy.com&sz=64'),
  ('Walmart', 'walmart.com', 'US', 'https://www.google.com/s2/favicons?domain=walmart.com&sz=64'),
  ('Target', 'target.com', 'US', 'https://www.google.com/s2/favicons?domain=target.com&sz=64'),
  ('eBay', 'ebay.com', 'GLOBAL', 'https://www.google.com/s2/favicons?domain=ebay.com&sz=64'),
  ('AliExpress', 'aliexpress.com', 'GLOBAL', 'https://www.google.com/s2/favicons?domain=aliexpress.com&sz=64'),
  ('ASOS', 'asos.com', 'GLOBAL', 'https://www.google.com/s2/favicons?domain=asos.com&sz=64'),
  ('Zara', 'zara.com', 'GLOBAL', 'https://www.google.com/s2/favicons?domain=zara.com&sz=64'),
  ('Sephora', 'sephora.com', 'GLOBAL', 'https://www.google.com/s2/favicons?domain=sephora.com&sz=64'),
  ('IKEA', 'ikea.com', 'GLOBAL', 'https://www.google.com/s2/favicons?domain=ikea.com&sz=64'),
  ('Jumia', 'jumia.ma', 'MA', 'https://www.google.com/s2/favicons?domain=jumia.ma&sz=64'),
  ('Marjane', 'marjane.ma', 'MA', 'https://www.google.com/s2/favicons?domain=marjane.ma&sz=64'),
  ('Electroplanet', 'electroplanet.ma', 'MA', 'https://www.google.com/s2/favicons?domain=electroplanet.ma&sz=64')
ON CONFLICT (name) DO NOTHING;
