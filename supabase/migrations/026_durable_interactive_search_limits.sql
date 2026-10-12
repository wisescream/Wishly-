-- Keep user-facing Shopping and image-search limits effective across Edge
-- Function isolates and concurrent requests.
CREATE TABLE IF NOT EXISTS public.interactive_provider_rate_limits (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  surface TEXT NOT NULL CHECK (surface IN ('product_search', 'image_search')),
  window_started_at TIMESTAMPTZ NOT NULL,
  request_count INTEGER NOT NULL CHECK (request_count BETWEEN 1 AND 20),
  PRIMARY KEY (user_id, surface),
  CHECK ((surface = 'product_search' AND request_count <= 20)
      OR (surface = 'image_search' AND request_count <= 5))
);

ALTER TABLE public.interactive_provider_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.interactive_provider_rate_limits FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.reserve_interactive_provider_request(p_surface TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_now TIMESTAMPTZ := now();
  v_window_seconds CONSTANT INTEGER := 60;
  v_max_requests INTEGER;
  v_reserved BOOLEAN;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to reserve a provider request' USING ERRCODE = '42501';
  END IF;

  v_max_requests := CASE p_surface
    WHEN 'product_search' THEN 20
    WHEN 'image_search' THEN 5
    ELSE NULL
  END;
  IF v_max_requests IS NULL THEN
    RAISE EXCEPTION 'Invalid interactive provider surface' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.interactive_provider_rate_limits(user_id, surface, window_started_at, request_count)
  VALUES (v_user_id, p_surface, v_now, 1)
  ON CONFLICT (user_id, surface) DO UPDATE
    SET window_started_at = CASE
          WHEN public.interactive_provider_rate_limits.window_started_at <= v_now - make_interval(secs => v_window_seconds)
            THEN v_now
          ELSE public.interactive_provider_rate_limits.window_started_at
        END,
        request_count = CASE
          WHEN public.interactive_provider_rate_limits.window_started_at <= v_now - make_interval(secs => v_window_seconds)
            THEN 1
          ELSE public.interactive_provider_rate_limits.request_count + 1
        END
    WHERE public.interactive_provider_rate_limits.window_started_at <= v_now - make_interval(secs => v_window_seconds)
       OR public.interactive_provider_rate_limits.request_count < v_max_requests
  RETURNING TRUE INTO v_reserved;

  RETURN COALESCE(v_reserved, FALSE);
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_interactive_provider_request(TEXT) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.reserve_interactive_provider_request(TEXT) TO authenticated;
