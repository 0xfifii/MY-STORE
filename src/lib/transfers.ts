import "server-only";
import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import { query, queryOne, withStore, withTransaction } from "./db";
import { audit } from "./audit";
import { AppError, friendlyDbError } from "./errors";
import { nextSku } from "./inventory";
import type { SessionUser } from "./auth";
import { positiveQty, uuid } from "./validation";

/*
 * Transfers between accounts
 * --------------------------
 * Stock leaves this business (a stock out with the reason "Transfer") and arrives in another business
 * (a stock in at the same cost) in ONE database transaction: either both sides are recorded or neither.
 * On the receiving side the item is matched by name; if it isn't there yet it's created with the same
 * name, unit, category, price and photo.
 * Who can send where: the ÌṢÚRA admin to any business; everyone else (with Stock Out permission)
 * only to businesses the admin has linked to theirs.
 */

export const MAX_TRANSFER_LINES = 50;

export const transferSchema = z.object({
  to_store: z.coerce.number().int().positive({ message: "Choose the account to send to" }),
  notes: z.string().trim().max(500).optional().nullable().transform((v) => v || null),
  request_id: uuid,
  /** When it happened; empty means now. An earlier day needs the backdate permission (checked by the route). */
  occurred_at: z.string().optional().nullable().transform((v) => (v ? v : null))
    .refine((v) => v === null || !Number.isNaN(Date.parse(v)), { message: "Invalid date" })
    .refine((v) => v === null || Date.parse(v) <= Date.now() + 5 * 60000, { message: "The date can't be in the future." }),
  lines: z.array(z.object({
    item_id: uuid,
    quantity: positiveQty,
    unit_id: z.coerce.number().int().positive(),
    request_id: uuid,
    /** After sending all of it, archive the item here so it no longer shows in this account. */
    remove_here: z.boolean().optional().default(false),
  })).min(1, "Add at least one item").max(MAX_TRANSFER_LINES, `At most ${MAX_TRANSFER_LINES} items at a time`),
});
export type TransferInput = z.infer<typeof transferSchema>;

export type Target = { id: number; name: string; locked: boolean };

/** Businesses this person can send stock to from the business they're in now. */
export async function transferTargets(user: SessionUser): Promise<Target[]> {
  return withStore(null, () => query<Target>(
    `SELECT s.id, s.name, (s.status = 'paused' OR (s.paid_until IS NOT NULL AND s.paid_until < now())) AS locked
       FROM stores s
      WHERE s.id <> $1
        AND ($2::boolean OR EXISTS (SELECT 1 FROM store_links l WHERE (l.store_a = $1 AND l.store_b = s.id) OR (l.store_b = $1 AND l.store_a = s.id)))
      ORDER BY s.name`,
    [user.store_id, user.is_platform_admin],
  ));
}

async function assertCanSend(user: SessionUser, to: number) {
  const ok = (await transferTargets(user)).find((t) => t.id === to);
  if (!ok) throw new AppError("TRANSFER_NOT_ALLOWED", "You can't send stock to that account. Ask the ÌṢÚRA admin to link it to this one.", 403);
  return ok;
}

/** The other account's version of each item (matched by name), so the person sees what will happen. */
export async function previewTransfer(user: SessionUser, to: number, itemIds: string[]) {
  const target = await assertCanSend(user, to);
  const items = await query<{ id: string; name: string }>("SELECT id::text, name FROM items WHERE id = ANY($1::uuid[])", [itemIds]);
  const names = items.map((i) => i.name.trim().toLowerCase());
  const there = await withStore(to, () => query<{ key: string; id: string; name: string; quantity: string; unit_symbol: string; archived: boolean }>(
    `SELECT DISTINCT ON (lower(trim(i.name))) lower(trim(i.name)) AS key, i.id::text, i.name, i.quantity::text, u.symbol AS unit_symbol,
            (i.archived_at IS NOT NULL) AS archived
       FROM items i JOIN units u ON u.id = i.unit_id
      WHERE lower(trim(i.name)) = ANY($1::text[])
      ORDER BY lower(trim(i.name)), i.archived_at NULLS FIRST, i.created_at`,
    [names],
  ));
  const byName = new Map(there.map((t) => [t.key, t]));
  return {
    target,
    items: items.map((i) => {
      const m = byName.get(i.name.trim().toLowerCase());
      return { item_id: i.id, match: m ? { id: m.id, name: m.name, quantity: m.quantity, unit_symbol: m.unit_symbol, archived: m.archived } : null };
    }),
  };
}

