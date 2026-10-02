CREATE TABLE public.cleaning_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL DEFAULT public.current_household() REFERENCES public.households(id) ON DELETE CASCADE,
  name text NOT NULL,
  notes text,
  recurrence_type text NOT NULL,
  weekdays smallint[] NOT NULL DEFAULT '{}',
  interval_days integer,
  next_due_at timestamp with time zone NOT NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by_name text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT cleaning_schedules_name_check CHECK (char_length(trim(name)) BETWEEN 1 AND 120),
  CONSTRAINT cleaning_schedules_notes_check CHECK (notes IS NULL OR char_length(notes) <= 1000),
  CONSTRAINT cleaning_schedules_recurrence_check CHECK (recurrence_type IN ('weekly', 'interval')),
  CONSTRAINT cleaning_schedules_weekdays_check CHECK (weekdays <@ ARRAY[0,1,2,3,4,5,6]::smallint[]),
  CONSTRAINT cleaning_schedules_rule_check CHECK (
    (recurrence_type = 'weekly' AND cardinality(weekdays) > 0 AND interval_days IS NULL)
    OR (recurrence_type = 'interval' AND cardinality(weekdays) = 0 AND interval_days BETWEEN 1 AND 365)
  )
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cleaning_schedules TO authenticated;
GRANT ALL ON public.cleaning_schedules TO service_role;
ALTER TABLE public.cleaning_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cleaning_schedules_household_all" ON public.cleaning_schedules FOR ALL TO authenticated USING (household_id = public.current_household()) WITH CHECK (household_id = public.current_household());
CREATE INDEX cleaning_schedules_household_due_idx ON public.cleaning_schedules (household_id, next_due_at);
CREATE TRIGGER update_cleaning_schedules_updated_at BEFORE UPDATE ON public.cleaning_schedules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.cleaning_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid NOT NULL REFERENCES public.cleaning_schedules(id) ON DELETE CASCADE,
  household_id uuid NOT NULL DEFAULT public.current_household() REFERENCES public.households(id) ON DELETE CASCADE,
  schedule_name_snapshot text NOT NULL,
  scheduled_for timestamp with time zone NOT NULL,
  completed_at timestamp with time zone NOT NULL DEFAULT now(),
  completed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  completed_by_name text NOT NULL,
  CONSTRAINT cleaning_history_name_check CHECK (char_length(trim(schedule_name_snapshot)) BETWEEN 1 AND 120)
);
GRANT SELECT, INSERT ON public.cleaning_history TO authenticated;
GRANT ALL ON public.cleaning_history TO service_role;
ALTER TABLE public.cleaning_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cleaning_history_household_select" ON public.cleaning_history FOR SELECT TO authenticated USING (household_id = public.current_household());
CREATE POLICY "cleaning_history_household_insert" ON public.cleaning_history FOR INSERT TO authenticated WITH CHECK (household_id = public.current_household());
CREATE INDEX cleaning_history_household_completed_idx ON public.cleaning_history (household_id, completed_at DESC);

CREATE OR REPLACE FUNCTION public.complete_cleaning(_schedule_id uuid, _completed_by_name text, _next_due_at timestamp with time zone)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  _schedule public.cleaning_schedules%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF _next_due_at <= now() THEN RAISE EXCEPTION 'A próxima limpeza deve ficar no futuro'; END IF;

  SELECT * INTO _schedule
  FROM public.cleaning_schedules
  WHERE id = _schedule_id AND household_id = public.current_household()
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Limpeza não encontrada'; END IF;

  INSERT INTO public.cleaning_history (
    schedule_id, household_id, schedule_name_snapshot, scheduled_for,
    completed_by, completed_by_name
  ) VALUES (
    _schedule.id, _schedule.household_id, _schedule.name, _schedule.next_due_at,
    auth.uid(), trim(_completed_by_name)
  );

  UPDATE public.cleaning_schedules
  SET next_due_at = _next_due_at
  WHERE id = _schedule.id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.complete_cleaning(uuid, text, timestamp with time zone) TO authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.cleaning_schedules;
ALTER PUBLICATION supabase_realtime ADD TABLE public.cleaning_history;