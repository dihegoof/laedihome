ALTER TABLE public.products ADD COLUMN stock_unit text NOT NULL DEFAULT 'un';
ALTER TABLE public.products ADD CONSTRAINT products_stock_unit_valid CHECK (stock_unit IN ('un','g','kg','ml','l'));

CREATE TABLE public.menu_plans (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 household_id uuid NOT NULL DEFAULT public.current_household() REFERENCES public.households(id),
 title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 120),
 meal_date date NOT NULL,
 meal_time time NOT NULL,
 meal_type text NOT NULL CHECK (meal_type IN ('breakfast','lunch','afternoon','dinner')),
 notes text,
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','prepared','skipped')),
 created_by uuid NOT NULL,
 created_by_name text NOT NULL,
 confirmed_by_name text,
 confirmed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.menu_plans TO authenticated;
GRANT ALL ON public.menu_plans TO service_role;
ALTER TABLE public.menu_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY menu_plans_household_read ON public.menu_plans FOR SELECT TO authenticated USING (household_id = public.current_household());

CREATE TABLE public.menu_ingredients (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 plan_id uuid NOT NULL REFERENCES public.menu_plans(id) ON DELETE CASCADE,
 product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
 product_name text NOT NULL,
 quantity numeric NOT NULL CHECK (quantity > 0),
 unit text NOT NULL CHECK (unit IN ('un','g','kg','ml','l')),
 stock_unit_snapshot text NOT NULL,
 stock_quantity numeric NOT NULL CHECK (stock_quantity > 0),
 UNIQUE(plan_id,product_id)
);
GRANT SELECT ON public.menu_ingredients TO authenticated;
GRANT ALL ON public.menu_ingredients TO service_role;
ALTER TABLE public.menu_ingredients ENABLE ROW LEVEL SECURITY;
CREATE POLICY menu_ingredients_household_read ON public.menu_ingredients FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.menu_plans p WHERE p.id = plan_id AND p.household_id = public.current_household()));
CREATE INDEX menu_plans_household_date ON public.menu_plans(household_id,meal_date);
CREATE INDEX menu_ingredients_product ON public.menu_ingredients(product_id);

CREATE OR REPLACE FUNCTION public.menu_stock_amount(_quantity numeric, _unit text, _stock_unit text) RETURNS numeric LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
BEGIN
 IF _quantity IS NULL OR _quantity <= 0 OR _quantity > 100000000 OR _quantity <> round(_quantity,3) THEN RAISE EXCEPTION 'Informe uma quantidade positiva com até 3 casas decimais'; END IF;
 IF _unit NOT IN ('un','g','kg','ml','l') OR _stock_unit NOT IN ('un','g','kg','ml','l') OR _unit IS NULL OR _stock_unit IS NULL THEN RAISE EXCEPTION 'Medida inválida'; END IF;
 IF _unit = _stock_unit THEN RETURN _quantity; END IF;
 IF (_unit = 'g' AND _stock_unit = 'kg') OR (_unit = 'ml' AND _stock_unit = 'l') THEN RETURN _quantity / 1000; END IF;
 IF (_unit = 'kg' AND _stock_unit = 'g') OR (_unit = 'l' AND _stock_unit = 'ml') THEN RETURN _quantity * 1000; END IF;
 RAISE EXCEPTION 'Medidas incompatíveis com a despensa';
END; $$;

