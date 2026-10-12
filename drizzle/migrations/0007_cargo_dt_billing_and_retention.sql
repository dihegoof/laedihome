ALTER TABLE public.cargo_loads ADD COLUMN registered_at timestamptz NOT NULL DEFAULT now(), ADD COLUMN billing_issue text NOT NULL DEFAULT 'none' CHECK(billing_issue IN ('none','waiting_values','error')), ADD COLUMN departure_confirmed boolean NOT NULL DEFAULT false;
UPDATE public.cargo_loads SET registered_at=imported_at;
ALTER TABLE public.cargo_loads DROP CONSTRAINT cargo_loads_household_id_scheduled_date_load_number_key;
CREATE INDEX cargo_loads_household_dt ON public.cargo_loads(household_id,driver_dt);
CREATE UNIQUE INDEX cargo_loads_legacy_identity ON public.cargo_loads(household_id,scheduled_date,load_number) WHERE nullif(trim(driver_dt),'') IS NULL;
COMMENT ON COLUMN public.cargo_loads.registered_at IS 'Original registration timestamp; retention never restarts on reimport.';
ALTER POLICY cargo_loads_read ON public.cargo_loads USING(household_id=public.current_household() AND (registered_at AT TIME ZONE 'America/Sao_Paulo')::date > (now() AT TIME ZONE 'America/Sao_Paulo')::date-30);
ALTER POLICY cargo_history_read ON public.cargo_history USING(household_id=public.current_household() AND EXISTS(SELECT 1 FROM public.cargo_loads l WHERE l.id=load_id));
CREATE OR REPLACE FUNCTION public.import_cargo_loads(_loads jsonb) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _hid uuid; _item jsonb; _product jsonb; _existing public.cargo_loads%ROWTYPE; _id uuid; _count integer:=0;
BEGIN
 _hid:=public.current_household();
 IF auth.uid() IS NULL OR _hid IS NULL THEN RAISE EXCEPTION 'Entre na sua casa para importar cargas'; END IF;
 IF _loads IS NULL OR jsonb_typeof(_loads)<>'array' OR jsonb_array_length(_loads) NOT BETWEEN 1 AND 300 THEN RAISE EXCEPTION 'Confira as cargas antes de importar (máximo 300)'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(_hid::text||':cargo',0));
 PERFORM set_config('app.cargo_note','Importação conferida pelo usuário',true);
 FOR _item IN SELECT value FROM jsonb_array_elements(_loads) LOOP
  IF nullif(trim(_item->>'load_number'),'') IS NULL OR nullif(_item->>'scheduled_date','') IS NULL OR jsonb_typeof(_item->'products') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Carga sem data, número ou produtos'; END IF;
  IF jsonb_array_length(_item->'products') NOT BETWEEN 1 AND 300 THEN RAISE EXCEPTION 'Confira os produtos da carga'; END IF;
  SELECT * INTO _existing FROM public.cargo_loads WHERE household_id=_hid AND ((nullif(trim(_item->>'driver_dt'),'') IS NOT NULL AND driver_dt=trim(_item->>'driver_dt')) OR (nullif(trim(_item->>'driver_dt'),'') IS NULL AND scheduled_date=(_item->>'scheduled_date')::date AND load_number=trim(_item->>'load_number') AND nullif(trim(driver_dt),'') IS NULL)) FOR UPDATE;
  IF FOUND THEN
   IF (_existing.registered_at AT TIME ZONE 'America/Sao_Paulo')::date <= (now() AT TIME ZONE 'America/Sao_Paulo')::date-30 THEN RAISE EXCEPTION 'O período desta carga expirou'; END IF;
   IF coalesce((_item->>'confirm_update')::boolean,false)=false OR nullif(_item->>'expected_updated_at','')::timestamptz IS DISTINCT FROM _existing.updated_at THEN RAISE EXCEPTION 'A carga % já existe ou mudou. Revise e confirme a atualização.',_existing.load_number; END IF;
   _id:=_existing.id;
   UPDATE public.cargo_loads SET
    origin_center=coalesce(nullif(trim(_item->>'origin_center'),''),origin_center), destination_center=coalesce(nullif(trim(_item->>'destination_center'),''),destination_center),
    destination_name=coalesce(nullif(trim(_item->>'destination_name'),''),destination_name), carrier=coalesce(nullif(trim(_item->>'carrier'),''),carrier), plate=coalesce(nullif(trim(_item->>'plate'),''),plate), driver_dt=coalesce(nullif(trim(_item->>'driver_dt'),''),driver_dt),
    pallets=coalesce(nullif(_item->>'pallets','')::numeric,pallets), notes=coalesce(nullif(_item->>'notes',''),notes) WHERE id=_id;
  ELSE
   INSERT INTO public.cargo_loads(household_id,scheduled_date,load_number,origin_center,destination_center,destination_name,carrier,plate,driver_dt,pallets,notes,created_by)
   VALUES(_hid,(_item->>'scheduled_date')::date,trim(_item->>'load_number'),nullif(trim(_item->>'origin_center'),''),nullif(trim(_item->>'destination_center'),''),nullif(trim(_item->>'destination_name'),''),nullif(trim(_item->>'carrier'),''),nullif(trim(_item->>'plate'),''),nullif(trim(_item->>'driver_dt'),''),nullif(_item->>'pallets','')::numeric,coalesce(_item->>'notes',''),auth.uid()) RETURNING id INTO _id;
  END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(_item->'products'))<>(SELECT count(DISTINCT trim(value->>'product_code')) FROM jsonb_array_elements(_item->'products')) THEN RAISE EXCEPTION 'Produto repetido na mesma carga. Revise as quantidades.'; END IF;
  FOR _product IN SELECT value FROM jsonb_array_elements(_item->'products') LOOP
   IF nullif(trim(_product->>'product_code'),'') IS NULL OR nullif(trim(_product->>'description'),'') IS NULL OR nullif(_product->>'boxes','') IS NULL THEN RAISE EXCEPTION 'Produto sem código, descrição ou quantidade'; END IF;
   INSERT INTO public.cargo_products(load_id,product_code,description,boxes,extra_fields) VALUES(_id,trim(_product->>'product_code'),trim(_product->>'description'),(_product->>'boxes')::numeric,coalesce(_product->'extra_fields','{}'))
   ON CONFLICT(load_id,product_code) DO UPDATE SET description=excluded.description,boxes=excluded.boxes,extra_fields=public.cargo_products.extra_fields||excluded.extra_fields;
  END LOOP;
  _count:=_count+1;
 END LOOP;
 RETURN _count;
