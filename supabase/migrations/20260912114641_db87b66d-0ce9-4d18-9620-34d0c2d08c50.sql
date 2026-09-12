DROP TRIGGER IF EXISTS prevent_direct_household_change_trigger ON public.profiles;
DROP FUNCTION IF EXISTS public.prevent_direct_household_change();

CREATE OR REPLACE FUNCTION public.protect_profile_household_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.household_id IS DISTINCT FROM OLD.household_id
     AND COALESCE(current_setting('app.join_household_allowed', true), '') <> auth.uid()::text THEN
    RAISE EXCEPTION 'Use um código de convite válido para entrar em outra casa';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_profile_household_change() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.protect_profile_household_change() TO service_role;

DROP TRIGGER IF EXISTS protect_profile_household_change ON public.profiles;
CREATE TRIGGER protect_profile_household_change
BEFORE UPDATE OF household_id ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_profile_household_change();

CREATE OR REPLACE FUNCTION public.join_household(_code text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _hid uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT id INTO _hid FROM public.households WHERE upper(invite_code) = upper(trim(_code));
  IF _hid IS NULL THEN RAISE EXCEPTION 'Código inválido'; END IF;
  PERFORM set_config('app.join_household_allowed', auth.uid()::text, true);
  UPDATE public.profiles SET household_id = _hid WHERE id = auth.uid();
  RETURN _hid;
END;
$$;
REVOKE ALL ON FUNCTION public.join_household(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_household(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.email_for_name(_name text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT email FROM public.profiles WHERE lower(name) = lower(trim(_name)) LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.email_for_name(text) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.email_for_name(text) TO anon;