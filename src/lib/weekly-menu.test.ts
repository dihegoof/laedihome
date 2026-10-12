import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { compatibleUnits, prioritizeDays, prioritizeMeals, stockAmount, weekStart, type MenuPlan } from "./weekly-menu";
import { formatStock } from "./format";

describe("Weekly household menu rules", () => {
  test("shows today ahead of other days", () => {
    assert.deepEqual(prioritizeDays(["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08"], "2026-10-07"), ["2026-10-07", "2026-10-08", "2026-10-05", "2026-10-06"]);
  });
  test("orders pending meals by type regardless of saved time", () => {
    const plans = [{ id: "breakfast", meal_type: "breakfast", meal_date: "2026-10-07", meal_time: "23:00", status: "pending" }, { id: "dinner", meal_type: "dinner", meal_date: "2026-10-07", meal_time: "01:00", status: "pending" }, { id: "lunch", meal_type: "lunch", meal_date: "2026-10-07", meal_time: "02:00", status: "pending" }, { id: "afternoon", meal_type: "afternoon", meal_date: "2026-10-07", meal_time: "03:00", status: "pending" }] as MenuPlan[];
    assert.deepEqual(prioritizeMeals(plans, new Date("2026-10-07T10:00:00")).map((p) => p.id), ["breakfast", "lunch", "afternoon", "dinner"]);
  });
  test("uses the same flour stock for 300 g cake and 1 kg bread", () => {
    assert.equal(stockAmount(300, "g", "kg"), 0.3);
    assert.equal(stockAmount(1, "kg", "kg"), 1);
    assert.equal(stockAmount(1, "kg", "g"), 1000);
    assert.equal(2 - stockAmount(300, "g", "kg") - stockAmount(1, "kg", "kg"), 0.7);
  });
  test("converts at the 1000 gram boundary, not below", () => {
    assert.equal(formatStock(999, "g"), "999 g");
    assert.equal(formatStock(1000, "g"), "1 kg");
    assert.equal(formatStock(0.3, "kg"), "300 g");
  });
  test("converts ingredient grams into kilograms", () => { assert.equal(stockAmount(250, "g", "kg"), 0.25); });
  test("converts ingredient milliliters into liters", () => { assert.equal(stockAmount(500, "ml", "l"), 0.5); });
  test("does not guess units as mass or volume", () => { assert.deepEqual(compatibleUnits("un"), ["un"]); assert.ok(Number.isNaN(stockAmount(1, "kg", "un"))); });
  test("rejects mass-to-volume conversions", () => { assert.ok(Number.isNaN(stockAmount(100, "g", "ml"))); });
  test("includes all seven days from Monday", () => { assert.equal(weekStart("2026-10-07"), "2026-10-05"); });
});