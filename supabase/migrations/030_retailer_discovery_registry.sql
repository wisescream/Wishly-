-- Expand the existing retailer directory and record evidence-backed discovery.
-- Seeded candidates start as `discovered`; only an inspected product page can
-- move a retailer to `validated`.
ALTER TABLE public.retailers
  ADD COLUMN IF NOT EXISTS canonical_domain TEXT,
  ADD COLUMN IF NOT EXISTS validation_status TEXT NOT NULL DEFAULT 'discovered',
  ADD COLUMN IF NOT EXISTS seller_type TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS categories TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS languages TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS shipping_countries TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS discovery_source TEXT NOT NULL DEFAULT 'seed',
  ADD COLUMN IF NOT EXISTS discovered_by_query TEXT,
  ADD COLUMN IF NOT EXISTS trust_evidence TEXT,
  ADD COLUMN IF NOT EXISTS extraction_capabilities JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS first_discovered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_inspected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_successful_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_error TEXT,
  ADD COLUMN IF NOT EXISTS retry_after TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reliability_score NUMERIC(4,3) NOT NULL DEFAULT 0.5;

UPDATE public.retailers
SET canonical_domain = lower(split_part(regexp_replace(domain, '^www\.', '', 'i'), '/', 1))
WHERE canonical_domain IS NULL OR canonical_domain = '';

ALTER TABLE public.retailers
  DROP CONSTRAINT IF EXISTS retailers_validation_status_check,
  ADD CONSTRAINT retailers_validation_status_check
    CHECK (validation_status IN ('discovered','pending_inspection','validated','restricted','temporarily_unavailable','rejected')),
  DROP CONSTRAINT IF EXISTS retailers_seller_type_check,
  ADD CONSTRAINT retailers_seller_type_check
    CHECK (seller_type IN ('official','authorized','independent','marketplace','reseller','outlet','second_hand','unknown')),
  DROP CONSTRAINT IF EXISTS retailers_reliability_score_check,
  ADD CONSTRAINT retailers_reliability_score_check CHECK (reliability_score BETWEEN 0 AND 1);

CREATE INDEX IF NOT EXISTS idx_retailers_canonical_domain
  ON public.retailers (canonical_domain) WHERE canonical_domain IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_retailers_validation_market
  ON public.retailers(validation_status, country_code, categories);
