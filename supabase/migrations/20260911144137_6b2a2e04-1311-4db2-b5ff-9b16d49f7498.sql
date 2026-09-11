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

DROP POLICY IF EXISTS "Authenticated upload product images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated read product images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated update product images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated delete product images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated upload wardrobe" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated read wardrobe" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated update wardrobe" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated delete wardrobe" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated upload debt proofs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated read debt proofs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated update debt proofs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated delete debt proofs" ON storage.objects;
DROP POLICY IF EXISTS "appointments_household_insert" ON storage.objects;
DROP POLICY IF EXISTS "appointments_household_select" ON storage.objects;
DROP POLICY IF EXISTS "appointments_household_update" ON storage.objects;
DROP POLICY IF EXISTS "appointments_household_delete" ON storage.objects;

CREATE POLICY "household_product_images_insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'product-images' AND (storage.foldername(name))[1] = public.current_household()::text AND owner_id = auth.uid()::text);
CREATE POLICY "household_product_images_select" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'product-images' AND ((storage.foldername(name))[1] = public.current_household()::text OR array_length(storage.foldername(name), 1) IS NULL));
CREATE POLICY "household_product_images_update" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'product-images' AND (storage.foldername(name))[1] = public.current_household()::text AND owner_id = auth.uid()::text)
WITH CHECK (bucket_id = 'product-images' AND (storage.foldername(name))[1] = public.current_household()::text AND owner_id = auth.uid()::text);
CREATE POLICY "household_product_images_delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'product-images' AND (storage.foldername(name))[1] = public.current_household()::text AND owner_id = auth.uid()::text);

CREATE POLICY "household_wardrobe_insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'wardrobe' AND (storage.foldername(name))[1] = public.current_household()::text AND owner_id = auth.uid()::text);
CREATE POLICY "household_wardrobe_select" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'wardrobe' AND ((storage.foldername(name))[1] = public.current_household()::text OR array_length(storage.foldername(name), 1) IS NULL));
CREATE POLICY "household_wardrobe_update" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'wardrobe' AND (storage.foldername(name))[1] = public.current_household()::text AND owner_id = auth.uid()::text)
WITH CHECK (bucket_id = 'wardrobe' AND (storage.foldername(name))[1] = public.current_household()::text AND owner_id = auth.uid()::text);
CREATE POLICY "household_wardrobe_delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'wardrobe' AND (storage.foldername(name))[1] = public.current_household()::text AND owner_id = auth.uid()::text);

CREATE POLICY "household_debt_proofs_insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'debt-proofs' AND (storage.foldername(name))[1] = public.current_household()::text AND owner_id = auth.uid()::text);
CREATE POLICY "household_debt_proofs_select" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'debt-proofs' AND ((storage.foldername(name))[1] = public.current_household()::text OR array_length(storage.foldername(name), 1) IS NULL));
CREATE POLICY "household_debt_proofs_update" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'debt-proofs' AND (storage.foldername(name))[1] = public.current_household()::text AND owner_id = auth.uid()::text)
WITH CHECK (bucket_id = 'debt-proofs' AND (storage.foldername(name))[1] = public.current_household()::text AND owner_id = auth.uid()::text);
CREATE POLICY "household_debt_proofs_delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'debt-proofs' AND (storage.foldername(name))[1] = public.current_household()::text AND owner_id = auth.uid()::text);

CREATE POLICY "household_appointments_insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'appointments' AND (storage.foldername(name))[1] = public.current_household()::text AND owner_id = auth.uid()::text);
CREATE POLICY "household_appointments_select" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'appointments' AND ((storage.foldername(name))[1] = public.current_household()::text OR array_length(storage.foldername(name), 1) IS NULL));
CREATE POLICY "household_appointments_update" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'appointments' AND (storage.foldername(name))[1] = public.current_household()::text AND owner_id = auth.uid()::text)
WITH CHECK (bucket_id = 'appointments' AND (storage.foldername(name))[1] = public.current_household()::text AND owner_id = auth.uid()::text);
CREATE POLICY "household_appointments_delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'appointments' AND (storage.foldername(name))[1] = public.current_household()::text AND owner_id = auth.uid()::text);