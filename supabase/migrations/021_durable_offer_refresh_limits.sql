-- Enforce manual offer-refresh limits across Edge Function isolates and
-- concurrent requests. The caller must first validate item ownership; only
-- the service role may reserve a user's refresh slot.
CREATE TABLE IF NOT EXISTS public.interactive_offer_refresh_limits (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  window_started_at TIMESTAMPTZ NOT NULL,
  request_count INTEGER NOT NULL CHECK (request_count BETWEEN 1 AND 10)
);

ALTER TABLE public.interactive_offer_refresh_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.interactive_offer_refresh_limits FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.interactive_offer_refresh_limits FROM service_role;

CREATE OR REPLACE FUNCTION public.reserve_interactive_offer_refresh(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
  v_window_seconds CONSTANT INTEGER := 300;
  v_max_requests CONSTANT INTEGER := 10;
  v_reserved BOOLEAN;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Only the service role can reserve interactive refreshes' USING ERRCODE = '42501';
  END IF;
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'A user id is required';
  END IF;

  INSERT INTO public.interactive_offer_refresh_limits(user_id, window_started_at, request_count)
  VALUES (p_user_id, v_now, 1)
  ON CONFLICT (user_id) DO UPDATE
    SET window_started_at = CASE
          WHEN public.interactive_offer_refresh_limits.window_started_at <= v_now - make_interval(secs => v_window_seconds)
            THEN v_now
          ELSE public.interactive_offer_refresh_limits.window_started_at
        END,
        request_count = CASE
          WHEN public.interactive_offer_refresh_limits.window_started_at <= v_now - make_interval(secs => v_window_seconds)
            THEN 1
          ELSE public.interactive_offer_refresh_limits.request_count + 1
        END
    WHERE public.interactive_offer_refresh_limits.window_started_at <= v_now - make_interval(secs => v_window_seconds)
       OR public.interactive_offer_refresh_limits.request_count < v_max_requests
  RETURNING TRUE INTO v_reserved;

  RETURN COALESCE(v_reserved, FALSE);
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_interactive_offer_refresh(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_interactive_offer_refresh(UUID) TO service_role;
