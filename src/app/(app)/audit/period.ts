import { addDays } from "@/lib/format";
import { weekStart } from "@/lib/reports/engine";

export type PeriodKind = "day" | "week" | "month" | "year" | "custom";
export type Period = { kind: PeriodKind; from: string; to: string; label: string; anchor: string; prev: string | null; next: string | null };

const D = /^\d{4}-\d{2}-\d{2}$/;
const fmt = (d: string, o: Intl.DateTimeFormatOptions) => new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", { ...o, timeZone: "UTC" });

/** Resolves ?p=day|week|month|year|custom&d=<any date in the period>&from&to. Never runs past today. */
export function resolvePeriod(sp: { p?: string; d?: string; from?: string; to?: string }, today: string): Period {
  const kind: PeriodKind = (["day", "week", "month", "year", "custom"] as const).includes(sp.p as PeriodKind) ? (sp.p as PeriodKind) : "month";
  const anchor = sp.d && D.test(sp.d) && sp.d <= today ? sp.d : today;
  let from = anchor, to = anchor, label = "", prev: string | null = null, next: string | null = null;
  if (kind === "day") {
    label = fmt(anchor, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    prev = addDays(anchor, -1); next = addDays(anchor, 1);
  } else if (kind === "week") {
    from = weekStart(anchor); to = addDays(from, 6);
    label = `Week of ${fmt(from, { day: "numeric", month: "short", year: "numeric" })}`;
    prev = addDays(from, -7); next = addDays(from, 7);
  } else if (kind === "month") {
    from = anchor.slice(0, 8) + "01";
    const [y, m] = from.split("-").map(Number);
    to = addDays(new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10), -1);
    label = fmt(from, { month: "long", year: "numeric" });
    prev = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 10);
    next = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  } else if (kind === "year") {
    from = anchor.slice(0, 4) + "-01-01"; to = anchor.slice(0, 4) + "-12-31";
    label = anchor.slice(0, 4);
    prev = `${Number(anchor.slice(0, 4)) - 1}-01-01`; next = `${Number(anchor.slice(0, 4)) + 1}-01-01`;
  } else {
    from = sp.from && D.test(sp.from) ? sp.from : addDays(today, -29);
    to = sp.to && D.test(sp.to) ? sp.to : today;
    if (to < from) [from, to] = [to, from];
    label = `${fmt(from, { day: "numeric", month: "short", year: "numeric" })} – ${fmt(to, { day: "numeric", month: "short", year: "numeric" })}`;
  }
  if (to > today) to = today;
  if (next && next > today) next = null;
  return { kind, from, to, label, anchor, prev, next };
}
