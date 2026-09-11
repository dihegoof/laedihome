REVOKE ALL ON FUNCTION public.current_household() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.email_for_name(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.join_household(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_household_owner(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.current_household() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.email_for_name(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.join_household(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_household_owner(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;