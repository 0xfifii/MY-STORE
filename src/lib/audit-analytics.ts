import "server-only";
import { query, queryOne } from "./db";
import { addDays } from "./format";

/**
 * Audit & analytics built from the stock ledger.
 *
 * Conventions (shown on the dashboard):
 *  - Inventory and stock-out values use the perpetual WEIGHTED-AVERAGE cost recorded on each movement.
 *  - Purchase prices are compared per BASE unit of the item (e.g. per kg), so different pack sizes compare fairly.
 *  - "Purchases" are stock-in entries from a supplier: opening stock, stock-count excesses and reversed
 *    (cancelled) entries are left out. Stock outs exclude stock-count shortages and reversed entries.
 *  - Quantities are only added up within the same unit; money is the common measure across items.
 */

export type Range = { from: string; to: string; tz: string };

const B = `($1::date)::timestamp AT TIME ZONE $3`;
const E = `(($2::date) + 1)::timestamp AT TIME ZONE $3`;
const NOT_REVERSED = `NOT EXISTS (SELECT 1 FROM stock_transactions rv WHERE rv.reverses_id = t.id)`;
const PURCHASE = `t.txn_type = 'stock_in' AND NOT t.is_opening AND coalesce(t.source,'') <> 'count' AND ${NOT_REVERSED}`;
const ISSUE = `t.txn_type = 'stock_out' AND coalesce(t.source,'') <> 'count' AND ${NOT_REVERSED}`;

export function monthRange(month: string, tz: string): Range {
  const [y, m] = month.split("-").map(Number);
  const from = `${month}-01`;
  const next = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  return { from, to: addDays(next, -1), tz };
}

export function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

// ---------------------------------------------------------------------------------------------
// Summary cards
// ---------------------------------------------------------------------------------------------
export type QtyByUnit = { unit: string; qty: string };

export async function auditSummary(r: Range) {
  const args = [r.from, r.to, r.tz];
  const [inv, ins, outs, inUnits, outUnits, counts, prices] = await Promise.all([
    queryOne<{ value: string; items: number; low: number; out: number }>(
      `SELECT coalesce(sum(stock_value),0)::numeric(20,2)::text AS value,
              count(*) FILTER (WHERE archived_at IS NULL)::int AS items,
              count(*) FILTER (WHERE archived_at IS NULL AND quantity > 0 AND quantity <= min_stock_level)::int AS low,
              count(*) FILTER (WHERE archived_at IS NULL AND quantity <= 0)::int AS out
         FROM items`,
    ),
    queryOne<{ spend: string; receipts: number; items: number }>(
      `SELECT coalesce(sum(t.total_value),0)::numeric(20,2)::text AS spend, count(*)::int AS receipts, count(DISTINCT t.item_id)::int AS items
         FROM stock_transactions t WHERE ${PURCHASE} AND t.occurred_at >= ${B} AND t.occurred_at < ${E}`,
      args,
    ),
    queryOne<{ value: string; issues: number; items: number }>(
      `SELECT coalesce(sum(t.total_value),0)::numeric(20,2)::text AS value, count(*)::int AS issues, count(DISTINCT t.item_id)::int AS items
         FROM stock_transactions t WHERE ${ISSUE} AND t.occurred_at >= ${B} AND t.occurred_at < ${E}`,
      args,
    ),
    query<QtyByUnit>(
      `SELECT u.symbol AS unit, trim_scale(sum(t.quantity))::text AS qty
         FROM stock_transactions t JOIN units u ON u.id = t.unit_id
        WHERE ${PURCHASE} AND t.occurred_at >= ${B} AND t.occurred_at < ${E} GROUP BY u.symbol ORDER BY sum(t.quantity) DESC`,
      args,
    ),
    query<QtyByUnit>(
      `SELECT u.symbol AS unit, trim_scale(sum(t.quantity))::text AS qty
         FROM stock_transactions t JOIN units u ON u.id = t.unit_id
        WHERE ${ISSUE} AND t.occurred_at >= ${B} AND t.occurred_at < ${E} GROUP BY u.symbol ORDER BY sum(t.quantity) DESC`,
      args,
    ),
    queryOne<{ shortage: string; excess: string; shortages: number; excesses: number; pending: number }>(
      `SELECT coalesce(-sum(value_difference) FILTER (WHERE status='approved' AND difference < 0),0)::numeric(20,2)::text AS shortage,
              coalesce(sum(value_difference) FILTER (WHERE status='approved' AND difference > 0),0)::numeric(20,2)::text AS excess,
              count(*) FILTER (WHERE status='approved' AND difference < 0)::int AS shortages,
              count(*) FILTER (WHERE status='approved' AND difference > 0)::int AS excesses,
              count(*) FILTER (WHERE status='pending')::int AS pending
         FROM stock_counts WHERE counted_at >= ${B} AND counted_at < ${E}`,
      args,
    ),
    priceTracking(r),
  ]);
  return {
    inventory: inv!,
    stockIn: { ...ins!, byUnit: inUnits },
    stockOut: { ...outs!, byUnit: outUnits },
    counts: counts!,
    priceUp: prices.filter((p) => p.change !== null && p.change > 0).length,
    priceDown: prices.filter((p) => p.change !== null && p.change < 0).length,
  };
}

