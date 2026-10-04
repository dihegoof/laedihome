ALTER TABLE public.household_settings
  ADD COLUMN IF NOT EXISTS cleaning_notifications_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS cleaning_reminder_minutes integer NOT NULL DEFAULT 1440,
  ADD COLUMN IF NOT EXISTS cleaning_reminder_hour integer NOT NULL DEFAULT 9;

ALTER TABLE public.cleaning_schedules
  ADD COLUMN IF NOT EXISTS notification_sent_for timestamp with time zone;

ALTER TABLE public.household_settings
  DROP CONSTRAINT IF EXISTS household_settings_cleaning_reminder_minutes_check;
ALTER TABLE public.household_settings
  ADD CONSTRAINT household_settings_cleaning_reminder_minutes_check
  CHECK (cleaning_reminder_minutes BETWEEN 0 AND 10080);

ALTER TABLE public.household_settings
  DROP CONSTRAINT IF EXISTS household_settings_cleaning_reminder_hour_check;
ALTER TABLE public.household_settings
  ADD CONSTRAINT household_settings_cleaning_reminder_hour_check
  CHECK (cleaning_reminder_hour BETWEEN 0 AND 23);

CREATE INDEX IF NOT EXISTS cleaning_schedules_notification_due_idx
  ON public.cleaning_schedules (household_id, next_due_at, notification_sent_for);

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
  SET next_due_at = _next_due_at,
      notification_sent_for = NULL
  WHERE id = _schedule.id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_cleaning(uuid, text, timestamp with time zone) TO authenticated;