import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { compatibleUnits, prioritizeDays, prioritizeMeals, stockAmount, weekStart, type MenuPlan } from "./weekly-menu";

describe("Weekly household menu rules", () => {
  test("shows today ahead of other days", () => {
    assert.deepEqual(prioritizeDays(["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08"], "2026-10-07"), ["2026-10-07", "2026-10-08", "2026-10-05", "2026-10-06"]);
  });
  test("prioritizes the nearest upcoming meal today", () => {
    const plans = [{ id: "breakfast", meal_date: "2026-10-07", meal_time: "07:00", status: "pending" }, { id: "dinner", meal_date: "2026-10-07", meal_time: "19:00", status: "pending" }, { id: "lunch", meal_date: "2026-10-07", meal_time: "12:00", status: "pending" }] as MenuPlan[];
    assert.equal(prioritizeMeals(plans, new Date("2026-10-07T10:00:00"))[0]?.id, "lunch");
  });
  test("converts ingredient grams into kilograms", () => { assert.equal(stockAmount(250, "g", "kg"), 0.25); });
  test("converts ingredient milliliters into liters", () => { assert.equal(stockAmount(500, "ml", "l"), 0.5); });
  test("does not guess units as mass or volume", () => { assert.deepEqual(compatibleUnits("un"), ["un"]); assert.ok(Number.isNaN(stockAmount(1, "kg", "un"))); });
  test("rejects mass-to-volume conversions", () => { assert.ok(Number.isNaN(stockAmount(100, "g", "ml"))); });
  test("includes all seven days from Monday", () => { assert.equal(weekStart("2026-10-07"), "2026-10-05"); });
});