CREATE OR REPLACE FUNCTION public.current_household()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT household_id
  FROM public.profiles
  WHERE id = auth.uid()
$$;

REVOKE ALL ON FUNCTION public.current_household() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_household() TO authenticated, service_role;