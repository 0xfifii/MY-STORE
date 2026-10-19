import "server-only";
import { query, queryOne } from "../db";
import { getSettings, type StoreSettings } from "../settings";
import { TXN_SELECT, type TxnRow } from "../inventory";
import { addDays, formatDate, todayIn } from "../format";

export type ReportKind = "full" | "stock_in" | "stock_out" | "balance";

export type ReportParams = {
  from: string; // YYYY-MM-DD (inclusive, store time zone)
  to: string;   // YYYY-MM-DD (inclusive)
  kind: ReportKind;
  itemId?: string | null;
  categoryId?: number | null;
  /** What the user asked for (a Monday's "this week" is still a weekly report). */
  periodType?: PeriodType;
};

export type BalanceRow = {
  item_id: string;
  sku: string;
  name: string;
  category: string | null;
  unit: string;
  archived: boolean;
  opening_qty: string;
  opening_value: string;
  in_qty: string;
  in_value: string;
  out_qty: string;
  out_value: string;
  adj_qty: string;
  adj_value: string;
  closing_qty: string;
  closing_value: string;
  closing_cost: string;
  min_stock_level: string;
  status: "in_stock" | "low" | "out";
};

export type ReportSummary = {
  opening_value: string;
  in_value: string;
  out_value: string;
  adj_value: string;
  closing_value: string;
  in_count: number;
  out_count: number;
  adj_count: number;
  items_moved: number;
  items_received: number;
  items_issued: number;
};

export type Highlight = {
  item_id: string; name: string; sku: string; unit: string; qty: string; value: string; count: number;
};

export type PeriodType = "day" | "week" | "month" | "custom";

export type ReportData = {
  params: ReportParams;
  periodType: PeriodType;
  title: string;
  periodLabel: string;
  generatedAt: string;
  settings: StoreSettings;
  scopeLabel: string | null;
  summary: ReportSummary;
  stockIn: TxnRow[];
  stockOut: TxnRow[];
  corrections: TxnRow[];
  balances: BalanceRow[];
  lowStock: BalanceRow[];
  /** Ranked by value (units differ between items, so value is the fair comparison). */
  topIn: Highlight[];
  topOut: Highlight[];
  /** Day-by-day stock sheet (S/N, item, opening, in, out, closing) — each day's closing is the next day's opening. */
  days: DaySheet[];
  /** Stock taken per worker during the period. */
  byWorker: { name: string; takes: number; value: string; items: number }[];
};

export type DaySheetRow = { item_id: string; name: string; sku: string; unit: string; opening: string; in: string; out: string; adj: string; closing: string };
export type DaySheet = { day: string; rows: DaySheetRow[] };