// ---------------------------------------------------------------------------------------------
// Distribution pie: stock value / quantity (now) or stock in / stock out (period)
// ---------------------------------------------------------------------------------------------
export type DistMode = "value" | "quantity" | "in" | "out";
export type DistBy = "item" | "category";
export type DistRow = { key: string; label: string; value: string; qty: string | null; unit: string | null; count: number; category_id: number | null };

export async function distribution(mode: DistMode, by: DistBy, r: Range, unit?: string | null) {
  const keyCol = by === "item" ? "i.id::text" : "coalesce(c.id::text, '0')";
  const labelCol = by === "item" ? "i.name" : "coalesce(c.name, 'Uncategorised')";
  const groupCols = by === "item" ? "i.id, i.name, c.id" : "c.id, c.name";
  const catCol = by === "item" ? "c.id" : "c.id";
  if (mode === "value" || mode === "quantity") {
    const measure = mode === "value" ? "sum(i.stock_value)::numeric(20,2)::text" : "trim_scale(sum(i.quantity))::text";
    return query<DistRow>(
      `SELECT ${keyCol} AS key, ${labelCol} AS label, ${measure} AS value,
              trim_scale(sum(i.quantity))::text AS qty, ${by === "item" ? "min(u.symbol)" : "CASE WHEN count(DISTINCT u.symbol) = 1 THEN min(u.symbol) END"} AS unit,
              count(*)::int AS count, ${catCol} AS category_id
         FROM items i JOIN units u ON u.id = i.unit_id LEFT JOIN categories c ON c.id = i.category_id
        WHERE i.archived_at IS NULL AND ${mode === "value" ? "i.stock_value > 0" : "i.quantity > 0 AND u.symbol = $1"}
        GROUP BY ${groupCols} ORDER BY ${mode === "value" ? "sum(i.stock_value)" : "sum(i.quantity)"} DESC, 2`,
      mode === "value" ? [] : [unit ?? ""],
    );
  }
  const cond = mode === "in" ? `t.txn_type = 'stock_in' AND coalesce(t.source,'') <> 'count' AND ${NOT_REVERSED}` : ISSUE;
  return query<DistRow>(
    `SELECT ${keyCol} AS key, ${labelCol} AS label, sum(t.total_value)::numeric(20,2)::text AS value,
            ${by === "item" ? "trim_scale(sum(t.quantity))::text" : "CASE WHEN count(DISTINCT u.symbol) = 1 THEN trim_scale(sum(t.quantity))::text END"} AS qty,
            ${by === "item" ? "min(u.symbol)" : "CASE WHEN count(DISTINCT u.symbol) = 1 THEN min(u.symbol) END"} AS unit,
            count(*)::int AS count, ${catCol} AS category_id
       FROM stock_transactions t JOIN items i ON i.id = t.item_id JOIN units u ON u.id = t.unit_id LEFT JOIN categories c ON c.id = i.category_id
      WHERE ${cond} AND t.occurred_at >= ${B} AND t.occurred_at < ${E}
      GROUP BY ${groupCols} ORDER BY sum(t.total_value) DESC, 2`,
    [r.from, r.to, r.tz],
  );
}

