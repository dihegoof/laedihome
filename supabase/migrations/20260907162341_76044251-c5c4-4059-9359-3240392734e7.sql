ALTER TABLE public.products ADD COLUMN IF NOT EXISTS notes text;

CREATE TABLE IF NOT EXISTS public.wardrobe_owners (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  household_id uuid NOT NULL DEFAULT current_household() REFERENCES public.households(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wardrobe_owners TO authenticated;
GRANT ALL ON public.wardrobe_owners TO service_role;

ALTER TABLE public.wardrobe_owners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wardrobe_owners_household_all" ON public.wardrobe_owners
  FOR ALL TO authenticated
  USING (household_id = current_household())
  WITH CHECK (household_id = current_household());

ALTER TABLE public.wardrobe_items ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES public.wardrobe_owners(id) ON DELETE SET NULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.wardrobe_owners;