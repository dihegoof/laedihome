ALTER TABLE public.household_settings
  ADD COLUMN insulin_carb_ratio numeric(8,3) NOT NULL DEFAULT 18,
  ADD COLUMN target_glucose numeric(8,2) NOT NULL DEFAULT 100,
  ADD COLUMN correction_factor numeric(8,3) NOT NULL DEFAULT 150,
  ADD COLUMN dose_increment numeric(4,2) NOT NULL DEFAULT 0.5;

ALTER TABLE public.household_settings
  ADD CONSTRAINT household_settings_insulin_carb_ratio_positive CHECK (insulin_carb_ratio > 0),
  ADD CONSTRAINT household_settings_target_glucose_nonnegative CHECK (target_glucose >= 0),
  ADD CONSTRAINT household_settings_correction_factor_positive CHECK (correction_factor > 0),
  ADD CONSTRAINT household_settings_dose_increment_allowed CHECK (dose_increment IN (0.25, 0.5, 1));

CREATE TABLE public.foods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL DEFAULT public.current_household() REFERENCES public.households(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text NOT NULL,
  carbs_per_100g numeric(8,3) NOT NULL,
  brand text,
  notes text,
  image_url text,
  active boolean NOT NULL DEFAULT true,
  created_by uuid DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT foods_name_valid CHECK (char_length(trim(name)) BETWEEN 1 AND 120),
  CONSTRAINT foods_category_valid CHECK (char_length(trim(category)) BETWEEN 1 AND 80),
  CONSTRAINT foods_brand_valid CHECK (brand IS NULL OR char_length(brand) <= 120),
  CONSTRAINT foods_notes_valid CHECK (notes IS NULL OR char_length(notes) <= 1000),
  CONSTRAINT foods_carbs_valid CHECK (carbs_per_100g >= 0 AND carbs_per_100g <= 100)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.foods TO authenticated;
GRANT ALL ON public.foods TO service_role;
ALTER TABLE public.foods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "foods_household_all" ON public.foods FOR ALL TO authenticated
  USING (household_id = public.current_household())
  WITH CHECK (household_id = public.current_household());
CREATE TRIGGER update_foods_updated_at BEFORE UPDATE ON public.foods
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX foods_household_name_idx ON public.foods (household_id, name);

CREATE TABLE public.meals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL DEFAULT public.current_household() REFERENCES public.households(id) ON DELETE CASCADE,
  created_by uuid DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by_name text NOT NULL DEFAULT '',
  glucose numeric(8,2) NOT NULL,
  total_carbs numeric(10,3) NOT NULL,
  meal_insulin numeric(10,4) NOT NULL,
  correction_insulin numeric(10,4) NOT NULL,
  total_dose numeric(10,4) NOT NULL,
  adjusted_dose numeric(10,4),
  parameters_used jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meals_glucose_valid CHECK (glucose > 0 AND glucose <= 1000),
  CONSTRAINT meals_total_carbs_valid CHECK (total_carbs >= 0),
  CONSTRAINT meals_doses_valid CHECK (meal_insulin >= 0 AND correction_insulin >= 0 AND total_dose >= 0 AND (adjusted_dose IS NULL OR adjusted_dose >= 0)),
  CONSTRAINT meals_parameters_object CHECK (jsonb_typeof(parameters_used) = 'object')
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meals TO authenticated;
GRANT ALL ON public.meals TO service_role;
ALTER TABLE public.meals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "meals_household_all" ON public.meals FOR ALL TO authenticated
  USING (household_id = public.current_household())
  WITH CHECK (household_id = public.current_household());
CREATE INDEX meals_household_created_idx ON public.meals (household_id, created_at DESC);

CREATE TABLE public.meal_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meal_id uuid NOT NULL REFERENCES public.meals(id) ON DELETE CASCADE,
  food_id uuid REFERENCES public.foods(id) ON DELETE SET NULL,
  food_name_snapshot text NOT NULL,
  brand_snapshot text,
  weight_grams numeric(10,3) NOT NULL,
  carbs_per_100g_snapshot numeric(8,3) NOT NULL,
  calculated_carbs numeric(10,3) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meal_items_name_valid CHECK (char_length(trim(food_name_snapshot)) BETWEEN 1 AND 120),
  CONSTRAINT meal_items_weight_valid CHECK (weight_grams > 0),
  CONSTRAINT meal_items_carbs_per_100g_valid CHECK (carbs_per_100g_snapshot >= 0 AND carbs_per_100g_snapshot <= 100),
  CONSTRAINT meal_items_calculated_carbs_valid CHECK (calculated_carbs >= 0)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meal_items TO authenticated;
GRANT ALL ON public.meal_items TO service_role;
ALTER TABLE public.meal_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "meal_items_household_select" ON public.meal_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.meals m WHERE m.id = meal_id AND m.household_id = public.current_household()));
CREATE POLICY "meal_items_household_insert" ON public.meal_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.meals m WHERE m.id = meal_id AND m.household_id = public.current_household()));
CREATE POLICY "meal_items_household_update" ON public.meal_items FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.meals m WHERE m.id = meal_id AND m.household_id = public.current_household()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.meals m WHERE m.id = meal_id AND m.household_id = public.current_household()));
CREATE POLICY "meal_items_household_delete" ON public.meal_items FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.meals m WHERE m.id = meal_id AND m.household_id = public.current_household()));
CREATE INDEX meal_items_meal_idx ON public.meal_items (meal_id);

CREATE POLICY "food_images_household_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'food-images' AND (storage.foldername(name))[1] = public.current_household()::text);
CREATE POLICY "food_images_household_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'food-images' AND (storage.foldername(name))[1] = public.current_household()::text);
CREATE POLICY "food_images_household_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'food-images' AND (storage.foldername(name))[1] = public.current_household()::text)
  WITH CHECK (bucket_id = 'food-images' AND (storage.foldername(name))[1] = public.current_household()::text);
CREATE POLICY "food_images_household_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'food-images' AND (storage.foldername(name))[1] = public.current_household()::text);

ALTER PUBLICATION supabase_realtime ADD TABLE public.foods;
ALTER PUBLICATION supabase_realtime ADD TABLE public.meals;
ALTER PUBLICATION supabase_realtime ADD TABLE public.meal_items;