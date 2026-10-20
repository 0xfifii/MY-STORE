import "server-only";
import { query, queryOne } from "./db";

/** Date range in the store's time zone; `to` is inclusive (YYYY-MM-DD). */
export type Range = { from: string; to: string; tz: string };

const BOUNDS = `($1::date)::timestamp AT TIME ZONE $3 AS s, (($2::date) + 1)::timestamp AT TIME ZONE $3 AS e`;

export type ItemUsage = { item_id: string; name: string; sku: string; unit: string; category: string | null; qty: string; value: string; takes: number; workers: number };
export type WorkerUsage = { worker_id: number | null; name: string; department: string | null; takes: number; value: string; items: number; last_at: string | null };
export type ReasonUsage = { reason: string; takes: number; value: string };
export type DayUsage = { day: string; in_value: string; out_value: string; out_count: number };
export type UserActivity = { user_id: string | null; name: string; ins: number; outs: number; corrections: number };
export type CategoryUsage = { category: string; value: string; takes: number };

/** Stock-out based usage analysis (net of reversals of those stock outs). */
export async function usageAnalysis(r: Range, filter: { workerId?: number | null; itemId?: string | null; categoryId?: number | null } = {}) {
  const args = [r.from, r.to, r.tz, filter.workerId ?? null, filter.itemId ?? null, filter.categoryId ?? null];
  const base = `
    WITH b AS (SELECT ${BOUNDS}),
    outs AS (
      SELECT t.* FROM stock_transactions t JOIN items i ON i.id = t.item_id CROSS JOIN b
       WHERE t.txn_type = 'stock_out' AND t.occurred_at >= b.s AND t.occurred_at < b.e
         AND NOT EXISTS (SELECT 1 FROM stock_transactions rv WHERE rv.reverses_id = t.id)
         AND ($4::int IS NULL OR t.worker_id = $4::int)
         AND ($5::uuid IS NULL OR t.item_id = $5::uuid)
         AND ($6::int IS NULL OR i.category_id = $6::int)
    )`;

  const [items, workers, reasons, totals, never] = await Promise.all([
    query<ItemUsage>(
      `${base}
       SELECT i.id AS item_id, i.name, i.sku, u.symbol AS unit, c.name AS category,
              trim_scale(sum(o.quantity))::text AS qty, sum(o.total_value)::numeric(20,2)::text AS value,
              count(*)::int AS takes, count(DISTINCT o.worker_id)::int AS workers
         FROM outs o JOIN items i ON i.id = o.item_id JOIN units u ON u.id = i.unit_id LEFT JOIN categories c ON c.id = i.category_id
        GROUP BY i.id, i.name, i.sku, u.symbol, c.name
        ORDER BY sum(o.total_value) DESC, sum(o.quantity) DESC`,
      args,
    ),
    query<WorkerUsage>(
      `${base}
       SELECT o.worker_id, coalesce(w.name, 'Not recorded') AS name, w.department,
              count(*)::int AS takes, sum(o.total_value)::numeric(20,2)::text AS value,
              count(DISTINCT o.item_id)::int AS items, max(o.occurred_at) AS last_at
         FROM outs o LEFT JOIN workers w ON w.id = o.worker_id
        GROUP BY o.worker_id, w.name, w.department
        ORDER BY sum(o.total_value) DESC`,
      args,
    ),
    query<ReasonUsage>(
      `${base}
       SELECT o.reason, count(*)::int AS takes, sum(o.total_value)::numeric(20,2)::text AS value
         FROM outs o GROUP BY o.reason ORDER BY sum(o.total_value) DESC`,
      args,
    ),
    queryOne<{ value: string; takes: number; items: number; workers: number }>(
      `${base}
       SELECT coalesce(sum(total_value),0)::numeric(20,2)::text AS value, count(*)::int AS takes,
              count(DISTINCT item_id)::int AS items, count(DISTINCT worker_id)::int AS workers FROM outs`,
      args,
    ),
    // Items that had stock during the period but were never taken.
    filter.workerId || filter.itemId
      ? Promise.resolve([] as { name: string; sku: string }[])
      : query<{ name: string; sku: string }>(
          `${base}
           SELECT i.name, i.sku FROM items i
            WHERE i.archived_at IS NULL AND ($6::int IS NULL OR i.category_id = $6::int)
              AND NOT EXISTS (SELECT 1 FROM outs o WHERE o.item_id = i.id)
              AND (i.quantity > 0 OR EXISTS (SELECT 1 FROM stock_transactions t CROSS JOIN b WHERE t.item_id = i.id AND t.occurred_at < b.e))
            ORDER BY lower(i.name) LIMIT 50`,
          args,
        ),
  ]);

  return { items, workers, reasons, totals: totals!, neverTaken: never };
}

