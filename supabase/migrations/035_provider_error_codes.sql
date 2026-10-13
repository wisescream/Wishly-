-- Keep structured provider failure reasons without retaining raw search
-- queries, provider response bodies, or credentials in operational metrics.
ALTER TABLE public.provider_search_metrics
  ADD COLUMN IF NOT EXISTS error_code TEXT;

ALTER TABLE public.provider_search_metrics
  DROP CONSTRAINT IF EXISTS provider_search_metrics_error_code_check,
  ADD CONSTRAINT provider_search_metrics_error_code_check CHECK (
    error_code IS NULL OR error_code IN (
      'missing_query', 'invalid_request', 'invalid_api_key', 'account_access',
      'insufficient_credits', 'rate_limited', 'invalid_engine', 'provider_error',
      'invalid_response', 'network_error', 'provider_unavailable', 'unknown'
    )
  );

CREATE INDEX IF NOT EXISTS idx_provider_search_metrics_error_code_created
  ON public.provider_search_metrics(error_code, created_at DESC)
  WHERE error_code IS NOT NULL;
