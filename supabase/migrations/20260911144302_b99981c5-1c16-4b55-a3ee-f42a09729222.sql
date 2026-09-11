DROP POLICY IF EXISTS household_product_images_select ON storage.objects;
CREATE POLICY household_product_images_select ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'product-images' AND (storage.foldername(name))[1] = public.current_household()::text);
DROP POLICY IF EXISTS household_wardrobe_select ON storage.objects;
CREATE POLICY household_wardrobe_select ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'wardrobe' AND (storage.foldername(name))[1] = public.current_household()::text);
DROP POLICY IF EXISTS household_debt_proofs_select ON storage.objects;
CREATE POLICY household_debt_proofs_select ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'debt-proofs' AND (storage.foldername(name))[1] = public.current_household()::text);
DROP POLICY IF EXISTS household_appointments_select ON storage.objects;
CREATE POLICY household_appointments_select ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'appointments' AND (storage.foldername(name))[1] = public.current_household()::text);
DROP POLICY IF EXISTS casa_files_update ON storage.objects;
CREATE POLICY casa_files_update ON storage.objects FOR UPDATE TO authenticated
USING ((storage.foldername(name))[1] = public.current_household()::text AND owner_id = auth.uid()::text)
WITH CHECK ((storage.foldername(name))[1] = public.current_household()::text AND owner_id = auth.uid()::text);