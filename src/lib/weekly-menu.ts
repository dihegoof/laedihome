import type { Tables } from "@/integrations/supabase/types";

export type StockUnit = "un" | "g" | "kg" | "ml" | "l";
export type MenuPlan = Tables<"menu_plans"> & { menu_ingredients: Tables<"menu_ingredients">[] };
export const STOCK_UNITS: StockUnit[] = ["un", "g", "kg", "ml", "l"];
export const MEAL_TYPES = [
  { value: "breakfast", label: "Café da manhã", time: "07:00" },
  { value: "lunch", label: "Almoço", time: "12:00" },
  { value: "afternoon", label: "Café da tarde", time: "16:00" },
  { value: "dinner", label: "Jantar", time: "19:00" },
] as const;
export function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function addDays(date: string, days: number): string {
  const result = new Date(`${date}T12:00:00`);
  result.setDate(result.getDate() + days);
  return localDate(result);
}
export function weekStart(date: string): string {
  const weekday = new Date(`${date}T12:00:00`).getDay();
  return addDays(date, -((weekday + 6) % 7));
}
export function compatibleUnits(unit: string): StockUnit[] {
  if (unit === "g" || unit === "kg") return ["g", "kg"];
  if (unit === "ml" || unit === "l") return ["ml", "l"];
  return ["un"];
}
export function stockAmount(amount: number, unit: string, stockUnit: string): number {
  if (!Number.isFinite(amount) || amount <= 0 || !compatibleUnits(stockUnit).includes(unit as StockUnit)) return NaN;
  if (unit === stockUnit) return amount;
  return unit === "g" || unit === "ml" ? amount / 1000 : amount * 1000;
}
export function prioritizeDays(days: string[], today: string): string[] {
  return [...days].sort((a, b) => {
    const rank = (d: string) => d === today ? 0 : d > today ? 1 : 2;
    return rank(a) - rank(b) || a.localeCompare(b);
  });
}
export function prioritizeMeals(plans: MenuPlan[], now: Date): MenuPlan[] {
  const today = localDate(now);
  const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const rank = (p: MenuPlan) => p.status !== "pending" ? 2 : p.meal_date === today && p.meal_time.slice(0, 5) < time ? 1 : 0;
  return [...plans].sort((a, b) => rank(a) - rank(b) || a.meal_time.localeCompare(b.meal_time));
}