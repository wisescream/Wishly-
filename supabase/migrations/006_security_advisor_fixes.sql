-- Make the reservation view obey the caller's table privileges and RLS.
ALTER VIEW public.item_reserved SET (security_invoker = true);

-- Trigger functions are invoked through their installed triggers; clients do
-- not need permission to call signup initialization directly over PostgREST.
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- Friend-list RLS uses this helper for authenticated readers only.
ALTER FUNCTION public.is_friend(UUID, UUID) SET search_path = public;
REVOKE ALL ON FUNCTION public.is_friend(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_friend(UUID, UUID) TO authenticated;

-- The wishlist limit trigger reads these public-schema tables by name.
ALTER FUNCTION public.enforce_list_limit() SET search_path = public;
