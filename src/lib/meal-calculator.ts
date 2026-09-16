export type InsulinParameters = {
  insulinCarbRatio: number;
  targetGlucose: number;
  correctionFactor: number;
  doseIncrement: number;
};

export type MealCalculation = {
  totalCarbs: number;
  mealInsulin: number;
  correctionInsulin: number;
  totalDose: number;
  adjustedDose: number;
};

/** Decimal-safe multiplication for grams and carbs per 100 g. */
export function calculateFoodCarbs(weightGrams: number, carbsPer100g: number) {
  const weightMilli = Math.round(weightGrams * 1000);
  const carbsMilli = Math.round(carbsPer100g * 1000);
  return Math.round((weightMilli * carbsMilli) / 100_000) / 1000;
}

export function calculateInsulin(
  itemCarbs: number[],
  glucose: number,
  parameters: InsulinParameters,
): MealCalculation {
  const totalCarbsMilli = itemCarbs.reduce((sum, value) => sum + Math.round(value * 1000), 0);
  const totalCarbs = totalCarbsMilli / 1000;
  const mealInsulin = totalCarbs / parameters.insulinCarbRatio;
  const correctionInsulin = glucose > parameters.targetGlucose
    ? (glucose - parameters.targetGlucose) / parameters.correctionFactor
    : 0;
  const totalDose = mealInsulin + correctionInsulin;
  const adjustedDose = Math.round(totalDose / parameters.doseIncrement) * parameters.doseIncrement;
  return { totalCarbs, mealInsulin, correctionInsulin, totalDose, adjustedDose };
}

export function parseDecimal(value: string) {
  const normalized = value.trim().replace(/\s/g, "").replace(",", ".");
  if (!normalized) return Number.NaN;
  return Number(normalized);
}

export function formatDecimal(value: number, digits = 1) {
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}
