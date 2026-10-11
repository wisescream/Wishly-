-- Friend visibility only needs rows already visible to the caller under RLS.
-- Run the policy helper as the caller rather than bypassing those row checks.
CREATE OR REPLACE FUNCTION public.is_friend(a UUID, b UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.friendships
    WHERE status = 'accepted'
      AND ((requester_id = a AND addressee_id = b)
        OR (requester_id = b AND addressee_id = a))
  );
$$;

REVOKE ALL ON FUNCTION public.is_friend(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_friend(UUID, UUID) TO authenticated;
