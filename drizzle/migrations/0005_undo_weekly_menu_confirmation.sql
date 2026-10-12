CREATE OR REPLACE FUNCTION public.undo_menu_confirmation(_id uuid, _confirmed_at timestamptz) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _plan public.menu_plans%ROWTYPE; _item public.menu_ingredients%ROWTYPE; _product public.products%ROWTYPE; _name text;
BEGIN
 IF auth.uid() IS NULL OR public.current_household() IS NULL THEN RAISE EXCEPTION 'Entre na sua casa para cancelar a confirmação'; END IF;
 SELECT * INTO _plan FROM public.menu_plans WHERE id = _id AND household_id = public.current_household() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Refeição não encontrada'; END IF;
 IF _plan.status = 'pending' THEN RETURN; END IF;
 IF _confirmed_at IS NULL OR _plan.confirmed_at IS DISTINCT FROM _confirmed_at THEN RAISE EXCEPTION 'A confirmação mudou. Atualize o cardápio e tente novamente'; END IF;
 SELECT name INTO _name FROM public.profiles WHERE id = auth.uid();
 IF _plan.status = 'prepared' THEN
  FOR _item IN SELECT * FROM public.menu_ingredients WHERE plan_id = _id ORDER BY product_id LOOP
   SELECT * INTO _product FROM public.products WHERE id = _item.product_id AND household_id = _plan.household_id FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Não foi possível devolver %: o produto foi excluído da Despensa', _item.product_name; END IF;
   IF _product.stock_unit <> _item.stock_unit_snapshot THEN RAISE EXCEPTION 'A medida de % mudou. Volte para a medida % na Despensa antes de cancelar', _item.product_name, _item.stock_unit_snapshot; END IF;
  END LOOP;
  FOR _item IN SELECT * FROM public.menu_ingredients WHERE plan_id = _id ORDER BY product_id LOOP
   UPDATE public.products SET quantity = quantity + _item.stock_quantity, out_of_stock_since = NULL WHERE id = _item.product_id AND household_id = _plan.household_id;
  END LOOP;
 END IF;
 UPDATE public.menu_plans SET status = 'pending', confirmed_by_name = NULL, confirmed_at = NULL WHERE id = _id;
 INSERT INTO public.history(household_id, user_name, action, target) VALUES (_plan.household_id, coalesce(_name, 'Alguém'), CASE WHEN _plan.status = 'prepared' THEN 'cancelou preparo e devolveu ingredientes' ELSE 'cancelou confirmação de refeição não feita' END, _plan.title);
END; $$;
REVOKE ALL ON FUNCTION public.undo_menu_confirmation(uuid,timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.undo_menu_confirmation(uuid,timestamptz) TO authenticated;
COMMENT ON COLUMN public.menu_plans.meal_time IS 'Legacy compatibility value derived from meal_type for new saves; the weekly menu uses meal type order, not a user-entered time.';