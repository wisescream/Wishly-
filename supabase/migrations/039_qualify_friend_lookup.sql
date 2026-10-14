-- Resolve the relation explicitly inside the SECURITY DEFINER helper so
-- friend-scoped RLS checks do not depend on the caller's search_path.
CREATE OR REPLACE FUNCTION public.get_friend_ids(uid UUID)
RETURNS SETOF UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT addressee_id
  FROM public.friendships
  WHERE requester_id = uid AND status = 'accepted'
  UNION
  SELECT requester_id
  FROM public.friendships
  WHERE addressee_id = uid AND status = 'accepted';
$$;
