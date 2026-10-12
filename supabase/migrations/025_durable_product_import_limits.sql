-- Enforce URL import limits atomically across Edge Function isolates.
CREATE TABLE IF NOT EXISTS public.product_import_rate_limits (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  window_started_at TIMESTAMPTZ NOT NULL,
  request_count INTEGER NOT NULL CHECK (request_count BETWEEN 1 AND 10)
);

ALTER TABLE public.product_import_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.product_import_rate_limits FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.reserve_product_import()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_now TIMESTAMPTZ := now();
  v_window_seconds CONSTANT INTEGER := 60;
  v_max_requests CONSTANT INTEGER := 10;
  v_reserved BOOLEAN;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to reserve a product import' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.product_import_rate_limits(user_id, window_started_at, request_count)
  VALUES (v_user_id, v_now, 1)
  ON CONFLICT (user_id) DO UPDATE
    SET window_started_at = CASE
          WHEN public.product_import_rate_limits.window_started_at <= v_now - make_interval(secs => v_window_seconds)
            THEN v_now
          ELSE public.product_import_rate_limits.window_started_at
        END,
        request_count = CASE
          WHEN public.product_import_rate_limits.window_started_at <= v_now - make_interval(secs => v_window_seconds)
            THEN 1
          ELSE public.product_import_rate_limits.request_count + 1
        END
    WHERE public.product_import_rate_limits.window_started_at <= v_now - make_interval(secs => v_window_seconds)
       OR public.product_import_rate_limits.request_count < v_max_requests
  RETURNING TRUE INTO v_reserved;

  RETURN COALESCE(v_reserved, FALSE);
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_product_import() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.reserve_product_import() TO authenticated;
