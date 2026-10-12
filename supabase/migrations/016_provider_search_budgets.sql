-- Durable daily search budgets prevent scheduled and manual refreshes from
-- exceeding provider quotas when many users/items are tracked.
CREATE TABLE IF NOT EXISTS public.provider_search_usage_daily (
  provider TEXT NOT NULL,
  usage_day DATE NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  PRIMARY KEY (provider, usage_day)
);

ALTER TABLE public.provider_search_usage_daily ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.provider_search_usage_daily FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.provider_search_usage_daily FROM service_role;

CREATE OR REPLACE FUNCTION public.reserve_provider_search(p_provider TEXT, p_daily_limit INTEGER)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_reserved BOOLEAN;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Only the service role can reserve provider usage' USING ERRCODE = '42501';
  END IF;
  IF p_provider NOT IN ('serpapi', 'openrouter') OR p_daily_limit < 1 OR p_daily_limit > 100000 THEN
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

CREATE INDEX IF NOT EXISTS idx_provider_search_usage_day
  ON public.provider_search_usage_daily(usage_day DESC);
