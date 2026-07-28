export const brl = (v: number | null | undefined) =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Parses "R$ 1.234,56" / "1234,56" / "1234.56" into a number. */
export function parseCurrency(input: string): number {
  if (!input) return 0;
  const cleaned = input.replace(/[^\d,.-]/g, "");
  if (cleaned.includes(",")) {
    return Number(cleaned.replace(/\./g, "").replace(",", ".")) || 0;
  }
  return Number(cleaned) || 0;
}

/** Currency mask for typed digits: "1234" -> "R$ 12,34" */
export function maskCurrency(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 13);
  if (!digits) return "";
  return (Number(digits) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export const qty = (v: number) =>
  Number.isInteger(Number(v)) ? String(Number(v)) : Number(v).toFixed(3).replace(/0+$/, "").replace(/\.$/, "");

export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function daysSince(iso: string | null) {
  if (!iso) return 0;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}
