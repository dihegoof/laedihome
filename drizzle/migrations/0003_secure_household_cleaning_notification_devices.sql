CREATE OR REPLACE FUNCTION public.household_notification_devices()
RETURNS TABLE(token text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT dt.token
  FROM public.device_tokens AS dt
  WHERE auth.uid() IS NOT NULL
    AND dt.household_id = public.current_household()
    AND dt.enabled = true;
$$;

REVOKE ALL ON FUNCTION public.household_notification_devices() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.household_notification_devices() TO authenticated;

CREATE OR REPLACE FUNCTION public.remove_household_notification_device(_token text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.device_tokens
  WHERE auth.uid() IS NOT NULL
    AND household_id = public.current_household()
    AND token = _token;
$$;

REVOKE ALL ON FUNCTION public.remove_household_notification_device(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.remove_household_notification_device(text) TO authenticated;