/** Units that have stock right now (the quantity pie can only compare items measured in the same unit). */
export async function unitsInStock() {
  return query<{ unit: string; items: number }>(
    `SELECT u.symbol AS unit, count(*)::int AS items FROM items i JOIN units u ON u.id = i.unit_id
      WHERE i.archived_at IS NULL AND i.quantity > 0 GROUP BY u.symbol ORDER BY count(*) DESC, u.symbol`,
  );
}

// ---------------------------------------------------------------------------------------------
// Purchases (stock-in analysis)
// ---------------------------------------------------------------------------------------------
export type PurchaseRow = {
  item_id: string; name: string; sku: string; unit: string; category: string | null;
  qty: string; spend: string; purchases: number; restock_days: number; avg_price: string; last_day: string;
};

export async function purchaseRanking(r: Range) {
  return query<PurchaseRow>(
    `SELECT i.id AS item_id, i.name, i.sku, u.symbol AS unit, c.name AS category,
            trim_scale(sum(t.quantity))::text AS qty, sum(t.total_value)::numeric(20,2)::text AS spend,
            count(*)::int AS purchases,
            count(DISTINCT (t.occurred_at AT TIME ZONE $3)::date)::int AS restock_days,
            round(sum(t.total_value) / nullif(sum(t.quantity), 0), 4)::text AS avg_price,
            to_char(max((t.occurred_at AT TIME ZONE $3)::date), 'YYYY-MM-DD') AS last_day
       FROM stock_transactions t JOIN items i ON i.id = t.item_id JOIN units u ON u.id = i.unit_id LEFT JOIN categories c ON c.id = i.category_id
      WHERE ${PURCHASE} AND t.occurred_at >= ${B} AND t.occurred_at < ${E}
      GROUP BY i.id, i.name, i.sku, u.symbol, c.name
      ORDER BY sum(t.total_value) DESC`,
    [r.from, r.to, r.tz],
  );
}

// ---------------------------------------------------------------------------------------------
// Stock-out analysis
// ---------------------------------------------------------------------------------------------
export type IssueRow = {
  item_id: string; name: string; sku: string; unit: string; category: string | null;
  out_qty: string; out_value: string; issues: number; in_qty: string; available: string; turnover: string | null;
  reasons: { reason: string; qty: string; count: number }[];
};

export async function stockOutAnalysis(r: Range) {
  const rows = await query<Omit<IssueRow, "reasons" | "turnover">>(
    `WITH b AS (SELECT ${B} AS s, ${E} AS e),
     agg AS (
       SELECT t.item_id,
              coalesce(sum(t.direction * t.quantity) FILTER (WHERE t.occurred_at < b.s), 0) AS opening,
              coalesce(sum(t.quantity) FILTER (WHERE t.txn_type = 'stock_in' AND t.occurred_at >= b.s AND t.occurred_at < b.e), 0) AS in_qty,
              coalesce(sum(t.quantity) FILTER (WHERE ${ISSUE} AND t.occurred_at >= b.s AND t.occurred_at < b.e), 0) AS out_qty,
              coalesce(sum(t.total_value) FILTER (WHERE ${ISSUE} AND t.occurred_at >= b.s AND t.occurred_at < b.e), 0) AS out_value,
              count(*) FILTER (WHERE ${ISSUE} AND t.occurred_at >= b.s AND t.occurred_at < b.e) AS issues
         FROM stock_transactions t CROSS JOIN b WHERE t.occurred_at < b.e GROUP BY t.item_id
     )
     SELECT i.id AS item_id, i.name, i.sku, u.symbol AS unit, c.name AS category,
            trim_scale(a.out_qty)::text AS out_qty, a.out_value::numeric(20,2)::text AS out_value, a.issues::int AS issues,
            trim_scale(a.in_qty)::text AS in_qty, trim_scale(a.opening + a.in_qty)::text AS available
       FROM agg a JOIN items i ON i.id = a.item_id JOIN units u ON u.id = i.unit_id LEFT JOIN categories c ON c.id = i.category_id
      WHERE a.issues > 0
      ORDER BY a.issues DESC, a.out_value DESC`,
    [r.from, r.to, r.tz],
  );
  const reasons = await query<{ item_id: string; reason: string; qty: string; count: number }>(
    `SELECT t.item_id, t.reason, trim_scale(sum(t.quantity))::text AS qty, count(*)::int AS count
       FROM stock_transactions t WHERE ${ISSUE} AND t.occurred_at >= ${B} AND t.occurred_at < ${E}
      GROUP BY t.item_id, t.reason ORDER BY count(*) DESC`,
    [r.from, r.to, r.tz],
  );
  return rows.map((x) => ({
    ...x,
    // Share of the stock available in the period (opening + received) that went out.
    turnover: Number(x.available) > 0 ? ((Number(x.out_qty) / Number(x.available)) * 100).toFixed(1) : null,
    reasons: reasons.filter((y) => y.item_id === x.item_id).map(({ reason, qty, count }) => ({ reason, qty, count })),
  })) as IssueRow[];
}

