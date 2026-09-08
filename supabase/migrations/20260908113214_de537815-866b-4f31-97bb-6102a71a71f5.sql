-- Household owner
ALTER TABLE public.households ADD COLUMN IF NOT EXISTS owner_id uuid;
UPDATE public.households h SET owner_id = (
  SELECT p.id FROM public.profiles p WHERE p.household_id = h.id ORDER BY p.created_at ASC LIMIT 1
) WHERE owner_id IS NULL;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _hid uuid;
BEGIN
  INSERT INTO public.households (name, invite_code, owner_id)
  VALUES ('Nossa Casa', upper(substr(replace(gen_random_uuid()::text,'-',''),1,6)), NEW.id)
  RETURNING id INTO _hid;
  INSERT INTO public.profiles (id, email, name, household_id)
  VALUES (NEW.id, COALESCE(NEW.email,''),
    COALESCE(NULLIF(trim(NEW.raw_user_meta_data->>'name'), ''), split_part(COALESCE(NEW.email,'usuario'),'@',1)), _hid)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $function$;

-- Wardrobe owners -> profiles
ALTER TABLE public.wardrobe_items DROP CONSTRAINT IF EXISTS wardrobe_items_owner_id_fkey;
UPDATE public.wardrobe_items SET owner_id = '61c10b14-7726-447e-965e-3076febe726b'
  WHERE household_id = '2576f02c-33a8-4e22-988d-6b918923e1c3' AND owner_id IS NULL;
ALTER TABLE public.wardrobe_items
  ADD CONSTRAINT wardrobe_items_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
DROP TABLE IF EXISTS public.wardrobe_owners;

-- Appointments
CREATE TABLE public.appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL DEFAULT public.current_household() REFERENCES public.households(id) ON DELETE CASCADE,
  title text,
  scheduled_at timestamptz NOT NULL,
  audio_url text,
  duration_seconds integer,
  created_by uuid DEFAULT auth.uid(),
  created_by_name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.appointments TO authenticated;
GRANT ALL ON public.appointments TO service_role;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
CREATE POLICY appointments_household_all ON public.appointments FOR ALL TO authenticated
  USING (household_id = public.current_household()) WITH CHECK (household_id = public.current_household());
CREATE TRIGGER update_appointments_updated_at BEFORE UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
ALTER PUBLICATION supabase_realtime ADD TABLE public.appointments;

-- Storage policies for audio
CREATE POLICY appointments_files_select ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'appointments');
CREATE POLICY appointments_files_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'appointments');
CREATE POLICY appointments_files_delete ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'appointments');