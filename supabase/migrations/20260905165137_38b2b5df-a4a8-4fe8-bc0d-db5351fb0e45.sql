CREATE TABLE public.household_settings (
  household_id uuid PRIMARY KEY REFERENCES public.households(id) ON DELETE CASCADE DEFAULT current_household(),
  theme text NOT NULL DEFAULT 'salvia',
  product_categories jsonb NOT NULL DEFAULT '["Perecível","Não perecível","Limpeza","Bebidas"]'::jsonb,
  finance_categories jsonb NOT NULL DEFAULT '["Trabalho","Mercado","Casa","Saúde","Transporte","Lazer","Dívidas","Outros"]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.household_settings TO authenticated;
GRANT ALL ON public.household_settings TO service_role;

ALTER TABLE public.household_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY household_settings_all ON public.household_settings
  FOR ALL TO authenticated
  USING (household_id = current_household())
  WITH CHECK (household_id = current_household());

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END; $$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_household_settings_updated_at
BEFORE UPDATE ON public.household_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.household_settings;