CREATE OR REPLACE FUNCTION public.save_menu_plan(_id uuid, _title text, _date date, _time time, _type text, _notes text, _ingredients jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _hid uuid; _pid uuid; _name text; _item jsonb; _product public.products%ROWTYPE; _amount numeric; _quantity numeric; _unit text;
BEGIN
 _hid := public.current_household();
 IF auth.uid() IS NULL OR _hid IS NULL THEN RAISE EXCEPTION 'Entre na sua casa para cadastrar'; END IF;
 SELECT name INTO _name FROM public.profiles WHERE id = auth.uid();
 IF _title IS NULL OR length(trim(_title)) NOT BETWEEN 1 AND 120 OR _date IS NULL OR _time IS NULL OR _type IS NULL OR _type NOT IN ('breakfast','lunch','afternoon','dinner') OR length(coalesce(_notes,'')) > 2000 THEN RAISE EXCEPTION 'Confira os dados da refeição'; END IF;
 IF _ingredients IS NULL OR jsonb_typeof(_ingredients) <> 'array' THEN RAISE EXCEPTION 'Selecione os ingredientes'; END IF;
 IF jsonb_array_length(_ingredients) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Selecione entre 1 e 100 ingredientes'; END IF;
 IF _id IS NOT NULL THEN
   SELECT id INTO _pid FROM public.menu_plans WHERE id = _id AND household_id = _hid AND status = 'pending' FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Só refeições pendentes podem ser editadas'; END IF;
   UPDATE public.menu_plans SET title=trim(_title), meal_date=_date, meal_time=_time, meal_type=_type, notes=nullif(trim(_notes),'') WHERE id=_pid;
   DELETE FROM public.menu_ingredients WHERE plan_id=_pid;
 ELSE
   INSERT INTO public.menu_plans(household_id,title,meal_date,meal_time,meal_type,notes,created_by,created_by_name) VALUES (_hid,trim(_title),_date,_time,_type,nullif(trim(_notes),''),auth.uid(),coalesce(_name,'Alguém')) RETURNING id INTO _pid;
 END IF;
 FOR _item IN SELECT value FROM jsonb_array_elements(_ingredients) ORDER BY value->>'product_id' LOOP
   SELECT * INTO _product FROM public.products WHERE id=(_item->>'product_id')::uuid AND household_id=_hid FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Ingrediente não encontrado na despensa'; END IF;
   _quantity := (_item->>'quantity')::numeric; _unit := _item->>'unit';
   _amount := public.menu_stock_amount(_quantity,_unit,_product.stock_unit);
   IF _product.quantity < _amount THEN RAISE EXCEPTION 'Estoque insuficiente: %',_product.name; END IF;
   INSERT INTO public.menu_ingredients(plan_id,product_id,product_name,quantity,unit,stock_unit_snapshot,stock_quantity) VALUES (_pid,_product.id,_product.name,_quantity,_unit,_product.stock_unit,_amount);
 END LOOP;
 RETURN _pid;
END; $$;

CREATE OR REPLACE FUNCTION public.confirm_menu_plan(_id uuid, _prepared boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _plan public.menu_plans%ROWTYPE; _item public.menu_ingredients%ROWTYPE; _product public.products%ROWTYPE; _name text;
BEGIN
 IF auth.uid() IS NULL OR _prepared IS NULL THEN RAISE EXCEPTION 'Confirmação inválida'; END IF;
 SELECT * INTO _plan FROM public.menu_plans WHERE id=_id AND household_id=public.current_household() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Refeição não encontrada'; END IF;
 IF _plan.status <> 'pending' THEN RETURN; END IF;
 SELECT name INTO _name FROM public.profiles WHERE id=auth.uid();
 IF _prepared THEN
   FOR _item IN SELECT * FROM public.menu_ingredients WHERE plan_id=_id ORDER BY product_id LOOP
     SELECT * INTO _product FROM public.products WHERE id=_item.product_id AND household_id=_plan.household_id FOR UPDATE;
     IF NOT FOUND THEN RAISE EXCEPTION 'Ingrediente excluído: %. Edite a refeição.',_item.product_name; END IF;
     IF _product.stock_unit <> _item.stock_unit_snapshot THEN RAISE EXCEPTION 'A medida de % mudou. Edite a refeição antes de confirmar.',_item.product_name; END IF;
     IF _product.quantity < _item.stock_quantity THEN RAISE EXCEPTION 'Estoque insuficiente: %. Reponha ou edite a refeição.',_product.name; END IF;
   END LOOP;
   FOR _item IN SELECT * FROM public.menu_ingredients WHERE plan_id=_id ORDER BY product_id LOOP
     UPDATE public.products SET quantity=quantity-_item.stock_quantity,is_new=false,out_of_stock_since=CASE WHEN quantity-_item.stock_quantity=0 THEN coalesce(out_of_stock_since,now()) ELSE NULL END WHERE id=_item.product_id;
   END LOOP;
 END IF;
 UPDATE public.menu_plans SET status=CASE WHEN _prepared THEN 'prepared' ELSE 'skipped' END,confirmed_by_name=coalesce(_name,'Alguém'),confirmed_at=now() WHERE id=_id;
 INSERT INTO public.history(household_id,user_name,action,target) VALUES (_plan.household_id,coalesce(_name,'Alguém'),CASE WHEN _prepared THEN 'preparou refeição e consumiu ingredientes' ELSE 'marcou refeição como não feita' END,_plan.title);
END; $$;

CREATE OR REPLACE FUNCTION public.delete_menu_plan(_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Entre na sua conta'; END IF;
 DELETE FROM public.menu_plans WHERE id=_id AND household_id=public.current_household() AND status='pending';
 IF NOT FOUND THEN RAISE EXCEPTION 'Só refeições pendentes podem ser excluídas'; END IF;
END; $$;
REVOKE ALL ON FUNCTION public.save_menu_plan(uuid,text,date,time,text,text,jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.confirm_menu_plan(uuid,boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_menu_plan(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_menu_plan(uuid,text,date,time,text,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_menu_plan(uuid,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_menu_plan(uuid) TO authenticated;
ALTER PUBLICATION supabase_realtime ADD TABLE public.menu_plans, public.menu_ingredients;