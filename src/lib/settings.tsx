import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { FINANCE_CATEGORIES, PRODUCT_CATEGORIES } from "@/lib/types";

export type HouseholdSettings = {
  household_id: string;
  theme: string;
  product_categories: string[];
  finance_categories: string[];
  finance_reset_day: number;
  notifications_enabled: boolean;
  reminder_minutes: number;
  reminder_hour: number;
  insulin_carb_ratio: number;
  target_glucose: number;
  correction_factor: number;
  dose_increment: number;
};

export const THEMES: { key: string; label: string; swatch: string[] }[] = [
  { key: "salvia", label: "Sálvia", swatch: ["#4c8464", "#e0a662", "#f8f6ef"] },
  { key: "oceano", label: "Oceano", swatch: ["#2f6f9f", "#4fb3a5", "#f1f6fa"] },
  { key: "lavanda", label: "Lavanda", swatch: ["#7159a8", "#d98ab5", "#f7f4fb"] },
  { key: "terracota", label: "Terracota", swatch: ["#b05c3c", "#d9a44a", "#fbf3ec"] },
  { key: "grafite", label: "Grafite", swatch: ["#3f4a56", "#8fa3b8", "#f3f4f6"] },
  { key: "noite", label: "Noite", swatch: ["#7bc9a4", "#e0a662", "#1c2320"] },
];

export const DEFAULT_SETTINGS = {
  theme: "salvia",
  product_categories: [...PRODUCT_CATEGORIES] as string[],
  finance_categories: [...FINANCE_CATEGORIES] as string[],
  finance_reset_day: 1,
  notifications_enabled: true,
  reminder_minutes: 1440,
  reminder_hour: 9,
  insulin_carb_ratio: 18,
  target_glucose: 100,
  correction_factor: 150,
  dose_increment: 0.5,
};

export function useSettings(enabled = true) {
  return useQuery({
    queryKey: ["household_settings"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from("household_settings").select("*").limit(1).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        household_id: data.household_id,
        theme: data.theme || DEFAULT_SETTINGS.theme,
        product_categories: Array.isArray(data.product_categories)
          ? (data.product_categories as string[])
          : DEFAULT_SETTINGS.product_categories,
        finance_categories: Array.isArray(data.finance_categories)
          ? (data.finance_categories as string[])
          : DEFAULT_SETTINGS.finance_categories,
        finance_reset_day: data.finance_reset_day ?? DEFAULT_SETTINGS.finance_reset_day,
        notifications_enabled: data.notifications_enabled ?? DEFAULT_SETTINGS.notifications_enabled,
        reminder_minutes: data.reminder_minutes ?? DEFAULT_SETTINGS.reminder_minutes,
        reminder_hour: data.reminder_hour ?? DEFAULT_SETTINGS.reminder_hour,
        insulin_carb_ratio: Number(data.insulin_carb_ratio ?? DEFAULT_SETTINGS.insulin_carb_ratio),
        target_glucose: Number(data.target_glucose ?? DEFAULT_SETTINGS.target_glucose),
        correction_factor: Number(data.correction_factor ?? DEFAULT_SETTINGS.correction_factor),
        dose_increment: Number(data.dose_increment ?? DEFAULT_SETTINGS.dose_increment),
      } satisfies HouseholdSettings;
    },
  });
}

export function useProductCategories() {
  const { data } = useSettings();
  const list = data?.product_categories?.length ? data.product_categories : DEFAULT_SETTINGS.product_categories;
  return list;
}

export function useFinanceCategories() {
  const { data } = useSettings();
  const list = data?.finance_categories?.length ? data.finance_categories : DEFAULT_SETTINGS.finance_categories;
  return list;
}

export function useSaveSettings() {
  const qc = useQueryClient();
  return async (patch: Partial<Omit<HouseholdSettings, "household_id">>, existing?: string | null) => {
    const query = existing
      ? supabase.from("household_settings").update(patch).eq("household_id", existing)
      : supabase.from("household_settings").insert({ ...DEFAULT_SETTINGS, ...patch });
    const { error } = await query;
    if (error) throw error;
    await qc.invalidateQueries({ queryKey: ["household_settings"] });
  };
}

export function useApplyTheme(theme: string | undefined) {
  useEffect(() => {
    const root = document.documentElement;
    root.dataset["theme"] = theme || DEFAULT_SETTINGS.theme;
    root.classList.toggle("dark", theme === "noite");
  }, [theme]);
}