export async function dailyMovement(r: Range) {
  return query<DayUsage>(
    `WITH days AS (SELECT generate_series($1::date, $2::date, interval '1 day')::date AS day)
     SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
            coalesce(sum(t.total_value) FILTER (WHERE t.txn_type='stock_in'), 0)::numeric(20,2)::text AS in_value,
            coalesce(sum(t.total_value) FILTER (WHERE t.txn_type='stock_out'), 0)::numeric(20,2)::text AS out_value,
            count(t.id) FILTER (WHERE t.txn_type='stock_out')::int AS out_count
       FROM days d
       LEFT JOIN stock_transactions t
         ON t.occurred_at >= d.day::timestamp AT TIME ZONE $3 AND t.occurred_at < (d.day + 1)::timestamp AT TIME ZONE $3
      GROUP BY d.day ORDER BY d.day`,
    [r.from, r.to, r.tz],
  );
}

export async function userActivity(r: Range) {
  return query<UserActivity>(
    `WITH b AS (SELECT ${BOUNDS})
     SELECT t.created_by AS user_id, coalesce(u.name, 'System') AS name,
            count(*) FILTER (WHERE t.txn_type='stock_in')::int AS ins,
            count(*) FILTER (WHERE t.txn_type='stock_out')::int AS outs,
            count(*) FILTER (WHERE t.txn_type='reversal')::int AS corrections
       FROM stock_transactions t CROSS JOIN b LEFT JOIN users u ON u.id = t.created_by
      WHERE t.occurred_at >= b.s AND t.occurred_at < b.e
      GROUP BY t.created_by, u.name ORDER BY count(*) DESC`,
    [r.from, r.to, r.tz],
  );
}

export async function categoryUsage(r: Range) {
  return query<CategoryUsage>(
    `WITH b AS (SELECT ${BOUNDS})
     SELECT coalesce(c.name, 'Uncategorised') AS category, sum(t.total_value)::numeric(20,2)::text AS value, count(*)::int AS takes
       FROM stock_transactions t CROSS JOIN b JOIN items i ON i.id = t.item_id LEFT JOIN categories c ON c.id = i.category_id
      WHERE t.txn_type = 'stock_out' AND t.occurred_at >= b.s AND t.occurred_at < b.e
        AND NOT EXISTS (SELECT 1 FROM stock_transactions rv WHERE rv.reverses_id = t.id)
      GROUP BY coalesce(c.name, 'Uncategorised') ORDER BY sum(t.total_value) DESC`,
    [r.from, r.to, r.tz],
  );
}

export type PieSlice = { label: string; value: number; detail: string; href?: string };