export async function reasonTotals(r: Range) {
  return query<{ reason: string; count: number; value: string }>(
    `SELECT t.reason, count(*)::int AS count, sum(t.total_value)::numeric(20,2)::text AS value
       FROM stock_transactions t WHERE ${ISSUE} AND t.occurred_at >= ${B} AND t.occurred_at < ${E}
      GROUP BY t.reason ORDER BY sum(t.total_value) DESC`,
    [r.from, r.to, r.tz],
  );
}

// ---------------------------------------------------------------------------------------------
// Purchase price tracking
// ---------------------------------------------------------------------------------------------
export type PricePoint = { id: string; at: string; day: string; price: number; qty: number; spend: number; supplier: string | null; entered: string };
export type PriceRow = {
  item_id: string; name: string; sku: string; unit: string; category: string | null;
  points: PricePoint[];               // purchases within the period, oldest first
  previous: number | null;           // purchase price before the latest one (may be before the period)
  latest: number | null;             // latest purchase price within the period
  change: number | null;             // latest − previous (per base unit)
  changePct: number | null;
  high: number | null; low: number | null;
  avgWeighted: number | null;        // spend ÷ quantity
  avgSimple: number | null;          // plain average of the purchase prices
  qtyAtPrice: { price: number; qty: number; purchases: number }[];
  spend: number; qty: number; suppliers: string[];
  historyBefore: number;             // purchases recorded before the period
};

