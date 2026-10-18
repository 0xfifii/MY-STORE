// Exact decimal arithmetic for previews in the browser (6 decimal places, BigInt based).
// The database remains the source of truth; this only keeps on-screen previews exact,
// so 10 − 2.5 shows 7.5 and never 7.499999999.

const SCALE = 6;
const F = 10n ** BigInt(SCALE);

export function toScaled(v: string | number): bigint | null {
  const s = String(v).trim().replace(/,/g, "");
  const m = s.match(/^(-)?(\d*)(?:\.(\d*))?$/);
  if (!m || (!m[2] && !m[3])) return null;
  const frac = (m[3] ?? "").slice(0, SCALE).padEnd(SCALE, "0");
  const n = BigInt(m[2] || "0") * F + BigInt(frac || "0");
  return m[1] ? -n : n;
}

export function fromScaled(n: bigint): string {
  const neg = n < 0n;
  const a = neg ? -n : n;
  const int = a / F;
  const frac = (a % F).toString().padStart(SCALE, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${int}${frac ? "." + frac : ""}`;
}

/** a × factor, where factor may have more decimals (e.g. 1/12). Rounded half-up to 6 dp. */
export function mulFactor(a: string, factor: string): string | null {
  const x = toScaled(a);
  if (x === null) return null;
  const fm = String(factor).match(/^(\d*)(?:\.(\d*))?$/);
  if (!fm) return null;
  const fracDigits = (fm[2] ?? "").length;
  const fInt = BigInt((fm[1] || "0") + (fm[2] ?? ""));
  const den = 10n ** BigInt(fracDigits);
  const prod = x * fInt;
  const q = prod / den;
  const r = prod % den;
  return fromScaled(r * 2n >= den ? q + 1n : q);
}

export function add(a: string, b: string) {
  return fromScaled((toScaled(a) ?? 0n) + (toScaled(b) ?? 0n));
}
export function sub(a: string, b: string) {
  return fromScaled((toScaled(a) ?? 0n) - (toScaled(b) ?? 0n));
}
export function cmp(a: string, b: string) {
  const x = toScaled(a) ?? 0n;
  const y = toScaled(b) ?? 0n;
  return x === y ? 0 : x > y ? 1 : -1;
}
export function isValidQty(v: string) {
  return /^\d{1,14}(\.\d{1,6})?$/.test(v.trim().replace(/,/g, "")) && (toScaled(v) ?? 0n) > 0n;
}