/** A second request id for the receiving side, derived from the line's own (so a retry is recognised there too). */
function receivingRequestId(id: string) {
  const h = createHash("md5").update(`${id}:transfer-in`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

const useStore = (c: PoolClient, id: number) => c.query("SELECT set_config('isura.store_id', $1, true)", [String(Math.trunc(id))]);

type SentLine = {
  from_item_id: string; name: string; sku: string; quantity: string; unit_symbol: string; unit_cost: string; total_value: string;
  out_txn: string; remove_here: boolean;
  src: { unit_id: number; unit_name: string; unit_symbol: string; unit_decimal: boolean; unit_shared: boolean; category: string | null;
    description: string | null; allow_fraction: boolean; min_stock_level: string; price: string | null; notes: string | null; photo: Buffer | null; photo_type: string | null };
};
export type TransferLine = Omit<SentLine, "src" | "remove_here"> & { to_item_id: string; in_txn: string; created: boolean; archived: boolean };
export type Transfer = {
  id: string; transfer_no: string; from_store: number; to_store: number; from_name: string; to_name: string;
  created_by_name: string | null; notes: string | null; lines: TransferLine[]; created_at: string; occurred_at: string;
};

/** Sends the stock. Returns the saved transfer (the same one again if this request was already saved). */
export async function recordTransfer(user: SessionUser, input: TransferInput): Promise<Transfer> {
  const from = user.store_id;
  const to = input.to_store;
  await assertCanSend(user, to);
  const fromName = (await withStore(null, () => queryOne<{ name: string }>("SELECT name FROM stores WHERE id = $1", [from])))!.name;
  const toName = (await withStore(null, () => queryOne<{ name: string }>("SELECT name FROM stores WHERE id = $1", [to])))!.name;

  return withStore(from, () => withTransaction(async (c) => {
    // A double-click or a retry returns the transfer that was already saved.
    await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [input.request_id]);
    const prev = await c.query<Transfer>(`SELECT id::text, transfer_no, from_store, to_store, from_name, to_name, created_by_name, notes, lines, created_at::text, occurred_at::text
                                            FROM stock_transfers WHERE request_id = $1`, [input.request_id]);
    if (prev.rowCount) return prev.rows[0];

    const head = await c.query<{ id: string; transfer_no: string }>(
      `INSERT INTO stock_transfers (from_store, to_store, from_name, to_name, created_by, created_by_name, notes, request_id, occurred_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8, coalesce($9::timestamptz, now())) RETURNING id::text, transfer_no`,
      [from, to, fromName, toName, user.id, user.name, input.notes, input.request_id, input.occurred_at],
    );
    const { id, transfer_no } = head.rows[0];

    // 1) Out of this business.
    const sent: SentLine[] = [];
    for (const [i, l] of input.lines.entries()) {
      const s = await c.query<SentLine["src"] & { name: string; sku: string; base_symbol: string }>(
        `SELECT i.name, i.sku, i.unit_id, u.name AS unit_name, u.symbol AS unit_symbol, u.symbol AS base_symbol, u.allow_decimal AS unit_decimal,
                (u.store_id IS NULL) AS unit_shared, c.name AS category, i.description, i.allow_fraction, i.min_stock_level::text,
                i.price::text, i.notes, i.photo, i.photo_type
           FROM items i JOIN units u ON u.id = i.unit_id LEFT JOIN categories c ON c.id = i.category_id WHERE i.id = $1`,
        [l.item_id],
      );
      if (!s.rowCount) throw new AppError("ITEM_NOT_FOUND", `Line ${i + 1}: item not found.`, 404, { line: i });
      const src = s.rows[0];
      try {
        const out = await c.query<{ txn_no: string; quantity: string; unit_cost: string; total_value: string }>(
          "SELECT txn_no, quantity::text, unit_cost::text, total_value::text FROM stock_out($1,$2,$3,'transfer',$4,$5,$6,$7,$8,$9)",
          [l.item_id, l.quantity, l.unit_id, toName, transfer_no, input.notes, user.id, l.request_id, input.occurred_at],
        );
        const o = out.rows[0];
        if (l.remove_here) {
          const left = await c.query<{ q: string }>("SELECT quantity::text AS q FROM items WHERE id = $1", [l.item_id]);
          if (Number(left.rows[0].q) > 0) {
            throw new AppError("NOT_ALL_SENT", `Line ${i + 1}, ${src.name}: to remove it from this account, send all of it (${left.rows[0].q} ${src.base_symbol} would be left).`, 409, { line: i });
          }
          await c.query("UPDATE items SET archived_at = now(), updated_at = now() WHERE id = $1", [l.item_id]);
        }
        sent.push({ from_item_id: l.item_id, name: src.name, sku: src.sku, quantity: o.quantity, unit_symbol: src.base_symbol,
          unit_cost: o.unit_cost, total_value: o.total_value, out_txn: o.txn_no, remove_here: l.remove_here, src });
      } catch (e) {
        if (e instanceof AppError) throw e;
        const f = friendlyDbError(e);
        if (!f) throw e;
        throw new AppError(f.code, `Line ${i + 1}, ${src.name}: ${f.message}`, f.status, { line: i });
      }
    }

    // 2) Into the other business.
    await useStore(c, to);
    const lines: TransferLine[] = [];
    for (const [i, s] of sent.entries()) {
      const unitId = await receivingUnit(c, s.src);
      const found = await c.query<{ id: string; archived: boolean }>(
        `SELECT id::text, (archived_at IS NOT NULL) AS archived FROM items WHERE lower(trim(name)) = lower(trim($1))
          ORDER BY archived_at NULLS FIRST, created_at LIMIT 1 FOR UPDATE`, [s.name]);
      let itemId: string;
      let created = false;
      if (found.rowCount) {
        itemId = found.rows[0].id;
        if (found.rows[0].archived) await c.query("UPDATE items SET archived_at = NULL, updated_at = now() WHERE id = $1", [itemId]);
      } else {
        itemId = await createReceivingItem(c, s, unitId, user.id);
        created = true;
      }
      try {
        const inn = await c.query<{ txn_no: string }>(
          "SELECT txn_no FROM stock_in($1,$2,$3,$4,NULL,$5,$6,$7,$8,$9,$10)",
          [itemId, s.quantity, unitId, s.unit_cost, `Transfer from ${fromName}`, transfer_no, input.notes, input.occurred_at, user.id, receivingRequestId(input.lines[i].request_id)],
        );
        lines.push({ from_item_id: s.from_item_id, to_item_id: itemId, name: s.name, sku: s.sku, quantity: s.quantity, unit_symbol: s.unit_symbol,
          unit_cost: s.unit_cost, total_value: s.total_value, out_txn: s.out_txn, in_txn: inn.rows[0].txn_no, created, archived: s.remove_here });
      } catch (e) {
        const f = friendlyDbError(e);
        if (!f) throw e;
        const msg = f.code === "UNIT_NOT_CONVERTIBLE"
          ? `${s.name} in ${toName} is counted in a different unit from ${s.unit_symbol}. Add a conversion for ${s.unit_symbol} to that item in ${toName}, or rename one of them.`
          : `${f.message}`;
        throw new AppError(f.code, `Line ${i + 1}, ${s.name} (arriving in ${toName}): ${msg}`, f.status, { line: i });
      }
    }
    await audit(user.id, "stock.transfer_in", "transfer", id, { transfer_no, from: fromName, lines: lines.length }, c);

    // 3) Back to this business to finish the record.
    await useStore(c, from);
    await audit(user.id, "stock.transfer_out", "transfer", id, { transfer_no, to: toName, lines: lines.length }, c);
    const done = await c.query<Transfer>(
      `UPDATE stock_transfers SET lines = $2 WHERE id = $1
       RETURNING id::text, transfer_no, from_store, to_store, from_name, to_name, created_by_name, notes, lines, created_at::text, occurred_at::text`,
      [id, JSON.stringify(lines)],
    );
    return done.rows[0];
  }));
}

/** The unit to receive in: shared units are the same everywhere; a business's own unit is matched by name or symbol, or added. */
async function receivingUnit(c: PoolClient, s: SentLine["src"]) {
  if (s.unit_shared) return s.unit_id;
  const u = await c.query<{ id: number }>(
    `SELECT id FROM units WHERE store_id = current_store() AND (lower(name) = lower($1) OR lower(symbol) = lower($2))
      ORDER BY (lower(name) = lower($1)) DESC, archived_at NULLS FIRST LIMIT 1`, [s.unit_name, s.unit_symbol]);
  if (u.rowCount) {
    await c.query("UPDATE units SET archived_at = NULL WHERE id = $1 AND archived_at IS NOT NULL", [u.rows[0].id]);
    return u.rows[0].id;
  }
  const n = await c.query<{ id: number }>("INSERT INTO units (name, symbol, allow_decimal) VALUES ($1,$2,$3) RETURNING id", [s.unit_name, s.unit_symbol, s.unit_decimal]);
  return n.rows[0].id;
}

/** A new item in the receiving business, a copy of the one being sent (name, unit, category, price, photo). */
async function createReceivingItem(c: PoolClient, s: SentLine, unitId: number, userId: string) {
  let categoryId: number | null = null;
  if (s.src.category) {
    const cat = await c.query<{ id: number }>("SELECT id FROM categories WHERE lower(name) = lower($1)", [s.src.category]);
    categoryId = cat.rowCount
      ? cat.rows[0].id
      : (await c.query<{ id: number }>("INSERT INTO categories (name) VALUES ($1) RETURNING id", [s.src.category])).rows[0].id;
    await c.query("UPDATE categories SET archived_at = NULL WHERE id = $1 AND archived_at IS NOT NULL", [categoryId]);
  }
  const skuTaken = await c.query("SELECT 1 FROM items WHERE lower(sku) = lower($1)", [s.sku]);
  const sku = skuTaken.rowCount ? await nextSku(c) : s.sku;
  const r = await c.query<{ id: string }>(
    `INSERT INTO items (sku, name, category_id, description, unit_id, allow_fraction, min_stock_level, notes, price, photo, photo_type, photo_updated_at, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, CASE WHEN $10::bytea IS NULL THEN NULL ELSE now() END, $12) RETURNING id::text`,
    [sku, s.name, categoryId, s.src.description, unitId, s.src.allow_fraction, s.src.min_stock_level, s.src.notes,
     s.src.price ?? s.unit_cost, s.src.photo, s.src.photo_type, userId],
  );
  await audit(userId, "item.create", "item", r.rows[0].id, { sku, name: s.name, via: "transfer" }, c);
  return r.rows[0].id;
}

/** Transfers this business sent or received, newest first. */
export async function listTransfers(limit = 30) {
  return query<Transfer>(
    `SELECT id::text, transfer_no, from_store, to_store, from_name, to_name, created_by_name, notes, lines, created_at::text, occurred_at::text
       FROM stock_transfers ORDER BY occurred_at DESC, id DESC LIMIT $1`, [limit]);
}

// ---------------------------------------------------------------------------------------------
// Links (set by the ÌṢÚRA admin)
// ---------------------------------------------------------------------------------------------
export const listLinks = () => withStore(null, () => query<{ store_a: number; store_b: number }>("SELECT store_a, store_b FROM store_links ORDER BY 1, 2"));

/** Sets which businesses `storeId` is linked to (replaces its current links). */
export async function setLinks(storeId: number, others: number[], by: string) {
  const ids = [...new Set(others.filter((o) => o !== storeId))];
  await withStore(null, () => withTransaction(async (c) => {
    await c.query("DELETE FROM store_links WHERE store_a = $1 OR store_b = $1", [storeId]);
    for (const o of ids) {
      await c.query("INSERT INTO store_links (store_a, store_b, created_by) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING",
        [Math.min(storeId, o), Math.max(storeId, o), by]);
    }
  }));
}
