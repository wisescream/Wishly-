-- Permit an operator-configured SearXNG instance as a free, self-hosted
-- fallback for public web-search leads. It is never treated as offer evidence.
ALTER TABLE public.provider_search_metrics
  DROP CONSTRAINT IF EXISTS provider_search_metrics_provider_check;
ALTER TABLE public.provider_search_metrics
  ADD CONSTRAINT provider_search_metrics_provider_check
    CHECK (provider IN ('serpapi','openrouter','tavily','searxng'));

ALTER TABLE public.retailer_search_cache
  DROP CONSTRAINT IF EXISTS retailer_search_cache_provider_check;
ALTER TABLE public.retailer_search_cache
  ADD CONSTRAINT retailer_search_cache_provider_check
    CHECK (provider IN ('tavily','searxng'));

CREATE OR REPLACE FUNCTION public.reserve_provider_search(p_provider TEXT, p_daily_limit INTEGER)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_reserved BOOLEAN;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Only the service role can reserve provider usage' USING ERRCODE = '42501';
  END IF;
  IF p_provider NOT IN ('serpapi','openrouter','tavily','searxng') OR p_daily_limit < 1 OR p_daily_limit > 100000 THEN
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
