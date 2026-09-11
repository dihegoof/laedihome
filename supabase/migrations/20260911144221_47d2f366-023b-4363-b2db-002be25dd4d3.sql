DROP POLICY IF EXISTS households_insert_any ON public.households;
CREATE POLICY households_insert_self ON public.households
FOR INSERT TO authenticated
WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS households_update_member ON public.households;
CREATE POLICY households_update_member ON public.households
FOR UPDATE TO authenticated
USING (id = public.current_household())
WITH CHECK (
  id = public.current_household()
  AND owner_id = (SELECT h.owner_id FROM public.households h WHERE h.id = public.current_household())
);

CREATE OR REPLACE FUNCTION public.current_household()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT household_id FROM public.profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.email_for_name(_name text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT email FROM public.profiles WHERE lower(name) = lower(trim(_name)) LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.email_for_name(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.email_for_name(text) TO authenticated;
REVOKE ALL ON FUNCTION public.current_household() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_household() TO authenticated, service_role;