import type { ValueFormat } from "@/lib/engine/compute";

const currency = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const number = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
const percent = new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 1 });

export function formatValue(value: number | null, format: ValueFormat): string {
  if (value === null) return "—";
  if (format === "currency") return currency.format(value);
  if (format === "percent") return percent.format(value);
  return number.format(value);
}

/** Libellé lisible d'une période : 2026-03 → mars 2026, 2026-T1 → T1 2026. */
export function formatPeriod(key: string): string {
  const month = /^(\d{4})-(\d{2})$/.exec(key);
  if (month) {
    return new Date(Date.UTC(Number(month[1]), Number(month[2]) - 1, 1)).toLocaleDateString("fr-FR", { month: "short", year: "numeric", timeZone: "UTC" });
  }
  const quarter = /^(\d{4})-T(\d)$/.exec(key);
  if (quarter) return `T${quarter[2]} ${quarter[1]}`;
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (day) return `${day[3]}/${day[2]}/${day[1]}`;
  return key;
}
