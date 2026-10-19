import "server-only";
import type { PoolClient } from "pg";
import type { z } from "zod";
import { db, query, queryOne, withTransaction } from "./db";
import { audit } from "./audit";
import { AppError } from "./errors";
import type { itemCreateSchema, itemUpdateSchema, stockInSchema, stockOutSchema } from "./validation";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type ItemRow = {
  id: string;
  sku: string;
  name: string;
  category_id: number | null;
  category_name: string | null;
  description: string | null;
  unit_id: number;
  unit_symbol: string;
  unit_name: string;
  allow_fraction: boolean;
  quantity: string;
  stock_value: string;
  avg_cost: string;
  min_stock_level: string;
  default_supplier_id: number | null;
  supplier_name: string | null;
  notes: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  status: "in_stock" | "low" | "out";
};

export type UnitOption = { unit_id: number; symbol: string; name: string; factor: string; is_base: boolean; allow_decimal: boolean };

export type TxnRow = {
  id: string;
  txn_no: string;
  item_id: string;
  item_name: string;
  item_sku: string;
  txn_type: "stock_in" | "stock_out" | "reversal";
  direction: number;
  is_opening: boolean;
  entered_quantity: string;
  entered_unit_symbol: string;
  entered_unit_cost: string;
  quantity: string;
  unit_symbol: string;
  unit_cost: string;
  total_value: string;
  balance_after: string;
  value_after: string;
  reason: string | null;
  supplier_label: string | null;
  recipient: string | null;
  reference: string | null;
  notes: string | null;
  reverses_id: string | null;
  reverses_txn_no: string | null;
  reversed_by_txn_no: string | null;
  correction_reason: string | null;
  occurred_at: string;
  created_at: string;
  user_name: string | null;
};

const ITEM_SELECT = `
  SELECT i.id, i.sku, i.name, i.category_id, c.name AS category_name, i.description,
         i.unit_id, u.symbol AS unit_symbol, u.name AS unit_name, i.allow_fraction,
         i.quantity::text, i.stock_value::text,
         CASE WHEN i.quantity > 0 THEN round(i.stock_value / i.quantity, 6) ELSE 0 END::text AS avg_cost,
         i.min_stock_level::text, i.default_supplier_id, s.name AS supplier_name, i.notes,
         i.archived_at, i.created_at, i.updated_at,
         CASE WHEN i.quantity <= 0 THEN 'out'
              WHEN i.quantity <= i.min_stock_level THEN 'low'
              ELSE 'in_stock' END AS status
    FROM items i
    JOIN units u ON u.id = i.unit_id
    LEFT JOIN categories c ON c.id = i.category_id
    LEFT JOIN suppliers s ON s.id = i.default_supplier_id`;

export const TXN_SELECT = `
  SELECT t.id::text, t.txn_no, t.item_id, i.name AS item_name, i.sku AS item_sku,
         t.txn_type, t.direction, t.is_opening,
         t.entered_quantity::text, eu.symbol AS entered_unit_symbol, t.entered_unit_cost::text,
         t.quantity::text, bu.symbol AS unit_symbol, t.unit_cost::text, t.total_value::text,
         t.balance_after::text, t.value_after::text,
         t.reason, coalesce(sp.name, t.supplier_name) AS supplier_label, t.recipient, t.reference, t.notes,
         t.reverses_id::text, ot.txn_no AS reverses_txn_no, rv.txn_no AS reversed_by_txn_no,
         t.correction_reason, t.occurred_at, t.created_at, us.name AS user_name
    FROM stock_transactions t
    JOIN items i ON i.id = t.item_id
    JOIN units eu ON eu.id = t.entered_unit_id
    JOIN units bu ON bu.id = t.unit_id
    LEFT JOIN suppliers sp ON sp.id = t.supplier_id
    LEFT JOIN users us ON us.id = t.created_by
    LEFT JOIN stock_transactions ot ON ot.id = t.reverses_id
    LEFT JOIN stock_transactions rv ON rv.reverses_id = t.id`;

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------
export type ItemListParams = {
  q?: string;
  category?: number | null;
  status?: "in_stock" | "low" | "out" | "attention" | null;
  sort?: "name" | "quantity" | "value" | "sku" | "updated";
  dir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
  includeArchived?: boolean;
};

