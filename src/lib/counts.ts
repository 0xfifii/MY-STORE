import "server-only";
import { randomUUID } from "node:crypto";
import { queryOne, withTransaction } from "./db";
import { audit } from "./audit";
import { AppError } from "./errors";
import { COUNT_SELECT, type StockCountRow } from "./audit-analytics";

/** Average cost per base unit right now; falls back to the last purchase price when the item is out of stock. */
const COST_SQL = `coalesce(round(i.stock_value / nullif(i.quantity, 0), 6),
  (SELECT t.unit_cost FROM stock_transactions t WHERE t.item_id = i.id AND t.txn_type = 'stock_in' ORDER BY t.occurred_at DESC, t.id DESC LIMIT 1), 0)`;

/** Records what was physically counted. Nothing changes in the stock balance until it is approved. */
export async function recordCount(itemId: string, countedQty: string, notes: string | null, userId: string) {
  return withTransaction(async (c) => {
    const { rows } = await c.query<{ quantity: string; cost: string; archived: boolean; allow_fraction: boolean }>(
      `SELECT i.quantity::text, ${COST_SQL}::text AS cost, i.archived_at IS NOT NULL AS archived, i.allow_fraction FROM items i WHERE i.id = $1 FOR UPDATE`,
      [itemId],
    );
    const it = rows[0];
    if (!it) throw new AppError("ITEM_NOT_FOUND", "Item not found.", 404);
    if (it.archived) throw new AppError("ITEM_ARCHIVED", "This item is archived. Restore it before counting.");
    if (!it.allow_fraction && !/^\d+(\.0+)?$/.test(countedQty)) throw new AppError("WHOLE_UNITS", "This item is counted in whole units.");
    const { rows: ins } = await c.query<{ id: string; count_no: string }>(
      `INSERT INTO stock_counts (item_id, system_qty, counted_qty, difference, unit_cost, value_difference, notes, counted_by)
       VALUES ($1, $2::numeric, $3::numeric, $3::numeric - $2::numeric, $4::numeric, round(($3::numeric - $2::numeric) * $4::numeric, 2), $5, $6)
       RETURNING id::text, count_no`,
      [itemId, it.quantity, countedQty, it.cost, notes, userId],
    );
    await audit(userId, "count.record", "stock_count", ins[0].id, { count_no: ins[0].count_no, item_id: itemId, system_qty: it.quantity, counted_qty: countedQty }, c);
    return ins[0];
  });
}

/**
 * Approves a pending count and posts the difference to the ledger: a shortage becomes a stock out
 * (reason "other", note "Stock count …"), an excess a stock in at the item's average cost. Both are
 * tagged source = 'count' so analyses can tell them apart from real purchases and issues.
 */
export async function decideCount(id: string, approve: boolean, note: string | null, userId: string) {
  if (!/^\d+$/.test(id)) throw new AppError("COUNT_NOT_FOUND", "Stock count not found.", 404);
  return withTransaction(async (c) => {
    const { rows } = await c.query<{ id: string; count_no: string; item_id: string; status: string; difference: string; unit_cost: string; unit_id: number; quantity: string }>(
      `SELECT sc.id::text, sc.count_no, sc.item_id, sc.status, sc.difference::text, sc.unit_cost::text, i.unit_id, i.quantity::text
         FROM stock_counts sc JOIN items i ON i.id = sc.item_id WHERE sc.id = $1 FOR UPDATE OF sc, i`,
      [id],
    );
    const sc = rows[0];
    if (!sc) throw new AppError("COUNT_NOT_FOUND", "Stock count not found.", 404);
    if (sc.status !== "pending") throw new AppError("COUNT_DECIDED", `${sc.count_no} has already been ${sc.status}.`, 409);
    let txnId: string | null = null;
    const diff = Number(sc.difference);
    if (approve && diff !== 0) {
      await c.query("SELECT set_config('mystore.source', 'count', true)");
      const abs = sc.difference.replace(/^-/, "");
      if (diff < 0) {
        if (Number(sc.quantity) < Number(abs)) {
          throw new AppError("COUNT_STALE", `The balance has changed since ${sc.count_no} was counted and is now lower than the shortage. Reject it and count again.`, 409);
        }
        const { rows: t } = await c.query<{ id: string }>(
          "SELECT id::text FROM stock_out($1,$2,$3,'other',NULL,$4,$5,$6,$7)",
          [sc.item_id, abs, sc.unit_id, sc.count_no, `Stock count ${sc.count_no}: shortage`, userId, randomUUID()],
        );
        txnId = t[0].id;
      } else {
        const { rows: t } = await c.query<{ id: string }>(
          "SELECT id::text FROM stock_in($1,$2,$3,$4,NULL,NULL,$5,$6,NULL,$7,$8)",
          [sc.item_id, abs, sc.unit_id, sc.unit_cost, sc.count_no, `Stock count ${sc.count_no}: excess`, userId, randomUUID()],
        );
        txnId = t[0].id;
      }
      await c.query("SELECT set_config('mystore.source', '', true)");
    }
    await c.query(
      "UPDATE stock_counts SET status = $2, decided_by = $3, decided_at = now(), decision_note = $4, txn_id = $5 WHERE id = $1",
      [id, approve ? "approved" : "rejected", userId, note, txnId],
    );
    await audit(userId, approve ? "count.approve" : "count.reject", "stock_count", id, { count_no: sc.count_no, difference: sc.difference, note }, c);
    return { count_no: sc.count_no, txn_id: txnId };
  });
}

export async function getCount(id: string) {
  return queryOne<StockCountRow>(`${COUNT_SELECT} WHERE sc.id = $1`, [id]);
}
