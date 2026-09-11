CREATE OR REPLACE FUNCTION public.prevent_direct_household_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.household_id IS DISTINCT FROM OLD.household_id
     AND current_setting('app.household_join_verified', true) IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'Use um código de convite válido para trocar de casa';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_direct_household_change_trigger ON public.profiles;
CREATE TRIGGER prevent_direct_household_change_trigger
BEFORE UPDATE OF household_id ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_direct_household_change();

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
  PERFORM set_config('app.household_join_verified', 'true', true);
  UPDATE public.profiles SET household_id = _hid WHERE id = auth.uid();
  RETURN _hid;
END;
$$;

DROP POLICY IF EXISTS casa_files_select ON storage.objects;
DROP POLICY IF EXISTS casa_files_insert ON storage.objects;
DROP POLICY IF EXISTS casa_files_update ON storage.objects;
DROP POLICY IF EXISTS casa_files_delete ON storage.objects;
DROP POLICY IF EXISTS appointments_files_select ON storage.objects;
DROP POLICY IF EXISTS appointments_files_insert ON storage.objects;
DROP POLICY IF EXISTS appointments_files_update ON storage.objects;
DROP POLICY IF EXISTS appointments_files_delete ON storage.objects;

CREATE POLICY casa_files_select ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id IN ('product-images','wardrobe','debt-proofs')
  AND (
    (storage.foldername(name))[1] = public.current_household()::text
    OR (bucket_id = 'product-images' AND EXISTS (SELECT 1 FROM public.products p WHERE p.image_url = name AND p.household_id = public.current_household()))
    OR (bucket_id = 'wardrobe' AND EXISTS (SELECT 1 FROM public.wardrobe_items w WHERE w.image_url = name AND w.household_id = public.current_household()))
    OR (bucket_id = 'debt-proofs' AND EXISTS (
      SELECT 1 FROM public.debts d
      WHERE d.household_id = public.current_household()
      AND EXISTS (SELECT 1 FROM jsonb_array_elements(d.payment_history) x WHERE x->>'url' = name)
    ))
  )
);
CREATE POLICY casa_files_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id IN ('product-images','wardrobe','debt-proofs')
  AND (storage.foldername(name))[1] = public.current_household()::text
);
CREATE POLICY casa_files_update ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id IN ('product-images','wardrobe','debt-proofs') AND (storage.foldername(name))[1] = public.current_household()::text)
WITH CHECK (bucket_id IN ('product-images','wardrobe','debt-proofs') AND (storage.foldername(name))[1] = public.current_household()::text);
CREATE POLICY casa_files_delete ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id IN ('product-images','wardrobe','debt-proofs')
  AND (
    (storage.foldername(name))[1] = public.current_household()::text
    OR (bucket_id = 'product-images' AND EXISTS (SELECT 1 FROM public.products p WHERE p.image_url = name AND p.household_id = public.current_household()))
    OR (bucket_id = 'wardrobe' AND EXISTS (SELECT 1 FROM public.wardrobe_items w WHERE w.image_url = name AND w.household_id = public.current_household()))
    OR (bucket_id = 'debt-proofs' AND EXISTS (
      SELECT 1 FROM public.debts d
      WHERE d.household_id = public.current_household()
      AND EXISTS (SELECT 1 FROM jsonb_array_elements(d.payment_history) x WHERE x->>'url' = name)
    ))
  )
);

CREATE POLICY appointments_files_select ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'appointments'
  AND (
    (storage.foldername(name))[1] = public.current_household()::text
    OR EXISTS (SELECT 1 FROM public.appointments a WHERE a.audio_url = name AND a.household_id = public.current_household())
  )
);
CREATE POLICY appointments_files_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'appointments' AND (storage.foldername(name))[1] = public.current_household()::text);
CREATE POLICY appointments_files_update ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'appointments' AND (storage.foldername(name))[1] = public.current_household()::text)
WITH CHECK (bucket_id = 'appointments' AND (storage.foldername(name))[1] = public.current_household()::text);
CREATE POLICY appointments_files_delete ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'appointments'
  AND (
    (storage.foldername(name))[1] = public.current_household()::text
    OR EXISTS (SELECT 1 FROM public.appointments a WHERE a.audio_url = name AND a.household_id = public.current_household())
  )
);