export async function priceTracking(r: Range, q?: string | null): Promise<PriceRow[]> {
  const rows = await query<{
    id: string; item_id: string; name: string; sku: string; unit: string; category: string | null; at: string;
    price: string; qty: string; spend: string; supplier: string | null; entered: string; in_period: boolean; day: string;
  }>(
    `SELECT t.id::text, i.id AS item_id, i.name, i.sku, u.symbol AS unit, c.name AS category, t.occurred_at AS at,
            to_char((t.occurred_at AT TIME ZONE $3)::date, 'YYYY-MM-DD') AS day,
            t.unit_cost::text AS price, t.quantity::text AS qty, t.total_value::text AS spend,
            coalesce(sp.name, t.supplier_name) AS supplier,
            trim_scale(t.entered_quantity)::text || ' ' || eu.symbol || ' @ ' || trim_scale(round(t.entered_unit_cost, 4))::text AS entered,
            (t.occurred_at >= ${B}) AS in_period
       FROM stock_transactions t JOIN items i ON i.id = t.item_id JOIN units u ON u.id = i.unit_id JOIN units eu ON eu.id = t.entered_unit_id
       LEFT JOIN categories c ON c.id = i.category_id LEFT JOIN suppliers sp ON sp.id = t.supplier_id
      WHERE ${PURCHASE} AND t.occurred_at < ${E}
        AND ($4::text IS NULL OR lower(i.name) LIKE $4 OR lower(i.sku) LIKE $4 OR lower(coalesce(c.name,'')) LIKE $4)
      ORDER BY i.name, t.occurred_at, t.id`,
    [r.from, r.to, r.tz, q && q.trim() ? `%${q.trim().toLowerCase()}%` : null],
  );
  const byItem = new Map<string, typeof rows>();
  for (const x of rows) byItem.set(x.item_id, [...(byItem.get(x.item_id) ?? []), x]);
  const out: PriceRow[] = [];
  for (const [, list] of byItem) {
    const inP = list.filter((x) => x.in_period);
    if (!inP.length) continue;
    const f = list[0];
    const points: PricePoint[] = inP.map((x) => ({ id: x.id, at: new Date(x.at).toISOString(), day: x.day, price: Number(x.price), qty: Number(x.qty), spend: Number(x.spend), supplier: x.supplier, entered: x.entered }));
    const lastIdx = list.lastIndexOf(inP[inP.length - 1]);
    const latest = Number(list[lastIdx].price);
    const previous = lastIdx > 0 ? Number(list[lastIdx - 1].price) : null;
    const change = previous !== null ? round4(latest - previous) : null;
    const prices = points.map((p) => p.price);
    const qty = points.reduce((a, p) => a + p.qty, 0);
    const spend = points.reduce((a, p) => a + p.spend, 0);
    const atPrice = new Map<number, { price: number; qty: number; purchases: number }>();
    for (const p of points) {
      const k = round4(p.price);
      const e = atPrice.get(k) ?? { price: k, qty: 0, purchases: 0 };
      e.qty += p.qty; e.purchases += 1;
      atPrice.set(k, e);
    }
    out.push({
      item_id: f.item_id, name: f.name, sku: f.sku, unit: f.unit, category: f.category,
      points, previous, latest, change,
      changePct: previous ? round4(((latest - previous) / previous) * 100) : null,
      high: Math.max(...prices), low: Math.min(...prices),
      avgWeighted: qty > 0 ? round4(spend / qty) : null,
      avgSimple: round4(prices.reduce((a, b) => a + b, 0) / prices.length),
      qtyAtPrice: [...atPrice.values()].sort((a, b) => a.price - b.price),
      spend: round2(spend), qty, suppliers: [...new Set(points.map((p) => p.supplier).filter(Boolean) as string[])],
      historyBefore: list.length - inP.length,
    });
  }
  return out.sort((a, b) => Math.abs(b.changePct ?? 0) - Math.abs(a.changePct ?? 0) || b.spend - a.spend);
}

const round4 = (n: number) => Math.round(n * 10000) / 10000;
const round2 = (n: number) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------------------------
// One item, one month
// ---------------------------------------------------------------------------------------------
export type ItemMonthFigures = {
  opening: string; in_qty: string; out_qty: string; corrections: string; count_adj: string; closing: string;
  purchases: number; purchase_spend: string; out_value: string; issues: number;
  damage_qty: string; expiry_qty: string; wastage_qty: string;
};

