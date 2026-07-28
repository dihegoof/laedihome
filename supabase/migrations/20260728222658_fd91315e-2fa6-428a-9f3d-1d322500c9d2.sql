CREATE TABLE public.households (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'Nossa Casa',
  invite_code text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.households TO authenticated;
GRANT ALL ON public.households TO service_role;
ALTER TABLE public.households ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  email text NOT NULL,
  name text NOT NULL,
  household_id uuid REFERENCES public.households(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.current_household()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT household_id FROM public.profiles WHERE id = auth.uid()
$$;

CREATE POLICY "profiles_select_own_or_household" ON public.profiles FOR SELECT TO authenticated
USING (id = auth.uid() OR (household_id IS NOT NULL AND household_id = public.current_household()));
CREATE POLICY "profiles_insert_self" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "profiles_update_self" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE POLICY "households_select_member" ON public.households FOR SELECT TO authenticated USING (id = public.current_household());
CREATE POLICY "households_insert_any" ON public.households FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "households_update_member" ON public.households FOR UPDATE TO authenticated
USING (id = public.current_household()) WITH CHECK (id = public.current_household());

CREATE OR REPLACE FUNCTION public.join_household(_code text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _hid uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT id INTO _hid FROM public.households WHERE upper(invite_code) = upper(trim(_code));
  IF _hid IS NULL THEN RAISE EXCEPTION 'Código inválido'; END IF;
  UPDATE public.profiles SET household_id = _hid WHERE id = auth.uid();
  RETURN _hid;
END; $$;

CREATE OR REPLACE FUNCTION public.email_for_name(_name text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT email FROM public.profiles WHERE lower(name) = lower(trim(_name)) LIMIT 1
$$;
GRANT EXECUTE ON FUNCTION public.email_for_name(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _hid uuid;
BEGIN
  INSERT INTO public.households (name, invite_code)
  VALUES ('Nossa Casa', upper(substr(replace(gen_random_uuid()::text,'-',''),1,6)))
  RETURNING id INTO _hid;
  INSERT INTO public.profiles (id, email, name, household_id)
  VALUES (NEW.id, COALESCE(NEW.email,''),
    COALESCE(NULLIF(trim(NEW.raw_user_meta_data->>'name'), ''), split_part(COALESCE(NEW.email,'usuario'),'@',1)), _hid)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL DEFAULT public.current_household() REFERENCES public.households(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text,
  quantity numeric NOT NULL DEFAULT 0,
  is_essential boolean NOT NULL DEFAULT false,
  is_new boolean NOT NULL DEFAULT true,
  out_of_stock_since timestamptz,
  image_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL DEFAULT public.current_household() REFERENCES public.households(id) ON DELETE CASCADE,
  name text NOT NULL,
  card_limit numeric NOT NULL DEFAULT 0,
  close_day integer,
  due_day integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.finances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL DEFAULT public.current_household() REFERENCES public.households(id) ON DELETE CASCADE,
  description text NOT NULL,
  value numeric NOT NULL DEFAULT 0,
  type text NOT NULL DEFAULT 'expense',
  category text,
  date date,
  card_id uuid REFERENCES public.cards(id) ON DELETE SET NULL,
  total_value numeric,
  installment_value numeric,
  total_installments integer,
  current_installment integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.debts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL DEFAULT public.current_household() REFERENCES public.households(id) ON DELETE CASCADE,
  description text NOT NULL,
  creditor text,
  total_value numeric NOT NULL DEFAULT 0,
  total_installments integer NOT NULL DEFAULT 1,
  installment_value numeric NOT NULL DEFAULT 0,
  paid_installments integer NOT NULL DEFAULT 0,
  payment_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL DEFAULT public.current_household() REFERENCES public.households(id) ON DELETE CASCADE,
  user_name text NOT NULL DEFAULT '',
  action text NOT NULL,
  target text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.wardrobe_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL DEFAULT public.current_household() REFERENCES public.households(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL,
  color text,
  occasion text,
  image_url text,
  times_used integer NOT NULL DEFAULT 0,
  last_used timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.wardrobe_looks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL DEFAULT public.current_household() REFERENCES public.households(id) ON DELETE CASCADE,
  item_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  item_names jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['products','cards','finances','debts','history','wardrobe_items','wardrobe_looks'] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format($f$CREATE POLICY "%1$s_household_all" ON public.%1$I FOR ALL TO authenticated
      USING (household_id = public.current_household())
      WITH CHECK (household_id = public.current_household())$f$, t);
    EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
    EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    EXECUTE format('CREATE INDEX ON public.%I (household_id)', t);
  END LOOP;
END $$;

CREATE INDEX ON public.products (name);