CREATE OR REPLACE FUNCTION public.is_household_owner(_household_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.households
    WHERE id = _household_id AND owner_id = auth.uid()
  )
$$;

GRANT EXECUTE ON FUNCTION public.is_household_owner(uuid) TO authenticated;

ALTER TABLE public.household_settings
  ADD COLUMN IF NOT EXISTS finance_reset_day integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS notifications_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS reminder_minutes integer NOT NULL DEFAULT 1440,
  ADD COLUMN IF NOT EXISTS reminder_hour integer NOT NULL DEFAULT 9;

CREATE OR REPLACE FUNCTION public.validate_household_settings()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.finance_reset_day < 1 OR NEW.finance_reset_day > 31 THEN
    RAISE EXCEPTION 'O dia do ciclo deve ficar entre 1 e 31';
  END IF;
  IF NEW.reminder_minutes < 0 OR NEW.reminder_minutes > 10080 THEN
    RAISE EXCEPTION 'A antecedência deve ficar entre 0 e 10080 minutos';
  END IF;
  IF NEW.reminder_hour < 0 OR NEW.reminder_hour > 23 THEN
    RAISE EXCEPTION 'O horário deve ficar entre 0 e 23';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_household_settings_trigger ON public.household_settings;
CREATE TRIGGER validate_household_settings_trigger
BEFORE INSERT OR UPDATE ON public.household_settings
FOR EACH ROW EXECUTE FUNCTION public.validate_household_settings();

DROP POLICY IF EXISTS household_settings_all ON public.household_settings;
CREATE POLICY household_settings_select_member
ON public.household_settings FOR SELECT TO authenticated
USING (household_id = public.current_household());
CREATE POLICY household_settings_insert_owner
ON public.household_settings FOR INSERT TO authenticated
WITH CHECK (household_id = public.current_household() AND public.is_household_owner(household_id));
CREATE POLICY household_settings_update_owner
ON public.household_settings FOR UPDATE TO authenticated
USING (household_id = public.current_household() AND public.is_household_owner(household_id))
WITH CHECK (household_id = public.current_household() AND public.is_household_owner(household_id));
CREATE POLICY household_settings_delete_owner
ON public.household_settings FOR DELETE TO authenticated
USING (household_id = public.current_household() AND public.is_household_owner(household_id));

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS notification_sent_at timestamp with time zone;

CREATE TABLE public.device_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE DEFAULT public.current_household(),
  token text NOT NULL UNIQUE,
  device_name text NOT NULL DEFAULT 'Este aparelho',
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.device_tokens TO authenticated;
GRANT ALL ON public.device_tokens TO service_role;
ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY device_tokens_select_own
ON public.device_tokens FOR SELECT TO authenticated
USING (user_id = auth.uid() AND household_id = public.current_household());
CREATE POLICY device_tokens_insert_own
ON public.device_tokens FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() AND household_id = public.current_household());
CREATE POLICY device_tokens_update_own
ON public.device_tokens FOR UPDATE TO authenticated
USING (user_id = auth.uid() AND household_id = public.current_household())
WITH CHECK (user_id = auth.uid() AND household_id = public.current_household());
CREATE POLICY device_tokens_delete_own
ON public.device_tokens FOR DELETE TO authenticated
USING (user_id = auth.uid() AND household_id = public.current_household());
CREATE TRIGGER update_device_tokens_updated_at
BEFORE UPDATE ON public.device_tokens
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS client_mutation_id uuid UNIQUE;
ALTER TABLE public.cards ADD COLUMN IF NOT EXISTS client_mutation_id uuid UNIQUE;
ALTER TABLE public.finances ADD COLUMN IF NOT EXISTS client_mutation_id uuid UNIQUE;
ALTER TABLE public.debts ADD COLUMN IF NOT EXISTS client_mutation_id uuid UNIQUE;
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS client_mutation_id uuid UNIQUE;
ALTER TABLE public.history ADD COLUMN IF NOT EXISTS client_mutation_id uuid UNIQUE;
ALTER TABLE public.wardrobe_items ADD COLUMN IF NOT EXISTS client_mutation_id uuid UNIQUE;
ALTER TABLE public.wardrobe_looks ADD COLUMN IF NOT EXISTS client_mutation_id uuid UNIQUE;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS client_mutation_id uuid UNIQUE;