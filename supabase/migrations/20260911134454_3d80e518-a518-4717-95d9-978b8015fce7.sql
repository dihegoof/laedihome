CREATE TABLE public.goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL DEFAULT current_household() REFERENCES public.households(id),
  name text NOT NULL,
  description text,
  target_value numeric NOT NULL DEFAULT 0,
  saved_value numeric NOT NULL DEFAULT 0,
  achieved boolean NOT NULL DEFAULT false,
  created_by_name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.goals TO authenticated;
GRANT ALL ON public.goals TO service_role;
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY goals_household_all ON public.goals FOR ALL TO authenticated
  USING (household_id = current_household()) WITH CHECK (household_id = current_household());
CREATE TRIGGER update_goals_updated_at BEFORE UPDATE ON public.goals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS reminder_done boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS assistant_always_on boolean NOT NULL DEFAULT false;

ALTER PUBLICATION supabase_realtime ADD TABLE public.goals;