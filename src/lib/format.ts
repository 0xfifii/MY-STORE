// Formatting helpers shared by server and client code.
// Quantities come from Postgres as exact decimal strings; we never convert
// them through floating point for display.

/** "12.500000" -> "12.5", "1000.000000" -> "1,000" */
export function formatQty(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "0";
  let s = typeof value === "number" ? value.toFixed(6) : String(value);
  let neg = false;
  if (s.startsWith("-")) { neg = true; s = s.slice(1); }
  let [int, frac = ""] = s.split(".");
  frac = frac.replace(/0+$/, "");
  int = int.replace(/^0+(?=\d)/, "");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const out = frac ? `${grouped}.${frac}` : grouped;
  return neg && out !== "0" ? `-${out}` : out;
}

export function formatQtyUnit(value: string | number | null | undefined, unit?: string | null) {
  return unit ? `${formatQty(value)} ${unit}` : formatQty(value);
}

/** Plain decimal string without grouping, for inputs/exports. */
export function plainQty(value: string | number | null | undefined): string {
  return formatQty(value).replace(/,/g, "");
}

export function formatMoney(value: string | number | null | undefined, symbol = "₦"): string {
  const n = Number(value ?? 0);
  const abs = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${n < 0 ? "-" : ""}${symbol}${abs}`;
}

/** Unit cost can carry more precision (e.g. ₦1,043.137255 per kg). Show up to 4 dp. */
export function formatUnitCost(value: string | number | null | undefined, symbol = "₦"): string {
  const n = Number(value ?? 0);
  const s = n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  return `${symbol}${s}`;
}

export function formatDateTime(value: string | Date, timeZone = "Africa/Lagos") {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone, day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date(value));
}

export function formatDate(value: string | Date, timeZone = "Africa/Lagos") {
  const d = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(value + "T12:00:00Z") : new Date(value);
  const tz = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? "UTC" : timeZone;
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, day: "2-digit", month: "short", year: "numeric" }).format(d);
}

/** YYYY-MM-DD for "now" in the given time zone. */
export function todayIn(timeZone: string, now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const STOCK_OUT_REASONS = [
  { value: "store_usage", label: "Store usage" },
  { value: "kitchen_usage", label: "Kitchen usage" },
  { value: "bakery_usage", label: "Bakery usage" },
  { value: "bar_usage", label: "Bar usage" },
  { value: "cleaning_usage", label: "Cleaning usage" },
  { value: "sale", label: "Sale" },
  { value: "transfer", label: "Transfer" },
  { value: "damage", label: "Damage" },
  { value: "expiry", label: "Expiry" },
  { value: "wastage", label: "Wastage" },
  { value: "other", label: "Other" },
] as const;

export function reasonLabel(v: string | null | undefined) {
  return STOCK_OUT_REASONS.find((r) => r.value === v)?.label ?? (v ?? "");
}

export type StockStatus = "in_stock" | "low" | "out";

export function stockStatus(qty: string | number, min: string | number): StockStatus {
  const q = Number(qty);
  if (q <= 0) return "out";
  if (q <= Number(min)) return "low";
  return "in_stock";
}

export const STATUS_LABEL: Record<StockStatus, string> = {
  in_stock: "In stock",
  low: "Low stock",
  out: "Out of stock",
};