END; $$;
REVOKE ALL ON FUNCTION public.import_cargo_loads(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.import_cargo_loads(jsonb) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.update_cargo_load(_id uuid,_patch jsonb,_expected_updated_at timestamptz,_note text DEFAULT '') RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _load public.cargo_loads%ROWTYPE; _key text;
BEGIN
 IF auth.uid() IS NULL OR public.current_household() IS NULL THEN RAISE EXCEPTION 'Entre na sua casa para atualizar'; END IF;
 IF _patch IS NULL OR jsonb_typeof(_patch)<>'object' THEN RAISE EXCEPTION 'Atualização inválida'; END IF;
 SELECT * INTO _load FROM public.cargo_loads WHERE id=_id AND household_id=public.current_household() FOR UPDATE;
 IF NOT FOUND OR (_load.registered_at AT TIME ZONE 'America/Sao_Paulo')::date <= (now() AT TIME ZONE 'America/Sao_Paulo')::date-30 THEN RAISE EXCEPTION 'Carga não encontrada ou período expirado'; END IF;
 IF _expected_updated_at IS DISTINCT FROM _load.updated_at THEN RAISE EXCEPTION 'Esta carga mudou. Atualize a tela e tente novamente.'; END IF;
 FOR _key IN SELECT jsonb_object_keys(_patch) LOOP
  IF _key NOT IN ('scheduled_date','load_number','origin_center','destination_center','destination_name','carrier','plate','driver_dt','pallets','notes','billing_status','cte_status','print_status','operational_status','billing_issue','departure_confirmed') THEN RAISE EXCEPTION 'Campo inválido'; END IF;
 END LOOP;
 PERFORM set_config('app.cargo_note',coalesce(_note,''),true);
 UPDATE public.cargo_loads SET
 billing_issue=CASE WHEN _patch?'billing_issue' THEN _patch->>'billing_issue' ELSE billing_issue END,
 departure_confirmed=CASE WHEN _patch?'departure_confirmed' THEN (_patch->>'departure_confirmed')::boolean ELSE departure_confirmed END,
 scheduled_date=CASE WHEN _patch?'scheduled_date' THEN (_patch->>'scheduled_date')::date ELSE scheduled_date END,
 load_number=CASE WHEN _patch?'load_number' THEN trim(_patch->>'load_number') ELSE load_number END,
 origin_center=CASE WHEN _patch?'origin_center' THEN nullif(_patch->>'origin_center','') ELSE origin_center END,
 destination_center=CASE WHEN _patch?'destination_center' THEN nullif(_patch->>'destination_center','') ELSE destination_center END,
 destination_name=CASE WHEN _patch?'destination_name' THEN nullif(_patch->>'destination_name','') ELSE destination_name END,
 carrier=CASE WHEN _patch?'carrier' THEN nullif(_patch->>'carrier','') ELSE carrier END,
 plate=CASE WHEN _patch?'plate' THEN nullif(_patch->>'plate','') ELSE plate END,
 driver_dt=CASE WHEN _patch?'driver_dt' THEN nullif(_patch->>'driver_dt','') ELSE driver_dt END,
 pallets=CASE WHEN _patch?'pallets' THEN nullif(_patch->>'pallets','')::numeric ELSE pallets END,
 notes=CASE WHEN _patch?'notes' THEN coalesce(_patch->>'notes','') ELSE notes END,
 billing_status=CASE WHEN _patch?'billing_status' THEN _patch->>'billing_status' ELSE billing_status END,
 cte_status=CASE WHEN _patch?'cte_status' THEN _patch->>'cte_status' ELSE cte_status END,
 print_status=CASE WHEN _patch?'print_status' THEN _patch->>'print_status' ELSE print_status END,
 operational_status=CASE WHEN _patch?'operational_status' THEN _patch->>'operational_status' ELSE operational_status END
 WHERE id=_id;
END; $$;
REVOKE ALL ON FUNCTION public.update_cargo_load(uuid,jsonb,timestamptz,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.update_cargo_load(uuid,jsonb,timestamptz,text) TO authenticated,service_role;