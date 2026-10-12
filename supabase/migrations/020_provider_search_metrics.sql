-- Operational provider metrics omit raw queries and user identifiers. They are
-- written only by Edge Functions so usage and cost can be audited safely.
CREATE TABLE IF NOT EXISTS public.provider_search_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL CHECK (provider IN ('serpapi', 'openrouter')),
  surface TEXT NOT NULL CHECK (surface IN ('interactive', 'scheduled')),
  outcome TEXT NOT NULL CHECK (outcome IN ('success', 'error', 'budget_exhausted')),
  request_count INTEGER NOT NULL DEFAULT 1 CHECK (request_count IN (0, 1)),
  search_count INTEGER CHECK (search_count IS NULL OR search_count >= 0),
  result_count INTEGER NOT NULL DEFAULT 0 CHECK (result_count >= 0),
  duration_ms INTEGER NOT NULL DEFAULT 0 CHECK (duration_ms >= 0),
  status_code INTEGER CHECK (status_code BETWEEN 100 AND 599),
  estimated_cost_usd NUMERIC(12, 6) CHECK (estimated_cost_usd IS NULL OR estimated_cost_usd >= 0),
  market_country TEXT CHECK (market_country IS NULL OR market_country ~ '^[A-Z]{2}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.provider_search_metrics ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.provider_search_metrics FROM PUBLIC, anon, authenticated;
GRANT INSERT, SELECT ON public.provider_search_metrics TO service_role;

CREATE INDEX IF NOT EXISTS idx_provider_search_metrics_provider_created
  ON public.provider_search_metrics(provider, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_provider_search_metrics_surface_created
  ON public.provider_search_metrics(surface, created_at DESC);
