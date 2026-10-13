-- Retain the provider that surfaced a retailer lead in discovery history.
ALTER TABLE public.retailer_discovery_events
  DROP CONSTRAINT IF EXISTS retailer_discovery_events_source_provider_check;
ALTER TABLE public.retailer_discovery_events
  ADD CONSTRAINT retailer_discovery_events_source_provider_check
    CHECK (source_provider IN ('tavily','serpapi','openrouter','searxng','seed','url_import'));