CREATE INDEX IF NOT EXISTS idx_retailers_retry_after
  ON public.retailers(retry_after) WHERE retry_after IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.retailer_discovery_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  retailer_id UUID REFERENCES public.retailers(id) ON DELETE SET NULL,
  canonical_domain TEXT NOT NULL,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  source_provider TEXT NOT NULL CHECK (source_provider IN ('tavily','serpapi','openrouter','seed','url_import')),
  source_query TEXT,
  source_url TEXT,
  outcome TEXT NOT NULL CHECK (outcome IN ('discovered','inspection_succeeded','inspection_failed','restricted','rejected','duplicate')),
  evidence JSONB NOT NULL DEFAULT '{}',
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_retailer_discovery_domain_created
  ON public.retailer_discovery_events(canonical_domain, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_retailer_discovery_product_created
  ON public.retailer_discovery_events(product_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.retailer_search_cache (
  query_hash TEXT PRIMARY KEY CHECK (query_hash ~ '^[a-f0-9]{64}$'),
  provider TEXT NOT NULL CHECK (provider = 'tavily'),
  results JSONB NOT NULL DEFAULT '[]',
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_retailer_search_cache_expiry ON public.retailer_search_cache(expires_at);

ALTER TABLE public.retailer_discovery_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.retailer_discovery_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.retailer_discovery_events TO service_role;
ALTER TABLE public.retailer_search_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.retailer_search_cache FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.retailer_search_cache TO service_role;

-- Extend existing atomic provider budgets and metrics for Tavily.
CREATE OR REPLACE FUNCTION public.reserve_provider_search(p_provider TEXT, p_daily_limit INTEGER)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_reserved BOOLEAN;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Only the service role can reserve provider usage' USING ERRCODE = '42501';
  END IF;
  IF p_provider NOT IN ('serpapi','openrouter','tavily') OR p_daily_limit < 1 OR p_daily_limit > 100000 THEN
    RAISE EXCEPTION 'Invalid provider search budget';
  END IF;
  INSERT INTO public.provider_search_usage_daily(provider, usage_day, request_count)
  VALUES (p_provider, (now() AT TIME ZONE 'UTC')::date, 1)
  ON CONFLICT (provider, usage_day) DO UPDATE
    SET request_count = public.provider_search_usage_daily.request_count + 1
    WHERE public.provider_search_usage_daily.request_count < p_daily_limit
  RETURNING TRUE INTO v_reserved;
  RETURN COALESCE(v_reserved, FALSE);
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_provider_search(TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_provider_search(TEXT, INTEGER) TO service_role;

ALTER TABLE public.provider_search_metrics DROP CONSTRAINT IF EXISTS provider_search_metrics_provider_check;
ALTER TABLE public.provider_search_metrics ADD CONSTRAINT provider_search_metrics_provider_check
  CHECK (provider IN ('serpapi','openrouter','tavily'));

-- Candidate domains are not asserted to be active or authorized. Inspection is
-- still required before validation.
INSERT INTO public.retailers (name, domain, canonical_domain, country_code, validation_status, seller_type, categories, languages, discovery_source, is_supported)
VALUES
('Jumia Morocco','jumia.ma','jumia.ma','MA','discovered','marketplace',ARRAY['fashion','shoes','accessories','general'],ARRAY['fr','ar'],'seed',false),
('Marjane Mall','marjanemall.ma','marjanemall.ma','MA','discovered','marketplace',ARRAY['fashion','shoes','accessories','general'],ARRAY['fr','ar'],'seed',false),
('Avito Morocco','avito.ma','avito.ma','MA','discovered','marketplace',ARRAY['fashion','shoes','accessories','second_hand'],ARRAY['fr','ar'],'seed',false),
('Marwa Morocco','marwa.com','marwa.com','MA','discovered','official',ARRAY['fashion'],ARRAY['fr','ar'],'seed',false),
('Diamantine Morocco','diamantine.com','diamantine.com','MA','discovered','official',ARRAY['fashion'],ARRAY['fr','ar'],'seed',false),
('LC Waikiki Morocco','lcwaikiki.ma','lcwaikiki.ma','MA','discovered','official',ARRAY['fashion','shoes'],ARRAY['fr','ar'],'seed',false),
('DeFacto Morocco','defacto.com','defacto.com','MA','discovered','official',ARRAY['fashion','shoes'],ARRAY['fr','ar'],'seed',false),
('Decathlon Morocco','decathlon.ma','decathlon.ma','MA','discovered','official',ARRAY['sportswear','shoes'],ARRAY['fr','ar'],'seed',false),
('Zara Morocco','zara.com','zara.com','MA','discovered','official',ARRAY['fashion','shoes','accessories'],ARRAY['fr','ar'],'seed',false),
('Mango Morocco','mango.com','mango.com','MA','discovered','official',ARRAY['fashion','shoes','accessories'],ARRAY['fr','ar'],'seed',false),
('H&M Morocco','hm.com','hm.com','MA','discovered','official',ARRAY['fashion','shoes','accessories'],ARRAY['fr','ar'],'seed',false),
('Kiabi Morocco','kiabi.com','kiabi.com','MA','discovered','official',ARRAY['fashion','shoes'],ARRAY['fr','ar'],'seed',false),
('Bershka Morocco','bershka.com','bershka.com','MA','discovered','official',ARRAY['fashion','shoes'],ARRAY['fr','ar'],'seed',false),
('Pull&Bear Morocco','pullandbear.com','pullandbear.com','MA','discovered','official',ARRAY['fashion','shoes'],ARRAY['fr','ar'],'seed',false),
('Stradivarius Morocco','stradivarius.com','stradivarius.com','MA','discovered','official',ARRAY['fashion','shoes'],ARRAY['fr','ar'],'seed',false),
('Oysho Morocco','oysho.com','oysho.com','MA','discovered','official',ARRAY['fashion','sportswear'],ARRAY['fr','ar'],'seed',false),
('Nike Morocco','nike.com','nike.com','MA','discovered','official',ARRAY['sportswear','shoes'],ARRAY['fr','ar','en'],'seed',false),
('Adidas Morocco','adidas.com','adidas.com','MA','discovered','official',ARRAY['sportswear','shoes'],ARRAY['fr','ar','en'],'seed',false),
('Puma Morocco','puma.com','puma.com','MA','discovered','official',ARRAY['sportswear','shoes'],ARRAY['fr','ar','en'],'seed',false),
('New Balance Morocco','newbalance.com','newbalance.com','MA','discovered','official',ARRAY['sportswear','shoes'],ARRAY['fr','ar','en'],'seed',false),
('Koton Morocco','koton.com','koton.com','MA','discovered','official',ARRAY['fashion','shoes'],ARRAY['fr','ar','tr'],'seed',false),
('Vinted France','vinted.fr','vinted.fr','FR','discovered','marketplace',ARRAY['fashion','shoes','second_hand'],ARRAY['fr'],'seed',false),
('Leboncoin France','leboncoin.fr','leboncoin.fr','FR','discovered','marketplace',ARRAY['fashion','shoes','second_hand'],ARRAY['fr'],'seed',false),
('La Redoute France','laredoute.fr','laredoute.fr','FR','discovered','independent',ARRAY['fashion','shoes'],ARRAY['fr'],'seed',false),
('Galeries Lafayette','galerieslafayette.com','galerieslafayette.com','FR','discovered','independent',ARRAY['fashion','shoes','accessories'],ARRAY['fr'],'seed',false),
('Printemps France','printemps.com','printemps.com','FR','discovered','independent',ARRAY['fashion','shoes','accessories'],ARRAY['fr'],'seed',false),
('Spartoo France','spartoo.com','spartoo.com','FR','discovered','independent',ARRAY['shoes','fashion'],ARRAY['fr'],'seed',false),
('Showroomprive France','showroomprive.com','showroomprive.com','FR','discovered','outlet',ARRAY['fashion','shoes'],ARRAY['fr'],'seed',false),
('Veepee France','veepee.fr','veepee.fr','FR','discovered','outlet',ARRAY['fashion','shoes'],ARRAY['fr'],'seed',false),
('Cdiscount France','cdiscount.com','cdiscount.com','FR','discovered','marketplace',ARRAY['fashion','shoes','general'],ARRAY['fr'],'seed',false),
('Gemo France','gemo.fr','gemo.fr','FR','discovered','independent',ARRAY['fashion','shoes'],ARRAY['fr'],'seed',false),
('Celio France','celio.com','celio.com','FR','discovered','official',ARRAY['fashion'],ARRAY['fr'],'seed',false),
('Etam France','etam.com','etam.com','FR','discovered','official',ARRAY['fashion','underwear'],ARRAY['fr'],'seed',false),
('Promod France','promod.fr','promod.fr','FR','discovered','official',ARRAY['fashion'],ARRAY['fr'],'seed',false),
('El Corte Ingles Spain','elcorteingles.es','elcorteingles.es','ES','discovered','independent',ARRAY['fashion','shoes','accessories'],ARRAY['es'],'seed',false),
('Mango Spain','shop.mango.com','shop.mango.com','ES','discovered','official',ARRAY['fashion','shoes','accessories'],ARRAY['es'],'seed',false),
('Massimo Dutti Spain','massimodutti.com','massimodutti.com','ES','discovered','official',ARRAY['fashion','shoes'],ARRAY['es'],'seed',false),
('Lefties Spain','lefties.com','lefties.com','ES','discovered','official',ARRAY['fashion','shoes'],ARRAY['es'],'seed',false),
('Springfield Spain','myspringfield.com','myspringfield.com','ES','discovered','official',ARRAY['fashion'],ARRAY['es'],'seed',false),
('Tradeinn Spain','tradeinn.com','tradeinn.com','ES','discovered','independent',ARRAY['sportswear','shoes'],ARRAY['es','en'],'seed',false),
('Parfois Portugal','parfois.com','parfois.com','PT','discovered','official',ARRAY['fashion','accessories'],ARRAY['pt'],'seed',false),
('La Redoute Portugal','laredoute.pt','laredoute.pt','PT','discovered','independent',ARRAY['fashion','shoes'],ARRAY['pt'],'seed',false),
('Zalando Germany','zalando.com','zalando.com','DE','discovered','marketplace',ARRAY['fashion','shoes'],ARRAY['de','en'],'seed',false),
('ABOUT YOU Germany','aboutyou.com','aboutyou.com','DE','discovered','independent',ARRAY['fashion','shoes'],ARRAY['de','en'],'seed',false),
('OTTO Germany','otto.de','otto.de','DE','discovered','marketplace',ARRAY['fashion','shoes'],ARRAY['de'],'seed',false),
('Breuninger Germany','breuninger.com','breuninger.com','DE','discovered','independent',ARRAY['fashion','shoes','accessories'],ARRAY['de'],'seed',false),
('Peek & Cloppenburg Germany','peek-cloppenburg.de','peek-cloppenburg.de','DE','discovered','independent',ARRAY['fashion','shoes'],ARRAY['de'],'seed',false),
('Bonprix Germany','bonprix.com','bonprix.com','DE','discovered','official',ARRAY['fashion'],ARRAY['de','en'],'seed',false),
('BestSecret Germany','bestsecret.com','bestsecret.com','DE','discovered','outlet',ARRAY['fashion','shoes'],ARRAY['de','en'],'seed',false),
('Boozt Nordics','boozt.com','boozt.com','SE','discovered','independent',ARRAY['fashion','shoes'],ARRAY['en','sv','da'],'seed',false),
('Sellpy Sweden','sellpy.com','sellpy.com','SE','discovered','second_hand',ARRAY['fashion','shoes','second_hand'],ARRAY['en','sv'],'seed',false),
('ASOS UK','asos.com','asos.com','GB','discovered','marketplace',ARRAY['fashion','shoes','accessories'],ARRAY['en'],'seed',false),
('Next UK','next.co.uk','next.co.uk','GB','discovered','independent',ARRAY['fashion','shoes'],ARRAY['en'],'seed',false),
('Marks & Spencer UK','marksandspencer.com','marksandspencer.com','GB','discovered','independent',ARRAY['fashion','shoes'],ARRAY['en'],'seed',false),
('John Lewis UK','johnlewis.com','johnlewis.com','GB','discovered','independent',ARRAY['fashion','shoes','accessories'],ARRAY['en'],'seed',false),
('River Island UK','riverisland.com','riverisland.com','GB','discovered','official',ARRAY['fashion','shoes'],ARRAY['en'],'seed',false),
('Boohoo UK','boohoo.com','boohoo.com','GB','discovered','official',ARRAY['fashion'],ARRAY['en'],'seed',false),
('JD Sports UK','jdsports.co.uk','jdsports.co.uk','GB','discovered','independent',ARRAY['sportswear','shoes'],ARRAY['en'],'seed',false),
('END Clothing UK','endclothing.com','endclothing.com','GB','discovered','independent',ARRAY['fashion','shoes'],ARRAY['en'],'seed',false),
('MandM UK','mandmdirect.com','mandmdirect.com','GB','discovered','outlet',ARRAY['fashion','shoes','sportswear'],ARRAY['en'],'seed',false),
('TK Maxx UK','tkmaxx.com','tkmaxx.com','GB','discovered','outlet',ARRAY['fashion','shoes','accessories'],ARRAY['en'],'seed',false),
('YOOX Italy','yoox.com','yoox.com','IT','discovered','outlet',ARRAY['fashion','shoes','accessories'],ARRAY['it','en'],'seed',false),
('LuisaViaRoma Italy','luisaviaroma.com','luisaviaroma.com','IT','discovered','independent',ARRAY['fashion','shoes','accessories'],ARRAY['it','en'],'seed',false),
('Farfetch','farfetch.com','farfetch.com','GB','discovered','marketplace',ARRAY['fashion','shoes','accessories'],ARRAY['en'],'seed',false),
('SSENSE','ssense.com','ssense.com','CA','discovered','independent',ARRAY['fashion','shoes','accessories'],ARRAY['en','fr'],'seed',false),
('Mytheresa','mytheresa.com','mytheresa.com','DE','discovered','independent',ARRAY['fashion','shoes','accessories'],ARRAY['de','en'],'seed',false),
('Net-a-Porter','net-a-porter.com','net-a-porter.com','GB','discovered','independent',ARRAY['fashion','shoes','accessories'],ARRAY['en'],'seed',false),
('THE OUTNET','theoutnet.com','theoutnet.com','GB','discovered','outlet',ARRAY['fashion','shoes','accessories'],ARRAY['en'],'seed',false),
('OVS Italy','ovs.it','ovs.it','IT','discovered','official',ARRAY['fashion'],ARRAY['it'],'seed',false),
('Trendyol Turkey','trendyol.com','trendyol.com','TR','discovered','marketplace',ARRAY['fashion','shoes','accessories'],ARRAY['tr'],'seed',false),
('Modanisa Turkey','modanisa.com','modanisa.com','TR','discovered','marketplace',ARRAY['fashion'],ARRAY['tr','en','ar'],'seed',false),
('Boyner Turkey','boyner.com.tr','boyner.com.tr','TR','discovered','marketplace',ARRAY['fashion','shoes'],ARRAY['tr'],'seed',false),
('Hepsiburada Turkey','hepsiburada.com','hepsiburada.com','TR','discovered','marketplace',ARRAY['fashion','shoes','general'],ARRAY['tr'],'seed',false),
('FLO Turkey','flo.com.tr','flo.com.tr','TR','discovered','independent',ARRAY['shoes'],ARRAY['tr'],'seed',false),
('Vinted US','vinted.com','vinted.com','US','discovered','marketplace',ARRAY['fashion','shoes','second_hand'],ARRAY['en'],'seed',false),
('eBay US','ebay.com','ebay.com','US','discovered','marketplace',ARRAY['fashion','shoes','accessories','second_hand'],ARRAY['en'],'seed',false),
('Nordstrom US','nordstrom.com','nordstrom.com','US','discovered','independent',ARRAY['fashion','shoes','accessories'],ARRAY['en'],'seed',false),
('Macy’s US','macys.com','macys.com','US','discovered','independent',ARRAY['fashion','shoes','accessories'],ARRAY['en'],'seed',false),
('Bloomingdale’s US','bloomingdales.com','bloomingdales.com','US','discovered','independent',ARRAY['fashion','shoes','accessories'],ARRAY['en'],'seed',false),
('Shopbop US','shopbop.com','shopbop.com','US','discovered','independent',ARRAY['fashion','shoes','accessories'],ARRAY['en'],'seed',false),
('Revolve US','revolve.com','revolve.com','US','discovered','independent',ARRAY['fashion','shoes'],ARRAY['en'],'seed',false),
('Aritzia Canada','aritzia.com','aritzia.com','CA','discovered','official',ARRAY['fashion'],ARRAY['en','fr'],'seed',false),
('Simons Canada','simons.ca','simons.ca','CA','discovered','independent',ARRAY['fashion','shoes'],ARRAY['en','fr'],'seed',false),
('Nike Global','nike.com','nike.com','GLOBAL','discovered','official',ARRAY['sportswear','shoes'],ARRAY['en'],'seed',false),
('Adidas Global','adidas.com','adidas.com','GLOBAL','discovered','official',ARRAY['sportswear','shoes'],ARRAY['en'],'seed',false),
('ASICS Global','asics.com','asics.com','GLOBAL','discovered','official',ARRAY['sportswear','shoes'],ARRAY['en'],'seed',false),
('Foot Locker','footlocker.com','footlocker.com','US','discovered','independent',ARRAY['sportswear','shoes'],ARRAY['en'],'seed',false),
('Sneakersnstuff','sneakersnstuff.com','sneakersnstuff.com','SE','discovered','independent',ARRAY['sportswear','shoes'],ARRAY['en'],'seed',false),
('StockX','stockx.com','stockx.com','US','discovered','marketplace',ARRAY['sportswear','shoes','resale'],ARRAY['en'],'seed',false),
('GOAT','goat.com','goat.com','US','discovered','marketplace',ARRAY['sportswear','shoes','resale'],ARRAY['en'],'seed',false),
('Depop','depop.com','depop.com','GB','discovered','marketplace',ARRAY['fashion','shoes','second_hand'],ARRAY['en'],'seed',false),
('Grailed','grailed.com','grailed.com','US','discovered','marketplace',ARRAY['fashion','shoes','second_hand'],ARRAY['en'],'seed',false),
('Poshmark','poshmark.com','poshmark.com','US','discovered','marketplace',ARRAY['fashion','shoes','second_hand'],ARRAY['en'],'seed',false),
('Mercari','mercari.com','mercari.com','US','discovered','marketplace',ARRAY['fashion','shoes','second_hand'],ARRAY['en'],'seed',false),
('Vestiaire Collective','vestiairecollective.com','vestiairecollective.com','FR','discovered','marketplace',ARRAY['fashion','shoes','accessories','second_hand'],ARRAY['fr','en'],'seed',false),
('The RealReal','therealreal.com','therealreal.com','US','discovered','reseller',ARRAY['fashion','shoes','accessories','second_hand'],ARRAY['en'],'seed',false),
('Wallapop','wallapop.com','wallapop.com','ES','discovered','marketplace',ARRAY['fashion','shoes','second_hand'],ARRAY['es'],'seed',false),
('Vinted UK','vinted.co.uk','vinted.co.uk','GB','discovered','marketplace',ARRAY['fashion','shoes','second_hand'],ARRAY['en'],'seed',false),
('SHEIN','shein.com','shein.com','GLOBAL','discovered','marketplace',ARRAY['fashion','shoes','accessories'],ARRAY['en'],'seed',false),
('AliExpress','aliexpress.com','aliexpress.com','GLOBAL','discovered','marketplace',ARRAY['fashion','shoes','accessories'],ARRAY['en'],'seed',false),
('Temu','temu.com','temu.com','GLOBAL','discovered','marketplace',ARRAY['fashion','shoes','accessories'],ARRAY['en'],'seed',false),
('Taobao','taobao.com','taobao.com','CN','discovered','marketplace',ARRAY['fashion','shoes','accessories'],ARRAY['zh'],'seed',false),
('ZOZOTOWN','zozo.jp','zozo.jp','JP','discovered','marketplace',ARRAY['fashion','shoes'],ARRAY['ja'],'seed',false),
('YesStyle','yesstyle.com','yesstyle.com','HK','discovered','marketplace',ARRAY['fashion','accessories'],ARRAY['en'],'seed',false),
('Cotton On','cottonon.com','cottonon.com','AU','discovered','official',ARRAY['fashion','shoes'],ARRAY['en'],'seed',false),
('The Iconic','theiconic.com.au','theiconic.com.au','AU','discovered','marketplace',ARRAY['fashion','shoes','accessories'],ARRAY['en'],'seed',false),
('Nordstrom Rack','nordstromrack.com','nordstromrack.com','US','discovered','outlet',ARRAY['fashion','shoes','accessories'],ARRAY['en'],'seed',false),
('Saks OFF 5TH','saksoff5th.com','saksoff5th.com','US','discovered','outlet',ARRAY['fashion','shoes','accessories'],ARRAY['en'],'seed',false),
('BrandAlley','brandalley.co.uk','brandalley.co.uk','GB','discovered','outlet',ARRAY['fashion','shoes'],ARRAY['en'],'seed',false)
ON CONFLICT (name) DO UPDATE SET
  canonical_domain = EXCLUDED.canonical_domain,
  country_code = EXCLUDED.country_code,
  seller_type = EXCLUDED.seller_type,
  categories = EXCLUDED.categories,
  languages = EXCLUDED.languages,
  validation_status = CASE WHEN public.retailers.validation_status = 'validated' THEN 'validated' ELSE 'discovered' END;
