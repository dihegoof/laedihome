CREATE OR REPLACE FUNCTION public.is_household_owner(_household_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.households
    WHERE id = _household_id AND owner_id = auth.uid()
  )
$$;

REVOKE ALL ON FUNCTION public.is_household_owner(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_household_owner(uuid) TO authenticated, service_role;