async function itemFigures(itemId: string, r: Range) {
  return (await queryOne<ItemMonthFigures>(
    `WITH b AS (SELECT ${B} AS s, ${E} AS e)
     SELECT trim_scale(coalesce(sum(t.direction * t.quantity) FILTER (WHERE t.occurred_at < b.s), 0))::text AS opening,
            trim_scale(coalesce(sum(t.quantity) FILTER (WHERE t.txn_type='stock_in' AND coalesce(t.source,'') <> 'count' AND t.occurred_at >= b.s), 0))::text AS in_qty,
            trim_scale(coalesce(sum(t.quantity) FILTER (WHERE t.txn_type='stock_out' AND coalesce(t.source,'') <> 'count' AND t.occurred_at >= b.s), 0))::text AS out_qty,
            trim_scale(coalesce(sum(t.direction * t.quantity) FILTER (WHERE t.txn_type='reversal' AND t.occurred_at >= b.s), 0))::text AS corrections,
            trim_scale(coalesce(sum(t.direction * t.quantity) FILTER (WHERE t.source = 'count' AND t.occurred_at >= b.s), 0))::text AS count_adj,
            trim_scale(coalesce(sum(t.direction * t.quantity), 0))::text AS closing,
            (count(*) FILTER (WHERE ${PURCHASE} AND t.occurred_at >= b.s))::int AS purchases,
            coalesce(sum(t.total_value) FILTER (WHERE ${PURCHASE} AND t.occurred_at >= b.s), 0)::numeric(20,2)::text AS purchase_spend,
            coalesce(sum(t.total_value) FILTER (WHERE ${ISSUE} AND t.occurred_at >= b.s), 0)::numeric(20,2)::text AS out_value,
            (count(*) FILTER (WHERE ${ISSUE} AND t.occurred_at >= b.s))::int AS issues,
            trim_scale(coalesce(sum(t.quantity) FILTER (WHERE ${ISSUE} AND t.reason = 'damage' AND t.occurred_at >= b.s), 0))::text AS damage_qty,
            trim_scale(coalesce(sum(t.quantity) FILTER (WHERE ${ISSUE} AND t.reason = 'expiry' AND t.occurred_at >= b.s), 0))::text AS expiry_qty,
            trim_scale(coalesce(sum(t.quantity) FILTER (WHERE ${ISSUE} AND t.reason = 'wastage' AND t.occurred_at >= b.s), 0))::text AS wastage_qty
       FROM stock_transactions t CROSS JOIN b WHERE t.item_id = $4 AND t.occurred_at < b.e`,
    [r.from, r.to, r.tz, itemId],
  ))!;
}

export type TrendPoint = { month: string; closing: number; avg_price: number | null; spend: number; out_value: number; in_qty: number; out_qty: number };