export const KIND_LABEL: Record<ReportKind, string> = {
  full: "Inventory Report",
  stock_in: "Stock In Report",
  stock_out: "Stock Out Report",
  balance: "Inventory Balance Report",
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Monday of the week containing the given date. */
export function weekStart(isoDate: string) {
  const dow = new Date(isoDate + "T12:00:00Z").getUTCDay(); // 0 = Sunday
  return addDays(isoDate, -((dow + 6) % 7));
}

export function periodTypeOf(from: string, to: string, explicit?: PeriodType): PeriodType {
  if (explicit) return explicit;
  if (from === to) return "day";
  // A week (Mon–Sun) or month, including "week to date" / "month to date".
  if (weekStart(from) === from && to <= addDays(from, 6)) return "week";
  if (from.endsWith("-01") && from.slice(0, 7) === to.slice(0, 7)) return "month";
  return "custom";
}

export function normaliseParams(raw: Record<string, string | null | undefined>, timeZone: string): ReportParams {
  const today = todayIn(timeZone);
  let from = raw.from && DATE_RE.test(raw.from) ? raw.from : null;
  let to = raw.to && DATE_RE.test(raw.to) ? raw.to : null;
  switch (raw.preset) {
    case "today": from = to = today; break;
    case "yesterday": from = to = addDays(today, -1); break;
    case "this_month": from = today.slice(0, 8) + "01"; to = today; break;
    case "this_week": from = weekStart(today); to = today; break;
    case "last_week": from = addDays(weekStart(today), -7); to = addDays(from, 6); break;
    case "week": {
      // raw.week = any date inside the wanted week (Monday–Sunday)
      const d = raw.week && DATE_RE.test(raw.week) ? raw.week : today;
      from = weekStart(d); to = addDays(from, 6);
      break;
    }
    case "last_month": {
      const firstThis = today.slice(0, 8) + "01";
      const lastPrev = addDays(firstThis, -1);
      from = lastPrev.slice(0, 8) + "01"; to = lastPrev; break;
    }
    case "month": {
      // raw.month = YYYY-MM
      if (raw.month && /^\d{4}-\d{2}$/.test(raw.month)) {
        from = `${raw.month}-01`;
        const next = new Date(Date.UTC(Number(raw.month.slice(0, 4)), Number(raw.month.slice(5, 7)), 1));
        to = addDays(next.toISOString().slice(0, 10), -1);
      }
      break;
    }
  }
  from = from ?? today;
  to = to ?? from;
  if (to < from) [from, to] = [to, from];
  // Reports can't cover the future: a current week/month runs to today.
  if (to > today) to = today;
  if (from > today) from = today;
  const kind = (["full", "stock_in", "stock_out", "balance"].includes(raw.kind ?? "") ? raw.kind : "full") as ReportKind;
  const itemId = raw.item && /^[0-9a-f-]{36}$/i.test(raw.item) ? raw.item : null;
  const categoryId = raw.category && /^\d+$/.test(raw.category) ? Number(raw.category) : null;
  const periodType: PeriodType | undefined =
    raw.period_type === "week" || raw.period_type === "month" ? raw.period_type
    : ["week", "this_week", "last_week"].includes(raw.preset ?? "") ? "week"
    : ["month", "this_month", "last_month"].includes(raw.preset ?? "") ? "month"
    : undefined;
  return { from, to, kind, itemId, categoryId, periodType };
}

/**
 * Builds a report purely from the stock_transactions ledger.
 * Opening = all movements before the period; Closing = Opening + In − Out ± Corrections.
 */
export async function buildReport(params: ReportParams, settings?: StoreSettings): Promise<ReportData> {
  const s = settings ?? (await getSettings());
  const tz = s.timezone;
  const endExclusive = addDays(params.to, 1);

  const scopeSql = `
    ($4::uuid IS NULL OR i.id = $4::uuid)
    AND ($5::int IS NULL OR i.category_id = $5::int)`;

  const balanceCte = `
    WITH bounds AS (
      SELECT ($1::date)::timestamp AT TIME ZONE $3 AS s,
             ($2::date)::timestamp AT TIME ZONE $3 AS e
    ),
    agg AS (
      SELECT t.item_id,
        coalesce(sum(t.direction * t.quantity)    FILTER (WHERE t.occurred_at < b.s), 0) AS opening_qty,
        coalesce(sum(t.direction * t.total_value) FILTER (WHERE t.occurred_at < b.s), 0) AS opening_value,
        coalesce(sum(t.quantity)    FILTER (WHERE t.txn_type='stock_in'  AND t.occurred_at >= b.s AND t.occurred_at < b.e), 0) AS in_qty,
        coalesce(sum(t.total_value) FILTER (WHERE t.txn_type='stock_in'  AND t.occurred_at >= b.s AND t.occurred_at < b.e), 0) AS in_value,
        coalesce(sum(t.quantity)    FILTER (WHERE t.txn_type='stock_out' AND t.occurred_at >= b.s AND t.occurred_at < b.e), 0) AS out_qty,
        coalesce(sum(t.total_value) FILTER (WHERE t.txn_type='stock_out' AND t.occurred_at >= b.s AND t.occurred_at < b.e), 0) AS out_value,
        coalesce(sum(t.direction * t.quantity)    FILTER (WHERE t.txn_type='reversal' AND t.occurred_at >= b.s AND t.occurred_at < b.e), 0) AS adj_qty,
        coalesce(sum(t.direction * t.total_value) FILTER (WHERE t.txn_type='reversal' AND t.occurred_at >= b.s AND t.occurred_at < b.e), 0) AS adj_value
      FROM stock_transactions t CROSS JOIN bounds b
      WHERE t.occurred_at < b.e
      GROUP BY t.item_id
    ),
    rows AS (
      SELECT i.id AS item_id, i.sku, i.name, c.name AS category, u.symbol AS unit,
             i.archived_at IS NOT NULL AS archived, i.min_stock_level,
             coalesce(a.opening_qty, 0) AS opening_qty, coalesce(a.opening_value, 0) AS opening_value,
             coalesce(a.in_qty, 0) AS in_qty, coalesce(a.in_value, 0) AS in_value,
             coalesce(a.out_qty, 0) AS out_qty, coalesce(a.out_value, 0) AS out_value,
             coalesce(a.adj_qty, 0) AS adj_qty, coalesce(a.adj_value, 0) AS adj_value
        FROM items i
        JOIN units u ON u.id = i.unit_id
        LEFT JOIN categories c ON c.id = i.category_id
        LEFT JOIN agg a ON a.item_id = i.id
       WHERE ${scopeSql}
         AND (a.item_id IS NOT NULL OR (i.archived_at IS NULL AND i.created_at < (SELECT e FROM bounds)))
    ),
    final AS (
      SELECT *,
             opening_qty + in_qty - out_qty + adj_qty AS closing_qty,
             opening_value + in_value - out_value + adj_value AS closing_value
        FROM rows
       WHERE NOT (archived AND opening_qty = 0 AND in_qty = 0 AND out_qty = 0 AND adj_qty = 0)
    )`;
  const args = [params.from, endExclusive, tz, params.itemId ?? null, params.categoryId ?? null];

  const balances = await query<BalanceRow>(
    `${balanceCte}
     SELECT item_id, sku, name, category, unit, archived,
            trim_scale(opening_qty)::text AS opening_qty, opening_value::numeric(20,4)::text AS opening_value,
            trim_scale(in_qty)::text AS in_qty, in_value::numeric(20,4)::text AS in_value,
            trim_scale(out_qty)::text AS out_qty, out_value::numeric(20,4)::text AS out_value,
            trim_scale(adj_qty)::text AS adj_qty, adj_value::numeric(20,4)::text AS adj_value,
            trim_scale(closing_qty)::text AS closing_qty, closing_value::numeric(20,4)::text AS closing_value,
            (CASE WHEN closing_qty > 0 THEN round(closing_value / closing_qty, 6) ELSE 0 END)::text AS closing_cost,
            trim_scale(min_stock_level)::text AS min_stock_level,
            CASE WHEN closing_qty <= 0 THEN 'out' WHEN closing_qty <= min_stock_level THEN 'low' ELSE 'in_stock' END AS status
       FROM final ORDER BY lower(name), sku`,
    args,
  );

  const totals = await queryOne<{
    opening_value: string; in_value: string; out_value: string; adj_value: string; closing_value: string;
    items_moved: number; items_received: number; items_issued: number;
  }>(
    `${balanceCte}
     SELECT coalesce(sum(opening_value),0)::numeric(20,4)::text AS opening_value,
            coalesce(sum(in_value),0)::numeric(20,4)::text AS in_value,
            coalesce(sum(out_value),0)::numeric(20,4)::text AS out_value,
            coalesce(sum(adj_value),0)::numeric(20,4)::text AS adj_value,
            coalesce(sum(closing_value),0)::numeric(20,4)::text AS closing_value,
            count(*) FILTER (WHERE in_qty > 0 OR out_qty > 0 OR adj_qty <> 0)::int AS items_moved,
            count(*) FILTER (WHERE in_qty > 0)::int AS items_received,
            count(*) FILTER (WHERE out_qty > 0)::int AS items_issued
       FROM final`,
    args,
  );

  const txnWhere = `
    WHERE t.occurred_at >= ($1::date)::timestamp AT TIME ZONE $3
      AND t.occurred_at <  ($2::date)::timestamp AT TIME ZONE $3
      AND ($4::uuid IS NULL OR t.item_id = $4::uuid)
      AND ($5::int IS NULL OR i.category_id = $5::int)`;
  const txns = await query<TxnRow>(`${TXN_SELECT} ${txnWhere} ORDER BY t.occurred_at, t.id`, args);
  // Day-by-day sheet: start from each item's opening balance and roll forward one day at a time.
  const days: DaySheet[] = [];
  const dayList: string[] = [];
  for (let d = params.from; d <= params.to && dayList.length < 92; d = addDays(d, 1)) dayList.push(d);
  if (balances.length) {
    const moves = await query<{ item_id: string; day: string; in_q: string; out_q: string; adj_q: string }>(
      `SELECT t.item_id, to_char((t.occurred_at AT TIME ZONE $3)::date, 'YYYY-MM-DD') AS day,
              coalesce(sum(t.quantity) FILTER (WHERE t.txn_type='stock_in'), 0)::text AS in_q,
              coalesce(sum(t.quantity) FILTER (WHERE t.txn_type='stock_out'), 0)::text AS out_q,
              coalesce(sum(t.direction * t.quantity) FILTER (WHERE t.txn_type='reversal'), 0)::text AS adj_q
         FROM stock_transactions t JOIN items i ON i.id = t.item_id
        WHERE t.occurred_at >= ($1::date)::timestamp AT TIME ZONE $3
          AND t.occurred_at <  ($2::date)::timestamp AT TIME ZONE $3
          AND ($4::uuid IS NULL OR t.item_id = $4::uuid)
          AND ($5::int IS NULL OR i.category_id = $5::int)
        GROUP BY 1, 2`,
      args,
    );
    const key = (id: string, d: string) => `${id}|${d}`;
    const mv = new Map(moves.map((m) => [key(m.item_id, m.day), m]));
    // Exact decimal arithmetic at 6 dp (quantities are numeric(20,6) in the database).
    const S = 1000000n;
    const toN = (v: string) => {
      const neg = v.startsWith("-");
      const [a, b = ""] = (neg ? v.slice(1) : v).split(".");
      const n = BigInt(a || "0") * S + BigInt((b + "000000").slice(0, 6));
      return neg ? -n : n;
    };
    const toS = (n: bigint) => {
      const neg = n < 0n;
      const x = neg ? -n : n;
      const f = (x % S).toString().padStart(6, "0").replace(/0+$/, "");
      return `${neg ? "-" : ""}${x / S}${f ? "." + f : ""}`;
    };
    const running = new Map(balances.map((b) => [b.item_id, toN(b.opening_qty)]));
    for (const d of dayList) {
      const rows: DaySheetRow[] = [];
      for (const b of balances) {
        const open = running.get(b.item_id) ?? 0n;
        const m = mv.get(key(b.item_id, d));
        const i = m ? toN(m.in_q) : 0n;
        const o = m ? toN(m.out_q) : 0n;
        const a = m ? toN(m.adj_q) : 0n;
        const close = open + i - o + a;
        running.set(b.item_id, close);
        rows.push({ item_id: b.item_id, name: b.name, sku: b.sku, unit: b.unit, opening: toS(open), in: toS(i), out: toS(o), adj: toS(a), closing: toS(close) });
      }
      days.push({ day: d, rows });
    }
  }

  const byWorker = await query<{ name: string; takes: number; value: string; items: number }>(
    `SELECT coalesce(w.name, 'Not recorded') AS name, count(*)::int AS takes, sum(t.total_value)::numeric(20,2)::text AS value,
            count(DISTINCT t.item_id)::int AS items
       FROM stock_transactions t JOIN items i ON i.id = t.item_id LEFT JOIN workers w ON w.id = t.worker_id
      WHERE t.txn_type = 'stock_out'
        AND t.occurred_at >= ($1::date)::timestamp AT TIME ZONE $3
        AND t.occurred_at <  ($2::date)::timestamp AT TIME ZONE $3
        AND ($4::uuid IS NULL OR t.item_id = $4::uuid)
        AND ($5::int IS NULL OR i.category_id = $5::int)
        AND NOT EXISTS (SELECT 1 FROM stock_transactions rv WHERE rv.reverses_id = t.id)
      GROUP BY coalesce(w.name, 'Not recorded') ORDER BY sum(t.total_value) DESC`,
    args,
  );

  const stockIn = txns.filter((t) => t.txn_type === "stock_in");
  const stockOut = txns.filter((t) => t.txn_type === "stock_out");
  const corrections = txns.filter((t) => t.txn_type === "reversal");

  let scopeLabel: string | null = null;
  if (params.itemId) {
    const it = await queryOne<{ name: string; sku: string }>("SELECT name, sku FROM items WHERE id = $1", [params.itemId]);
    scopeLabel = it ? `Item: ${it.name} (${it.sku})` : "Item: (not found)";
  } else if (params.categoryId) {
    const c = await queryOne<{ name: string }>("SELECT name FROM categories WHERE id = $1", [params.categoryId]);
    scopeLabel = `Category: ${c?.name ?? "(not found)"}`;
  }

  const periodType = periodTypeOf(params.from, params.to, params.periodType);
  const periodLabel =
    periodType === "month"
      ? `${new Date(params.from + "T12:00:00Z").toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })} (${formatDate(params.from)} – ${formatDate(params.to)})`
      : params.from === params.to ? formatDate(params.from) : `${formatDate(params.from)} – ${formatDate(params.to)}`;

  const counts = (rows: TxnRow[]) => rows.reduce<Record<string, number>>((m, t) => ((m[t.item_id] = (m[t.item_id] ?? 0) + 1), m), {});
  const inCount = counts(stockIn);
  const outCount = counts(stockOut);
  const rank = (key: "in" | "out") =>
    balances
      .filter((b) => Number(key === "in" ? b.in_qty : b.out_qty) > 0)
      .map((b) => ({
        item_id: b.item_id, name: b.name, sku: b.sku, unit: b.unit,
        qty: key === "in" ? b.in_qty : b.out_qty,
        value: key === "in" ? b.in_value : b.out_value,
        count: (key === "in" ? inCount : outCount)[b.item_id] ?? 0,
      }))
      .sort((a, b) => Number(b.value) - Number(a.value) || Number(b.qty) - Number(a.qty) || b.count - a.count)
      .slice(0, 5);

  return {
    params,
    periodType,
    title: titleFor(params.kind, periodType),
    periodLabel,
    generatedAt: new Date().toISOString(),
    settings: s,
    scopeLabel,
    summary: {
      opening_value: totals!.opening_value,
      in_value: totals!.in_value,
      out_value: totals!.out_value,
      adj_value: totals!.adj_value,
      closing_value: totals!.closing_value,
      in_count: stockIn.length,
      out_count: stockOut.length,
      adj_count: corrections.length,
      items_moved: totals!.items_moved,
      items_received: totals!.items_received,
      items_issued: totals!.items_issued,
    },
    stockIn,
    stockOut,
    corrections,
    balances,
    lowStock: balances.filter((b) => !b.archived && b.status !== "in_stock"),
    topIn: rank("in"),
    topOut: rank("out"),
    days,
    byWorker,
  };
}

export function titleFor(kind: ReportKind, periodType: PeriodType) {
  const prefix = { day: "Daily", week: "Weekly", month: "Monthly", custom: "" }[periodType];
  return prefix ? `${prefix} ${KIND_LABEL[kind]}` : KIND_LABEL[kind];
}

export function reportFileName(p: ReportParams, ext: string) {
  const pt = periodTypeOf(p.from, p.to, p.periodType);
  const kind = (pt === "week" ? "weekly-" : pt === "month" ? "monthly-" : "") + (p.kind === "full" ? "report" : p.kind.replace("_", "-"));
  const period = p.from === p.to ? p.from : `${p.from}_to_${p.to}`;
  return `mystore-${kind}-${period}.${ext}`;
}

/** Which sections a report kind contains. */
export function sectionsFor(kind: ReportKind) {
  return {
    stockIn: kind === "full" || kind === "stock_in",
    stockOut: kind === "full" || kind === "stock_out",
    corrections: kind === "full",
    // Every report ends with each item's opening → closing balance (closing carries forward as the next opening).
    balances: true,
    lowStock: kind === "full" || kind === "balance",
    highlights: kind !== "balance",
  };
}