export async function listItems(p: ItemListParams) {
  const where: string[] = [];
  const params: unknown[] = [];
  if (!p.includeArchived) where.push("i.archived_at IS NULL");
  if (p.q && p.q.trim()) {
    params.push(`%${p.q.trim().toLowerCase()}%`);
    where.push(`(lower(i.name) LIKE $${params.length} OR lower(i.sku) LIKE $${params.length})`);
  }
  if (p.category) {
    params.push(p.category);
    where.push(`i.category_id = $${params.length}`);
  }
  if (p.status === "out") where.push("i.quantity <= 0");
  if (p.status === "low") where.push("i.quantity > 0 AND i.quantity <= i.min_stock_level");
  if (p.status === "in_stock") where.push("i.quantity > i.min_stock_level AND i.quantity > 0");
  if (p.status === "attention") where.push("i.quantity <= i.min_stock_level");

  const sortCol = { name: "lower(i.name)", quantity: "i.quantity", value: "i.stock_value", sku: "lower(i.sku)", updated: "i.updated_at" }[
    p.sort ?? "name"
  ];
  const dir = p.dir === "desc" ? "DESC" : "ASC";
  const pageSize = Math.min(Math.max(p.pageSize ?? 20, 1), 100);
  const page = Math.max(p.page ?? 1, 1);
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  // Exact-code matches first when searching, so the right item is obvious.
  let order = `${sortCol} ${dir}, lower(i.name) ASC`;
  if (p.q && p.q.trim()) {
    params.push(p.q.trim().toLowerCase());
    order = `(lower(i.sku) = $${params.length}) DESC, ${order}`;
  }

  const countRow = await queryOne<{ n: number }>(
    `SELECT count(*)::int AS n FROM items i ${whereSql}`,
    params.slice(0, p.q && p.q.trim() ? params.length - 1 : params.length),
  );
  params.push(pageSize, (page - 1) * pageSize);
  const rows = await query<ItemRow>(
    `${ITEM_SELECT} ${whereSql} ORDER BY ${order} LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  const total = countRow?.n ?? 0;
  return { rows, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function getItem(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return queryOne<ItemRow>(`${ITEM_SELECT} WHERE i.id = $1`, [id]);
}

/** Units a quantity can be entered in for this item (base unit + defined conversions). */
export async function getItemUnits(itemId: string): Promise<UnitOption[]> {
  return query<UnitOption>(
    `WITH it AS (SELECT id, unit_id FROM items WHERE id = $1)
     SELECT u.id AS unit_id, u.symbol, u.name, '1' AS factor, true AS is_base, u.allow_decimal
       FROM it JOIN units u ON u.id = it.unit_id
     UNION ALL
     SELECT u.id, u.symbol, u.name, trim_scale(c.factor)::text, false, u.allow_decimal
       FROM it JOIN item_unit_conversions c ON c.item_id = it.id JOIN units u ON u.id = c.unit_id
     UNION ALL
     SELECT u.id, u.symbol, u.name, trim_scale(g.factor)::text, false, u.allow_decimal
       FROM it JOIN unit_conversions g ON g.to_unit_id = it.unit_id JOIN units u ON u.id = g.from_unit_id
      WHERE NOT EXISTS (SELECT 1 FROM item_unit_conversions c WHERE c.item_id = it.id AND c.unit_id = g.from_unit_id)
     UNION ALL
     SELECT u.id, u.symbol, u.name, trim_scale(round(1 / g.factor, 12))::text, false, u.allow_decimal
       FROM it JOIN unit_conversions g ON g.from_unit_id = it.unit_id JOIN units u ON u.id = g.to_unit_id
      WHERE NOT EXISTS (SELECT 1 FROM item_unit_conversions c WHERE c.item_id = it.id AND c.unit_id = g.to_unit_id)
        AND NOT EXISTS (SELECT 1 FROM unit_conversions g2 WHERE g2.from_unit_id = g.to_unit_id AND g2.to_unit_id = it.unit_id)`,
    [itemId],
  );
}

export async function getItemConversions(itemId: string) {
  return query<{ id: number; unit_id: number; symbol: string; name: string; factor: string }>(
    `SELECT c.id, c.unit_id, u.symbol, u.name, trim_scale(c.factor)::text AS factor
       FROM item_unit_conversions c JOIN units u ON u.id = c.unit_id
      WHERE c.item_id = $1 ORDER BY u.name`,
    [itemId],
  );
}

export type TxnFilter = {
  itemId?: string;
  type?: "stock_in" | "stock_out" | "reversal" | null;
  from?: string | null; // ISO timestamptz
  to?: string | null;
  q?: string | null;
  limit?: number;
  offset?: number;
};

export async function listTransactions(f: TxnFilter) {
  const where: string[] = [];
  const params: unknown[] = [];
  if (f.itemId) { params.push(f.itemId); where.push(`t.item_id = $${params.length}`); }
  if (f.type) { params.push(f.type); where.push(`t.txn_type = $${params.length}`); }
  if (f.from) { params.push(f.from); where.push(`t.occurred_at >= $${params.length}`); }
  if (f.to) { params.push(f.to); where.push(`t.occurred_at < $${params.length}`); }
  if (f.q && f.q.trim()) {
    params.push(`%${f.q.trim().toLowerCase()}%`);
    const n = params.length;
    where.push(`(lower(i.name) LIKE $${n} OR lower(i.sku) LIKE $${n} OR lower(t.txn_no) LIKE $${n} OR lower(coalesce(t.reference,'')) LIKE $${n})`);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const total = await queryOne<{ n: number }>(
    `SELECT count(*)::int AS n FROM stock_transactions t JOIN items i ON i.id = t.item_id ${whereSql}`,
    params,
  );
  params.push(f.limit ?? 50, f.offset ?? 0);
  const rows = await query<TxnRow>(
    `${TXN_SELECT} ${whereSql} ORDER BY t.occurred_at DESC, t.id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return { rows, total: total?.n ?? 0 };
}

export async function getTransaction(id: string) {
  if (!/^\d+$/.test(id)) return null;
  return queryOne<TxnRow>(`${TXN_SELECT} WHERE t.id = $1`, [id]);
}

export async function findSimilarItems(name: string, excludeId?: string) {
  if (!name.trim()) return [];
  return query<{ id: string; name: string; sku: string; archived: boolean }>(
    `SELECT id, name, sku, archived_at IS NOT NULL AS archived
       FROM items
      WHERE ($2::uuid IS NULL OR id <> $2::uuid)
        AND (similarity(lower(name), lower($1)) > 0.45 OR lower(name) = lower($1)
             OR (length($1) >= 4 AND (lower(name) LIKE '%' || lower($1) || '%' OR lower($1) LIKE '%' || lower(name) || '%')))
      ORDER BY similarity(lower(name), lower($1)) DESC
      LIMIT 5`,
    [name.trim(), excludeId ?? null],
  );
}

export async function skuExists(sku: string, excludeId?: string) {
  const row = await queryOne(
    "SELECT 1 FROM items WHERE lower(sku) = lower($1) AND ($2::uuid IS NULL OR id <> $2::uuid)",
    [sku.trim(), excludeId ?? null],
  );
  return !!row;
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------
async function nextSku(client: PoolClient) {
  for (let i = 0; i < 20; i++) {
    const { rows } = await client.query<{ sku: string }>(
      "SELECT 'ITM-' || lpad(nextval('item_sku_seq')::text, 5, '0') AS sku",
    );
    const exists = await client.query("SELECT 1 FROM items WHERE lower(sku) = lower($1)", [rows[0].sku]);
    if (!exists.rowCount) return rows[0].sku;
  }
  throw new AppError("SKU_GENERATION", "Could not generate an item code; enter one manually.");
}

export async function createItem(input: z.infer<typeof itemCreateSchema>, userId: string) {
  return withTransaction(async (client) => {
    // Idempotency for double-clicks: if this request already created an item, return it.
    if (input.request_id) {
      // Serialise concurrent submissions of the same form, then check whether it was already saved.
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [input.request_id]);
      const prev = await client.query<{ entity_id: string }>(
        "SELECT entity_id FROM audit_logs WHERE action = 'item.create' AND details->>'request_id' = $1",
        [input.request_id],
      );
      if (prev.rowCount) return { id: prev.rows[0].entity_id, duplicate: true };
    }
    const unit = await client.query("SELECT 1 FROM units WHERE id = $1 AND archived_at IS NULL", [input.unit_id]);
    if (!unit.rowCount) throw new AppError("INVALID_UNIT", "Choose a valid measurement unit.");

    const sku = input.sku ? input.sku : await nextSku(client);
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO items (sku, name, category_id, description, unit_id, allow_fraction, min_stock_level,
                          default_supplier_id, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [sku, input.name, input.category_id, input.description, input.unit_id, input.allow_fraction,
       input.min_stock_level, input.default_supplier_id, input.notes, userId],
    );
    const id = rows[0].id;

    for (const c of input.conversions) {
      if (c.unit_id === input.unit_id) continue;
      await client.query(
        "INSERT INTO item_unit_conversions (item_id, unit_id, factor) VALUES ($1,$2,$3) ON CONFLICT (item_id, unit_id) DO UPDATE SET factor = EXCLUDED.factor",
        [id, c.unit_id, c.factor],
      );
    }

    // Opening stock is recorded as a normal stock-in so balances come from the ledger.
    if (Number(input.opening_quantity) > 0) {
      await client.query(
        "SELECT * FROM stock_in($1,$2,$3,$4,$5,NULL,$6,$7,NULL,$8,NULL,true)",
        [id, input.opening_quantity, input.unit_id, input.opening_unit_cost, input.default_supplier_id,
         null, null, userId],
      );
    }
    await audit(userId, "item.create", "item", id, { sku, name: input.name, request_id: input.request_id ?? null }, client);
    return { id, duplicate: false };
  });
}

export async function updateItem(id: string, input: z.infer<typeof itemUpdateSchema>, userId: string) {
  return withTransaction(async (client) => {
    const before = await client.query("SELECT * FROM items WHERE id = $1 FOR UPDATE", [id]);
    if (!before.rowCount) throw new AppError("ITEM_NOT_FOUND", "Item not found.", 404);
    const old = before.rows[0];
    if (input.unit_id && input.unit_id !== old.unit_id) {
      const hasTxn = await client.query("SELECT 1 FROM stock_transactions WHERE item_id = $1 LIMIT 1", [id]);
      if (hasTxn.rowCount) {
        throw new AppError("UNIT_LOCKED", "The unit can't be changed after stock has been recorded. Add a unit conversion instead.", 409);
      }
    }
    if (!input.allow_fraction && Number(old.quantity) !== Math.trunc(Number(old.quantity))) {
      throw new AppError("FRACTION_IN_STOCK", "This item currently holds a fractional quantity, so whole-numbers-only can't be turned on.", 409);
    }
    await client.query(
      `UPDATE items SET name=$2, sku=$3, category_id=$4, description=$5, unit_id=coalesce($6, unit_id),
              allow_fraction=$7, min_stock_level=$8, default_supplier_id=$9, notes=$10, updated_at=now()
        WHERE id=$1`,
      [id, input.name, input.sku, input.category_id, input.description, input.unit_id ?? null,
       input.allow_fraction, input.min_stock_level, input.default_supplier_id, input.notes],
    );
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const k of ["name", "sku", "category_id", "description", "unit_id", "allow_fraction", "min_stock_level", "default_supplier_id", "notes"] as const) {
      const to = (input as Record<string, unknown>)[k];
      if (to === undefined) continue;
      const from = old[k];
      if (String(from ?? "") !== String(to ?? "") && !(k === "min_stock_level" && Number(from) === Number(to))) {
        changes[k] = { from, to };
      }
    }
    if (Object.keys(changes).length) await audit(userId, "item.update", "item", id, { changes }, client);
  });
}