/** Top N items by value plus an "Other items" slice. */
export function toSlices(items: ItemUsage[], symbol: string, n = 6): PieSlice[] {
  const fmt = (v: number) => `${symbol}${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  const top: PieSlice[] = items.slice(0, n).map((i) => ({
    label: i.name,
    value: Number(i.value),
    detail: `${Number(i.qty).toLocaleString("en-US", { maximumFractionDigits: 3 })} ${i.unit} · ${fmt(Number(i.value))}`,
    href: `/items/${i.item_id}`,
  }));
  const rest = items.slice(n);
  if (rest.length) {
    const v = rest.reduce((a, i) => a + Number(i.value), 0);
    top.push({ label: `Other items (${rest.length})`, value: v, detail: fmt(v), href: undefined });
  }
  return top;
}

export type WorkerItem = { worker: string; item: string; unit: string; qty: string; value: string; takes: number };

/** Who took what: one row per worker and item. */
export async function workerItems(r: Range, filter: { workerId?: number | null; itemId?: string | null; categoryId?: number | null } = {}) {
  return query<WorkerItem>(
    `WITH b AS (SELECT ${BOUNDS})
     SELECT coalesce(w.name, 'Not recorded') AS worker, i.name AS item, u.symbol AS unit,
            trim_scale(sum(t.quantity))::text AS qty, sum(t.total_value)::numeric(20,2)::text AS value, count(*)::int AS takes
       FROM stock_transactions t CROSS JOIN b
       JOIN items i ON i.id = t.item_id JOIN units u ON u.id = i.unit_id
       LEFT JOIN workers w ON w.id = t.worker_id
      WHERE t.txn_type = 'stock_out' AND t.occurred_at >= b.s AND t.occurred_at < b.e
        AND NOT EXISTS (SELECT 1 FROM stock_transactions rv WHERE rv.reverses_id = t.id)
        AND ($4::int IS NULL OR t.worker_id = $4::int)
        AND ($5::uuid IS NULL OR t.item_id = $5::uuid)
        AND ($6::int IS NULL OR i.category_id = $6::int)
      GROUP BY coalesce(w.name, 'Not recorded'), i.name, u.symbol
      ORDER BY lower(coalesce(w.name, 'Not recorded')), sum(t.total_value) DESC`,
    [r.from, r.to, r.tz, filter.workerId ?? null, filter.itemId ?? null, filter.categoryId ?? null],
  );
}

export type AuditEntry = {
  id: string; action: string; entity_type: string; entity_id: string | null; details: Record<string, unknown>;
  created_at: string; user_name: string | null; entity_label: string | null;
};

export async function auditEntries(r: Range, f: { userId?: string | null; area?: string | null; limit: number; offset: number }) {
  const where = `a.created_at >= ($1::date)::timestamp AT TIME ZONE $3 AND a.created_at < (($2::date) + 1)::timestamp AT TIME ZONE $3
    AND ($4::uuid IS NULL OR a.user_id = $4::uuid) AND ($5::text IS NULL OR a.entity_type = $5::text)`;
  const args = [r.from, r.to, r.tz, f.userId ?? null, f.area ?? null];
  const rows = await query<AuditEntry>(
    `SELECT a.id::text, a.action, a.entity_type, a.entity_id, a.details, a.created_at, u.name AS user_name,
            CASE WHEN a.entity_type = 'item' THEN coalesce((SELECT name || ' (' || sku || ')' FROM items WHERE id::text = a.entity_id), (a.details->>'name') || ' (deleted)')
                 WHEN a.entity_type = 'stock_transaction' THEN (SELECT st.txn_no || ' · ' || i.name FROM stock_transactions st JOIN items i ON i.id = st.item_id WHERE st.id::text = a.entity_id)
                 WHEN a.entity_type = 'user' THEN (SELECT name FROM users WHERE id::text = a.entity_id)
                 WHEN a.entity_type = 'worker' THEN (SELECT name FROM workers WHERE id::text = a.entity_id)
                 WHEN a.entity_type = 'category' THEN (SELECT name FROM categories WHERE id::text = a.entity_id)
                 WHEN a.entity_type = 'supplier' THEN (SELECT name FROM suppliers WHERE id::text = a.entity_id)
                 WHEN a.entity_type = 'stock_count' THEN (SELECT sc.count_no || ' · ' || i.name FROM stock_counts sc JOIN items i ON i.id = sc.item_id WHERE sc.id::text = a.entity_id) END AS entity_label
       FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
      WHERE ${where}
      ORDER BY a.created_at DESC, a.id DESC LIMIT $6 OFFSET $7`,
    [...args, f.limit, f.offset],
  );
  const total = await queryOne<{ n: number }>(`SELECT count(*)::int AS n FROM audit_logs a WHERE ${where}`, args);
  return { rows, total: total?.n ?? 0 };
}

export type Grouping = "day" | "week" | "month";
export type PeriodMoney = { period: string; in_value: string; out_value: string; in_count: number; out_count: number };
type MoneyFilter = { itemId?: string | null; categoryId?: number | null; workerId?: number | null };

/**
 * Amount stocked in and stocked out per day, week (Monday start) or month. Reversed transactions are
 * left out on both sides, so a mistake and its correction cancel.
 */
export async function moneyByPeriod(r: Range, group: Grouping, f: MoneyFilter = {}) {
  const step = { day: "1 day", week: "1 week", month: "1 month" }[group];
  return query<PeriodMoney>(
    `WITH p AS (
       SELECT generate_series(date_trunc('${group}', $1::date::timestamp), date_trunc('${group}', $2::date::timestamp), interval '${step}')::date AS start
     ),
     t AS (
       SELECT date_trunc('${group}', (t.occurred_at AT TIME ZONE $3))::date AS start, t.txn_type, t.total_value
         FROM stock_transactions t JOIN items i ON i.id = t.item_id
        WHERE t.txn_type IN ('stock_in','stock_out')
          AND t.occurred_at >= ($1::date)::timestamp AT TIME ZONE $3 AND t.occurred_at < (($2::date) + 1)::timestamp AT TIME ZONE $3
          AND NOT EXISTS (SELECT 1 FROM stock_transactions rv WHERE rv.reverses_id = t.id)
          AND ($4::uuid IS NULL OR t.item_id = $4::uuid)
          AND ($5::int IS NULL OR i.category_id = $5::int)
          AND ($6::int IS NULL OR t.txn_type = 'stock_in' OR t.worker_id = $6::int)
     )
     SELECT to_char(p.start, 'YYYY-MM-DD') AS period,
            coalesce(sum(t.total_value) FILTER (WHERE t.txn_type='stock_in'), 0)::numeric(20,2)::text AS in_value,
            coalesce(sum(t.total_value) FILTER (WHERE t.txn_type='stock_out'), 0)::numeric(20,2)::text AS out_value,
            count(t.*) FILTER (WHERE t.txn_type='stock_in')::int AS in_count,
            count(t.*) FILTER (WHERE t.txn_type='stock_out')::int AS out_count
       FROM p LEFT JOIN t ON t.start = p.start
      GROUP BY p.start ORDER BY p.start`,
    [r.from, r.to, r.tz, f.itemId ?? null, f.categoryId ?? null, f.workerId ?? null],
  );
}

export type SpendBy = "item" | "category" | "supplier";
export type SpendRow = { key: string; label: string; value: string; count: number; qty: string | null; unit: string | null; href: string | null };

/** Where the money went: stock bought (stock in, excluding opening stock and reversed entries). */
export async function spendAnalysis(r: Range, by: SpendBy, f: MoneyFilter = {}) {
  const group = {
    item: { key: "i.id::text", label: "i.name", extra: "trim_scale(sum(t.quantity))::text AS qty, min(u.symbol) AS unit, '/items/' || i.id::text AS href", by: "i.id, i.name" },
    category: { key: "coalesce(c.id::text, '0')", label: "coalesce(c.name, 'Uncategorised')", extra: "NULL::text AS qty, NULL::text AS unit, NULL::text AS href", by: "c.id, c.name" },
    supplier: { key: "coalesce(t.supplier_id::text, coalesce(t.supplier_name, ''))", label: "coalesce(s.name, t.supplier_name, 'No supplier recorded')", extra: "NULL::text AS qty, NULL::text AS unit, NULL::text AS href", by: "t.supplier_id, s.name, t.supplier_name" },
  }[by];
  const where = `t.txn_type = 'stock_in' AND NOT t.is_opening
          AND t.occurred_at >= ($1::date)::timestamp AT TIME ZONE $3 AND t.occurred_at < (($2::date) + 1)::timestamp AT TIME ZONE $3
          AND NOT EXISTS (SELECT 1 FROM stock_transactions rv WHERE rv.reverses_id = t.id)
          AND ($4::uuid IS NULL OR t.item_id = $4::uuid)
          AND ($5::int IS NULL OR i.category_id = $5::int)`;
  const args = [r.from, r.to, r.tz, f.itemId ?? null, f.categoryId ?? null];
  const [rows, totals] = await Promise.all([
    query<SpendRow>(
      `SELECT ${group.key} AS key, ${group.label} AS label, sum(t.total_value)::numeric(20,2)::text AS value, count(*)::int AS count, ${group.extra}
         FROM stock_transactions t JOIN items i ON i.id = t.item_id JOIN units u ON u.id = i.unit_id
         LEFT JOIN categories c ON c.id = i.category_id LEFT JOIN suppliers s ON s.id = t.supplier_id
        WHERE ${where}
        GROUP BY ${group.by} ORDER BY sum(t.total_value) DESC, 2`,
      args,
    ),
    queryOne<{ spent: string; receipts: number; opening: string }>(
      `SELECT coalesce(sum(t.total_value) FILTER (WHERE NOT t.is_opening), 0)::numeric(20,2)::text AS spent,
              count(*) FILTER (WHERE NOT t.is_opening)::int AS receipts,
              coalesce(sum(t.total_value) FILTER (WHERE t.is_opening), 0)::numeric(20,2)::text AS opening
         FROM stock_transactions t JOIN items i ON i.id = t.item_id
        WHERE t.txn_type = 'stock_in'
          AND t.occurred_at >= ($1::date)::timestamp AT TIME ZONE $3 AND t.occurred_at < (($2::date) + 1)::timestamp AT TIME ZONE $3
          AND NOT EXISTS (SELECT 1 FROM stock_transactions rv WHERE rv.reverses_id = t.id)
          AND ($4::uuid IS NULL OR t.item_id = $4::uuid)
          AND ($5::int IS NULL OR i.category_id = $5::int)`,
      args,
    ),
  ]);
  return { rows, spent: totals!.spent, receipts: totals!.receipts, opening: totals!.opening };
}

/** Top N rows by value plus an "Other" slice — for any money breakdown. */
export function moneySlices(rows: { label: string; value: string; detail?: string; href?: string | null }[], symbol: string, n = 6): PieSlice[] {
  const fmt = (v: number) => `${symbol}${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  const top: PieSlice[] = rows.slice(0, n).map((x) => ({ label: x.label, value: Number(x.value), detail: x.detail ?? fmt(Number(x.value)), href: x.href ?? undefined }));
  const rest = rows.slice(n);
  if (rest.length) {
    const v = rest.reduce((a, x) => a + Number(x.value), 0);
    top.push({ label: `Other items (${rest.length})`, value: v, detail: fmt(v) });
  }
  return top;
}