export async function itemMonth(itemId: string, month: string, tz: string) {
  const r = monthRange(month, tz);
  const prev = monthRange(shiftMonth(month, -1), tz);
  const item = await queryOne<{ id: string; name: string; sku: string; unit: string; category: string | null; quantity: string; avg_cost: string; stock_value: string; min_stock_level: string; archived_at: string | null }>(
    `SELECT i.id, i.name, i.sku, u.symbol AS unit, c.name AS category, trim_scale(i.quantity)::text AS quantity, coalesce(round(i.stock_value / nullif(i.quantity, 0), 6), 0)::text AS avg_cost,
            i.stock_value::text, trim_scale(i.min_stock_level)::text AS min_stock_level, i.archived_at
       FROM items i JOIN units u ON u.id = i.unit_id LEFT JOIN categories c ON c.id = i.category_id WHERE i.id = $1`,
    [itemId],
  );
  if (!item) return null;
  const firstMonth = shiftMonth(month, -11);
  const [cur, before, prices, movements, counts, trendRows] = await Promise.all([
    itemFigures(itemId, r),
    itemFigures(itemId, prev),
    priceTracking(r).then((rows) => rows.find((x) => x.item_id === itemId) ?? null),
    query<{ id: string; txn_no: string; at: string; txn_type: string; direction: number; source: string | null; is_opening: boolean; qty: string; entered: string; unit_cost: string; value: string; reason: string | null; who: string | null; supplier: string | null; notes: string | null; reversed: boolean; balance_after: string }>(
      `SELECT t.id::text, t.txn_no, t.occurred_at AS at, t.txn_type, t.direction, t.source, t.is_opening, trim_scale(t.quantity)::text AS qty,
              trim_scale(t.entered_quantity)::text || ' ' || eu.symbol AS entered, t.unit_cost::text, t.total_value::numeric(20,2)::text AS value,
              t.reason, w.name AS who, coalesce(sp.name, t.supplier_name) AS supplier, coalesce(t.notes, t.correction_reason) AS notes,
              EXISTS (SELECT 1 FROM stock_transactions rv WHERE rv.reverses_id = t.id) AS reversed, trim_scale(t.balance_after)::text AS balance_after
         FROM stock_transactions t JOIN units eu ON eu.id = t.entered_unit_id
         LEFT JOIN workers w ON w.id = t.worker_id LEFT JOIN suppliers sp ON sp.id = t.supplier_id
        WHERE t.item_id = $4 AND t.occurred_at >= ${B} AND t.occurred_at < ${E}
        ORDER BY t.occurred_at, t.id`,
      [r.from, r.to, r.tz, itemId],
    ),
    query<StockCountRow>(`${COUNT_SELECT} WHERE sc.item_id = $1 AND sc.counted_at >= ($2::date)::timestamp AT TIME ZONE $4 AND sc.counted_at < (($3::date) + 1)::timestamp AT TIME ZONE $4 ORDER BY sc.counted_at`,
      [itemId, r.from, r.to, tz]),
    query<{ month: string; closing: string; avg_price: string | null; spend: string; out_value: string; in_qty: string; out_qty: string }>(
      `WITH m AS (SELECT generate_series($2::date, $3::date, interval '1 month')::date AS start)
       SELECT to_char(m.start, 'YYYY-MM') AS month,
              (SELECT coalesce(sum(t.direction * t.quantity), 0) FROM stock_transactions t
                WHERE t.item_id = $1 AND t.occurred_at < ((m.start + interval '1 month')::date)::timestamp AT TIME ZONE $4)::text AS closing,
              (SELECT round(sum(t.total_value) / nullif(sum(t.quantity), 0), 4) FROM stock_transactions t
                WHERE t.item_id = $1 AND ${PURCHASE}
                  AND t.occurred_at >= m.start::timestamp AT TIME ZONE $4 AND t.occurred_at < ((m.start + interval '1 month')::date)::timestamp AT TIME ZONE $4)::text AS avg_price,
              (SELECT coalesce(sum(t.total_value), 0) FROM stock_transactions t
                WHERE t.item_id = $1 AND ${PURCHASE}
                  AND t.occurred_at >= m.start::timestamp AT TIME ZONE $4 AND t.occurred_at < ((m.start + interval '1 month')::date)::timestamp AT TIME ZONE $4)::text AS spend,
              (SELECT coalesce(sum(t.total_value), 0) FROM stock_transactions t
                WHERE t.item_id = $1 AND ${ISSUE}
                  AND t.occurred_at >= m.start::timestamp AT TIME ZONE $4 AND t.occurred_at < ((m.start + interval '1 month')::date)::timestamp AT TIME ZONE $4)::text AS out_value,
              (SELECT coalesce(sum(t.quantity), 0) FROM stock_transactions t
                WHERE t.item_id = $1 AND ${PURCHASE}
                  AND t.occurred_at >= m.start::timestamp AT TIME ZONE $4 AND t.occurred_at < ((m.start + interval '1 month')::date)::timestamp AT TIME ZONE $4)::text AS in_qty,
              (SELECT coalesce(sum(t.quantity), 0) FROM stock_transactions t
                WHERE t.item_id = $1 AND ${ISSUE}
                  AND t.occurred_at >= m.start::timestamp AT TIME ZONE $4 AND t.occurred_at < ((m.start + interval '1 month')::date)::timestamp AT TIME ZONE $4)::text AS out_qty
         FROM m ORDER BY m.start`,
      [itemId, `${firstMonth}-01`, `${month}-01`, tz],
    ),
  ]);
  // Daily balance through the month (for the line chart).
  const days: { day: string; balance: number }[] = [];
  let bal = Number(cur.opening);
  const byDay = new Map<string, number>();
  for (const mv of movements) {
    const d = new Date(mv.at).toLocaleDateString("en-CA", { timeZone: tz });
    byDay.set(d, (byDay.get(d) ?? 0) + mv.direction * Number(mv.qty));
  }
  const todayLocal = new Date().toLocaleDateString("en-CA", { timeZone: tz });
  for (let d = r.from; d <= r.to && d <= todayLocal; d = addDays(d, 1)) {
    bal += byDay.get(d) ?? 0;
    days.push({ day: d, balance: Math.round(bal * 1e6) / 1e6 });
  }
  return {
    item, range: r, current: cur, previous: before, prices, movements, counts, days,
    trend: trendRows.map((t) => ({
      month: t.month, closing: Number(t.closing), avg_price: t.avg_price === null ? null : Number(t.avg_price),
      spend: Number(t.spend), out_value: Number(t.out_value), in_qty: Number(t.in_qty), out_qty: Number(t.out_qty),
    })) as TrendPoint[],
  };
}