export async function setItemArchived(id: string, archived: boolean, userId: string) {
  const row = await queryOne<{ id: string }>(
    `UPDATE items SET archived_at = ${archived ? "now()" : "NULL"}, updated_at = now() WHERE id = $1 RETURNING id`,
    [id],
  );
  if (!row) throw new AppError("ITEM_NOT_FOUND", "Item not found.", 404);
  await audit(userId, archived ? "item.archive" : "item.restore", "item", id);
}

export async function upsertItemConversion(itemId: string, unitId: number, factor: string, userId: string) {
  const item = await queryOne<{ unit_id: number }>("SELECT unit_id FROM items WHERE id = $1", [itemId]);
  if (!item) throw new AppError("ITEM_NOT_FOUND", "Item not found.", 404);
  if (item.unit_id === unitId) throw new AppError("SAME_UNIT", "That is already the item's base unit.");
  await query(
    `INSERT INTO item_unit_conversions (item_id, unit_id, factor) VALUES ($1,$2,$3)
     ON CONFLICT (item_id, unit_id) DO UPDATE SET factor = EXCLUDED.factor`,
    [itemId, unitId, factor],
  );
  await audit(userId, "item.conversion.set", "item", itemId, { unit_id: unitId, factor });
}

export async function deleteItemConversion(itemId: string, conversionId: number, userId: string) {
  const row = await queryOne("DELETE FROM item_unit_conversions WHERE id = $1 AND item_id = $2 RETURNING unit_id, factor", [conversionId, itemId]);
  if (!row) throw new AppError("NOT_FOUND", "Conversion not found.", 404);
  await audit(userId, "item.conversion.remove", "item", itemId, row);
}

