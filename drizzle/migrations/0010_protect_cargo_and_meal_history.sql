ALTER TABLE public.cargo_loads ADD COLUMN deleted_at timestamptz;
CREATE POLICY hide_deleted_cargos ON public.cargo_loads AS RESTRICTIVE FOR SELECT TO authenticated USING (deleted_at IS NULL);
REVOKE UPDATE, DELETE ON public.cargo_loads FROM authenticated;
REVOKE DELETE ON public.cargo_products, public.cargo_history FROM authenticated;
CREATE OR REPLACE FUNCTION public.archive_cargo_load(_id uuid,_expected_updated_at timestamptz) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.household_tab_allowed('cargas') THEN RAISE EXCEPTION 'Acesso não permitido'; END IF;
 PERFORM set_config('app.cargo_note','Carga removida da lista; histórico preservado',true);
 UPDATE public.cargo_loads SET deleted_at=now() WHERE id=_id AND household_id=public.current_household() AND updated_at=_expected_updated_at AND deleted_at IS NULL AND (registered_at AT TIME ZONE 'America/Sao_Paulo')::date>(now() AT TIME ZONE 'America/Sao_Paulo')::date-30;
 IF NOT FOUND THEN RAISE EXCEPTION 'Esta carga mudou ou não está disponível. Atualize a lista.'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.archive_cargo_load(uuid,timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.archive_cargo_load(uuid,timestamptz) TO authenticated,service_role;
DO $$ DECLARE _definition text; BEGIN
 _definition:=pg_get_functiondef('public.update_cargo_load(uuid,jsonb,timestamptz,text)'::regprocedure);
 _definition:=replace(_definition,'''departure_confirmed'')','''departure_confirmed'',''cte_requested_at'')');
 _definition:=replace(_definition,'UPDATE public.cargo_loads SET','UPDATE public.cargo_loads SET cte_requested_at=CASE WHEN _patch?''cte_requested_at'' THEN (_patch->>''cte_requested_at'')::timestamptz ELSE cte_requested_at END,');
 _definition:=replace(_definition,'IF NOT FOUND OR','IF NOT FOUND OR _load.deleted_at IS NOT NULL OR');
 EXECUTE _definition;
 _definition:=pg_get_functiondef('public.import_cargo_loads(jsonb)'::regprocedure);
 _definition:=replace(_definition,'IF FOUND THEN','IF FOUND THEN IF _existing.deleted_at IS NOT NULL THEN RAISE EXCEPTION ''Esta carga foi removida; o histórico foi preservado''; END IF;');
 EXECUTE _definition;
END $$;
REVOKE INSERT, UPDATE, DELETE ON public.meals,public.meal_items FROM authenticated;
CREATE OR REPLACE FUNCTION public.save_meal_calculation(_glucose numeric,_items jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _hid uuid:=public.current_household(); _settings public.household_settings%ROWTYPE; _food public.foods%ROWTYPE; _item jsonb; _weight numeric; _carbs numeric; _total numeric:=0; _meal numeric; _correction numeric; _dose numeric; _adjusted numeric; _id uuid; _name text; _snapshots jsonb:='[]';
BEGIN
 IF NOT public.household_tab_allowed('isis') THEN RAISE EXCEPTION 'Acesso não permitido'; END IF;
 IF _glucose IS NULL OR _glucose<=0 OR _glucose>1000 OR _glucose::text IN ('NaN','Infinity','-Infinity') OR _items IS NULL OR jsonb_typeof(_items)<>'array' OR jsonb_array_length(_items) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Confira a glicemia e os alimentos'; END IF;
 SELECT * INTO _settings FROM public.household_settings WHERE household_id=_hid FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Configure os parâmetros da casa antes de salvar'; END IF;
 SELECT name INTO _name FROM public.profiles WHERE id=auth.uid();
 FOR _item IN SELECT value FROM jsonb_array_elements(_items) LOOP
 SELECT * INTO _food FROM public.foods WHERE id=(_item->>'food_id')::uuid AND household_id=_hid AND active FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Alimento não encontrado nesta casa'; END IF;
 _weight:=(_item->>'weight_grams')::numeric;
 IF _weight IS NULL OR _weight<=0 OR _weight>100000 OR _weight::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Peso inválido'; END IF;
 _carbs:=round(round(_weight,3)*round(_food.carbs_per_100g,3)/100,3);
 _total:=_total+_carbs;
 _snapshots:=_snapshots||jsonb_build_array(jsonb_build_object('food_id',_food.id,'name',_food.name,'brand',_food.brand,'weight',_weight,'carbs_per_100g',_food.carbs_per_100g,'carbs',_carbs));
 END LOOP;
 _meal:=_total/_settings.insulin_carb_ratio;
 _correction:=greatest((_glucose-_settings.target_glucose)/_settings.correction_factor,0);
 _dose:=_meal+_correction;
 _adjusted:=round(_dose/_settings.dose_increment)*_settings.dose_increment;
 INSERT INTO public.meals(household_id,created_by,created_by_name,glucose,total_carbs,meal_insulin,correction_insulin,total_dose,adjusted_dose,parameters_used) VALUES(_hid,auth.uid(),coalesce(_name,'Alguém'),_glucose,_total,_meal,_correction,_dose,_adjusted,jsonb_build_object('insulin_carb_ratio',_settings.insulin_carb_ratio,'target_glucose',_settings.target_glucose,'correction_factor',_settings.correction_factor,'dose_increment',_settings.dose_increment)) RETURNING id INTO _id;
 INSERT INTO public.meal_items(meal_id,food_id,food_name_snapshot,brand_snapshot,weight_grams,carbs_per_100g_snapshot,calculated_carbs) SELECT _id,(x->>'food_id')::uuid,x->>'name',x->>'brand',(x->>'weight')::numeric,(x->>'carbs_per_100g')::numeric,(x->>'carbs')::numeric FROM jsonb_array_elements(_snapshots) x;
 RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.save_meal_calculation(numeric,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_meal_calculation(numeric,jsonb) TO authenticated,service_role;