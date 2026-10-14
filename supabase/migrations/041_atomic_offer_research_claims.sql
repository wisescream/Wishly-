-- Lease due tracked items atomically so overlapping 15-minute ticks cannot
-- research the same item concurrently. Unfinished leases expire automatically.
ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS offer_research_lease_until TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_items_due_offer_research
  ON public.items(next_offer_search_at, offer_research_lease_until, created_at)
  WHERE status = 'wanted';

CREATE OR REPLACE FUNCTION public.claim_due_offer_research_items(
  p_limit INTEGER DEFAULT 24,
  p_lease_minutes INTEGER DEFAULT 45
) RETURNS TABLE(id UUID)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Only the service role can claim offer research' USING ERRCODE = '42501';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100 OR p_lease_minutes IS NULL OR p_lease_minutes < 5 OR p_lease_minutes > 120 THEN
    RAISE EXCEPTION 'Invalid offer research lease parameters';
  END IF;

  RETURN QUERY
  WITH due AS (
    SELECT i.id
    FROM public.items i
    WHERE i.status = 'wanted'
      AND (i.next_offer_search_at IS NULL OR i.next_offer_search_at <= now())
      AND (i.offer_research_lease_until IS NULL OR i.offer_research_lease_until <= now())
    ORDER BY i.next_offer_search_at ASC NULLS FIRST, i.target_price ASC NULLS LAST,
      i.priority DESC, i.created_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  ), leased AS (
    UPDATE public.items i
      SET offer_research_lease_until = now() + make_interval(mins => p_lease_minutes)
    FROM due
    WHERE i.id = due.id
    RETURNING i.id
  )
  SELECT leased.id FROM leased;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_due_offer_research_items(INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_due_offer_research_items(INTEGER, INTEGER) TO service_role;