export async function recordStockIn(input: z.infer<typeof stockInSchema>, userId: string) {
  return withTransaction(async (client) => {
    if (input.supplier_id) {
      const s = await client.query("SELECT name FROM suppliers WHERE id = $1", [input.supplier_id]);
      if (!s.rowCount) throw new AppError("INVALID_SUPPLIER", "Supplier not found.");
    }
    const { rows } = await client.query(
      "SELECT id::text, txn_no FROM stock_in($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
      [input.item_id, input.quantity, input.unit_id, input.unit_cost, input.supplier_id, input.supplier_name,
       input.reference, input.notes, input.occurred_at, userId, input.request_id],
    );
    return rows[0] as { id: string; txn_no: string };
  });
}

export async function recordStockOut(input: z.infer<typeof stockOutSchema>, userId: string) {
  const { rows } = await (await db()).query(
    "SELECT id::text, txn_no FROM stock_out($1,$2,$3,$4,$5,$6,$7,$8,$9)",
    [input.item_id, input.quantity, input.unit_id, input.reason, input.recipient, input.reference, input.notes,
     userId, input.request_id],
  );
  return rows[0] as { id: string; txn_no: string };
}

export async function reverseTransaction(txnId: string, reason: string, requestId: string, userId: string) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      "SELECT id::text, txn_no, reverses_id::text FROM reverse_transaction($1,$2,$3,$4)",
      [txnId, reason, userId, requestId],
    );
    await audit(userId, "transaction.reverse", "stock_transaction", txnId, { reversal_txn: rows[0].txn_no, reason }, client);
    return rows[0] as { id: string; txn_no: string };
  });
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------
export async function dashboardStats(timeZone: string) {
  const [totals, byUnit, today, week, recent] = await Promise.all([
    queryOne<{ items: number; worth: string; low: number; out: number }>(
      `SELECT count(*)::int AS items,
              coalesce(sum(stock_value), 0)::text AS worth,
              count(*) FILTER (WHERE quantity > 0 AND quantity <= min_stock_level)::int AS low,
              count(*) FILTER (WHERE quantity <= 0)::int AS out
         FROM items WHERE archived_at IS NULL`,
    ),
    query<{ symbol: string; qty: string; items: number }>(
      `SELECT u.symbol, sum(i.quantity)::text AS qty, count(*)::int AS items
         FROM items i JOIN units u ON u.id = i.unit_id
        WHERE i.archived_at IS NULL
        GROUP BY u.symbol ORDER BY sum(i.quantity) DESC`,
    ),
    queryOne<{ in_value: string; out_value: string; in_count: number; out_count: number }>(
      `SELECT coalesce(sum(total_value) FILTER (WHERE txn_type='stock_in'), 0)::text AS in_value,
              coalesce(sum(total_value) FILTER (WHERE txn_type='stock_out'), 0)::text AS out_value,
              count(*) FILTER (WHERE txn_type='stock_in')::int AS in_count,
              count(*) FILTER (WHERE txn_type='stock_out')::int AS out_count
         FROM stock_transactions
        WHERE occurred_at >= (date_trunc('day', now() AT TIME ZONE $1)) AT TIME ZONE $1`,
      [timeZone],
    ),
    query<{ day: string; in_value: string; out_value: string }>(
      `WITH days AS (
         SELECT generate_series((now() AT TIME ZONE $1)::date - 6, (now() AT TIME ZONE $1)::date, interval '1 day')::date AS day
       )
       SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
              coalesce(sum(t.total_value) FILTER (WHERE t.txn_type='stock_in'), 0)::text AS in_value,
              coalesce(sum(t.total_value) FILTER (WHERE t.txn_type='stock_out'), 0)::text AS out_value
         FROM days d
         LEFT JOIN stock_transactions t
           ON t.occurred_at >= d.day::timestamp AT TIME ZONE $1
          AND t.occurred_at < (d.day + 1)::timestamp AT TIME ZONE $1
        GROUP BY d.day ORDER BY d.day`,
      [timeZone],
    ),
    query<TxnRow>(`${TXN_SELECT} ORDER BY t.created_at DESC, t.id DESC LIMIT 8`),
  ]);
  const attention = await query<ItemRow>(
    `${ITEM_SELECT} WHERE i.archived_at IS NULL AND i.quantity <= i.min_stock_level
     ORDER BY (i.quantity <= 0) DESC, lower(i.name) LIMIT 6`,
  );
  return { totals: totals!, byUnit, today: today!, week, recent, attention };
}
