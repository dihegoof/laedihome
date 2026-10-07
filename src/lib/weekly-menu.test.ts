import { describe, expect, test } from "bun:test";
import { compatibleUnits, prioritizeDays, prioritizeMeals, stockAmount, weekStart, type MenuPlan } from "./weekly-menu";

describe("Weekly household menu rules", () => {
  test("shows today ahead of other days", () => {
    expect(prioritizeDays(["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08"], "2026-10-07")).toEqual(["2026-10-07", "2026-10-08", "2026-10-05", "2026-10-06"]);
  });
  test("prioritizes the nearest upcoming meal today", () => {
    const plans = [{ id: "breakfast", meal_date: "2026-10-07", meal_time: "07:00", status: "pending" }, { id: "dinner", meal_date: "2026-10-07", meal_time: "19:00", status: "pending" }, { id: "lunch", meal_date: "2026-10-07", meal_time: "12:00", status: "pending" }] as MenuPlan[];
    expect(prioritizeMeals(plans, new Date("2026-10-07T10:00:00"))[0]?.id).toBe("lunch");
  });
  test("converts ingredient grams into kilograms", () => { expect(stockAmount(250, "g", "kg")).toBe(0.25); });
  test("converts ingredient milliliters into liters", () => { expect(stockAmount(500, "ml", "l")).toBe(0.5); });
  test("does not guess units as mass or volume", () => { expect(compatibleUnits("un")).toEqual(["un"]); expect(stockAmount(1, "kg", "un")).toBeNaN(); });
  test("rejects mass-to-volume conversions", () => { expect(stockAmount(100, "g", "ml")).toBeNaN(); });
  test("includes all seven days from Monday", () => { expect(weekStart("2026-10-07")).toBe("2026-10-05"); });
});