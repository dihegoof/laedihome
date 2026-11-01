DROP POLICY IF EXISTS casa_files_insert ON storage.objects;
DROP POLICY IF EXISTS casa_files_delete ON storage.objects;
DROP POLICY IF EXISTS household_wardrobe_select ON storage.objects;
DROP POLICY IF EXISTS casa_files_select ON storage.objects;
CREATE POLICY casa_files_select ON storage.objects FOR SELECT TO authenticated USING (
 bucket_id IN ('product-images','wardrobe','debt-proofs') AND (
 (storage.foldername(name))[1] = public.current_household()::text OR
 (bucket_id='product-images' AND EXISTS(SELECT 1 FROM public.products p WHERE p.image_url=objects.name AND p.household_id=public.current_household())) OR
 (bucket_id='wardrobe' AND EXISTS(SELECT 1 FROM public.wardrobe_items w WHERE w.image_url=objects.name AND w.household_id=public.current_household())) OR
 (bucket_id='debt-proofs' AND EXISTS(SELECT 1 FROM public.debts d CROSS JOIN LATERAL jsonb_array_elements(d.payment_history) x WHERE d.household_id=public.current_household() AND x->>'url'=objects.name))));
DROP POLICY IF EXISTS households_update_member ON public.households;
CREATE POLICY households_update_owner ON public.households FOR UPDATE TO authenticated USING (id=public.current_household() AND owner_id=auth.uid()) WITH CHECK (id=public.current_household() AND owner_id=auth.uid());
CREATE OR REPLACE FUNCTION public.household_tab_allowed(_tab text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT auth.uid() IS NOT NULL AND public.current_household() IS NOT NULL AND (EXISTS(SELECT 1 FROM public.households WHERE id=public.current_household() AND owner_id=auth.uid()) OR NOT EXISTS(SELECT 1 FROM public.tab_permissions WHERE household_id=public.current_household() AND user_id=auth.uid() AND tab=_tab AND allowed=false));
$$;
REVOKE ALL ON FUNCTION public.household_tab_allowed(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.household_tab_allowed(text) TO authenticated, service_role;
DO $$ DECLARE _table text; _tab text; _pair text[]; BEGIN
 FOREACH _pair SLICE 1 IN ARRAY ARRAY[['products','despensa'],['menu_plans','despensa'],['menu_ingredients','despensa'],['finances','financas'],['cards','financas'],['debts','financas'],['goals','financas'],['wardrobe_items','armario'],['wardrobe_looks','armario'],['appointments','compromissos'],['cleaning_schedules','compromissos'],['cleaning_history','compromissos'],['foods','isis'],['meals','isis'],['meal_items','isis'],['history','historico'],['cargo_loads','cargas'],['cargo_products','cargas'],['cargo_history','cargas']] LOOP
 _table:=_pair[1]; _tab:=_pair[2];
 EXECUTE format('CREATE POLICY enforce_tab_permission ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING(public.household_tab_allowed(%L)) WITH CHECK(public.household_tab_allowed(%L))',_table,_tab,_tab);
 END LOOP;
END $$;
DO $$ DECLARE _proc record; _definition text; _tab text; BEGIN
 FOR _proc IN SELECT p.oid,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('import_cargo_loads','update_cargo_load','save_menu_plan','confirm_menu_plan','undo_menu_confirmation','delete_menu_plan') LOOP
 _tab:=CASE WHEN _proc.proname IN ('import_cargo_loads','update_cargo_load') THEN 'cargas' ELSE 'despensa' END;
 _definition:=pg_get_functiondef(_proc.oid);
 _definition:=regexp_replace(_definition,'\mBEGIN\M',format('BEGIN IF NOT public.household_tab_allowed(%L) THEN RAISE EXCEPTION ''Acesso a esta aba não permitido''; END IF;',_tab),'i');
 EXECUTE _definition;
 END LOOP;
END $$;
CREATE POLICY enforce_file_tab_permission ON storage.objects AS RESTRICTIVE FOR ALL TO authenticated USING (CASE bucket_id WHEN 'product-images' THEN public.household_tab_allowed('despensa') WHEN 'wardrobe' THEN public.household_tab_allowed('armario') WHEN 'debt-proofs' THEN public.household_tab_allowed('financas') WHEN 'appointments' THEN public.household_tab_allowed('compromissos') WHEN 'food-images' THEN public.household_tab_allowed('isis') ELSE true END) WITH CHECK (CASE bucket_id WHEN 'product-images' THEN public.household_tab_allowed('despensa') WHEN 'wardrobe' THEN public.household_tab_allowed('armario') WHEN 'debt-proofs' THEN public.household_tab_allowed('financas') WHEN 'appointments' THEN public.household_tab_allowed('compromissos') WHEN 'food-images' THEN public.household_tab_allowed('isis') ELSE true END);