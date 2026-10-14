-- Cache successful Shopping result sets so refreshes can spend page-inspection
-- capacity on later retailers without repeating an identical paid query.
ALTER TABLE public.retailer_search_cache
  DROP CONSTRAINT IF EXISTS retailer_search_cache_provider_check;
ALTER TABLE public.retailer_search_cache
  ADD CONSTRAINT retailer_search_cache_provider_check
    CHECK (provider IN ('tavily', 'searxng', 'serpapi'));
