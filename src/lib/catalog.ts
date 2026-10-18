import "server-only";
import { query } from "./db";

export type Category = { id: number; name: string; description: string | null; archived_at: string | null; item_count: number };
export type Supplier = {
  id: number; name: string; contact_person: string | null; phone: string | null; email: string | null;
  address: string | null; notes: string | null; archived_at: string | null; receipt_count: number;
};
export type Unit = { id: number; name: string; symbol: string; allow_decimal: boolean; is_system: boolean; archived_at: string | null; item_count: number };
export type GlobalConversion = { id: number; from_unit_id: number; from_symbol: string; to_unit_id: number; to_symbol: string; factor: string };

export const listCategories = (includeArchived = false) =>
  query<Category>(
    `SELECT c.id, c.name, c.description, c.archived_at,
            (SELECT count(*)::int FROM items i WHERE i.category_id = c.id AND i.archived_at IS NULL) AS item_count
       FROM categories c ${includeArchived ? "" : "WHERE c.archived_at IS NULL"} ORDER BY lower(c.name)`,
  );

export const listSuppliers = (includeArchived = false) =>
  query<Supplier>(
    `SELECT s.*, (SELECT count(*)::int FROM stock_transactions t WHERE t.supplier_id = s.id) AS receipt_count
       FROM suppliers s ${includeArchived ? "" : "WHERE s.archived_at IS NULL"} ORDER BY lower(s.name)`,
  );

export const listUnits = (includeArchived = false) =>
  query<Unit>(
    `SELECT u.id, u.name, u.symbol, u.allow_decimal, u.is_system, u.archived_at,
            (SELECT count(*)::int FROM items i WHERE i.unit_id = u.id) AS item_count
       FROM units u ${includeArchived ? "" : "WHERE u.archived_at IS NULL"} ORDER BY u.is_system DESC, u.id`,
  );

export const listGlobalConversions = () =>
  query<GlobalConversion>(
    `SELECT c.id, c.from_unit_id, f.symbol AS from_symbol, c.to_unit_id, t.symbol AS to_symbol, trim_scale(c.factor)::text AS factor
       FROM unit_conversions c JOIN units f ON f.id = c.from_unit_id JOIN units t ON t.id = c.to_unit_id
      ORDER BY f.symbol`,
  );