export async function searchItems(q: string) {
  if (!q.trim()) return [];
  return query<{ id: string; name: string; sku: string; category: string | null; unit: string; archived: boolean }>(
    `SELECT i.id, i.name, i.sku, c.name AS category, u.symbol AS unit, i.archived_at IS NOT NULL AS archived
       FROM items i JOIN units u ON u.id = i.unit_id LEFT JOIN categories c ON c.id = i.category_id
      WHERE lower(i.name) LIKE $1 OR lower(i.sku) LIKE $1 OR lower(coalesce(c.name,'')) LIKE $1
      ORDER BY i.archived_at IS NOT NULL, lower(i.name) LIMIT 30`,
    [`%${q.trim().toLowerCase()}%`],
  );
}

// ---------------------------------------------------------------------------------------------
// Stock counts
// ---------------------------------------------------------------------------------------------
export type StockCountRow = {
  id: string; count_no: string; item_id: string; item_name: string; sku: string; unit: string; counted_at: string;
  system_qty: string; counted_qty: string; difference: string; unit_cost: string; value_difference: string;
  notes: string | null; status: "pending" | "approved" | "rejected"; counted_by: string | null; decided_by: string | null;
  decided_at: string | null; decision_note: string | null; txn_no: string | null;
};

export const COUNT_SELECT = `
  SELECT sc.id::text, sc.count_no, sc.item_id, i.name AS item_name, i.sku, u.symbol AS unit, sc.counted_at,
         trim_scale(sc.system_qty)::text AS system_qty, trim_scale(sc.counted_qty)::text AS counted_qty,
         trim_scale(sc.difference)::text AS difference, sc.unit_cost::text, sc.value_difference::text, sc.notes, sc.status,
         cu.name AS counted_by, du.name AS decided_by, sc.decided_at, sc.decision_note, st.txn_no
    FROM stock_counts sc JOIN items i ON i.id = sc.item_id JOIN units u ON u.id = i.unit_id
    LEFT JOIN users cu ON cu.id = sc.counted_by LEFT JOIN users du ON du.id = sc.decided_by
    LEFT JOIN stock_transactions st ON st.id = sc.txn_id`;

export async function countsInRange(r: Range, status?: "pending" | "approved" | "rejected" | null) {
  return query<StockCountRow>(
    `${COUNT_SELECT} WHERE sc.counted_at >= ${B} AND sc.counted_at < ${E} AND ($4::text IS NULL OR sc.status = $4)
      ORDER BY sc.counted_at DESC`,
    [r.from, r.to, r.tz, status ?? null],
  );
}

// ---------------------------------------------------------------------------------------------
// Monthly trend (for the monthly audit report)
// ---------------------------------------------------------------------------------------------
export async function monthlyTrend(lastMonth: string, months: number, tz: string) {
  return query<{ month: string; spend: string; purchases: number; out_value: string; issues: number; items_bought: number; items_issued: number }>(
    `WITH m AS (SELECT generate_series($1::date, $2::date, interval '1 month')::date AS start)
     SELECT to_char(m.start, 'YYYY-MM') AS month,
            coalesce(sum(t.total_value) FILTER (WHERE ${PURCHASE}), 0)::numeric(20,2)::text AS spend,
            (count(t.id) FILTER (WHERE ${PURCHASE}))::int AS purchases,
            coalesce(sum(t.total_value) FILTER (WHERE ${ISSUE}), 0)::numeric(20,2)::text AS out_value,
            (count(t.id) FILTER (WHERE ${ISSUE}))::int AS issues,
            (count(DISTINCT t.item_id) FILTER (WHERE ${PURCHASE}))::int AS items_bought,
            (count(DISTINCT t.item_id) FILTER (WHERE ${ISSUE}))::int AS items_issued
       FROM m LEFT JOIN stock_transactions t
         ON t.occurred_at >= m.start::timestamp AT TIME ZONE $3 AND t.occurred_at < ((m.start + interval '1 month')::date)::timestamp AT TIME ZONE $3
      GROUP BY m.start ORDER BY m.start`,
    [`${shiftMonth(lastMonth, -(months - 1))}-01`, `${lastMonth}-01`, tz],
  );
}
