import "server-only";
import { query, queryOne } from "./db";

export type ActivityKind = "stock_in" | "stock_out" | "correction" | "price" | "count" | "item" | "setup" | "email" | "report" | "user" | "settings" | "signin";

export type Activity = {
  key: string;
  at: string;
  user_id: string | null;
  user_name: string | null;
  kind: ActivityKind;
  title: string;
  detail: string | null;
  href: string | null;
};

export const KIND_LABELS: Record<ActivityKind, string> = {
  stock_in: "Stock in",
  stock_out: "Stock out",
  correction: "Correction",
  price: "Price change",
  count: "Stock count",
  item: "Items",
  setup: "Setup lists",
  email: "Email",
  report: "Report",
  user: "Users",
  settings: "Settings",
  signin: "Sign in",
};

const REASONS = `CASE t.reason WHEN 'store_usage' THEN 'Store usage' WHEN 'kitchen_usage' THEN 'Kitchen usage' WHEN 'bakery_usage' THEN 'Bakery usage'
  WHEN 'bar_usage' THEN 'Bar usage' WHEN 'cleaning_usage' THEN 'Cleaning usage' WHEN 'sale' THEN 'Sale' WHEN 'transfer' THEN 'Transfer'
  WHEN 'damage' THEN 'Damage' WHEN 'expiry' THEN 'Expiry' WHEN 'wastage' THEN 'Wastage' ELSE 'Other' END`;

/**
 * One timeline of what people did: stock movements, item and list changes, counts, emails, saved reports
 * and sign-ins. Every source is read straight from the records the app already keeps.
 */
const FEED = `
  SELECT 'txn-' || t.id AS key, t.created_at AS at, t.created_by AS user_id,
         CASE WHEN t.txn_type = 'reversal' THEN 'correction' WHEN t.txn_type = 'revaluation' THEN 'price' WHEN t.txn_type = 'stock_in' THEN 'stock_in' ELSE 'stock_out' END AS kind,
         CASE WHEN t.txn_type = 'stock_in' THEN 'Received ' || trim_scale(t.entered_quantity)::text || ' ' || eu.symbol || ' of ' || i.name
              WHEN t.txn_type = 'stock_out' THEN 'Took out ' || trim_scale(t.entered_quantity)::text || ' ' || eu.symbol || ' of ' || i.name
              WHEN t.txn_type = 'revaluation' THEN 'Changed the price of ' || i.name || ' to ' || trim_scale(round(t.entered_unit_cost, 2))::text || ' per ' || eu.symbol
              ELSE 'Reversed ' || coalesce(t.reference, 'a transaction') || ' (' || i.name || ')' END AS title,
         CASE WHEN t.txn_type = 'stock_in' THEN concat_ws(' · ', CASE WHEN t.is_opening THEN 'Opening stock' END, coalesce(sp.name, t.supplier_name), t.txn_no)
              WHEN t.txn_type = 'stock_out' THEN concat_ws(' · ', ${REASONS}, w.name, t.recipient, t.txn_no)
              WHEN t.txn_type = 'revaluation' THEN concat_ws(' · ', CASE WHEN t.direction > 0 THEN 'Stock worth went up' ELSE 'Stock worth went down' END, t.correction_reason)
              ELSE t.correction_reason END AS detail,
         '/items/' || i.id AS href, t.total_value AS value
    FROM stock_transactions t JOIN items i ON i.id = t.item_id JOIN units eu ON eu.id = t.entered_unit_id
    LEFT JOIN suppliers sp ON sp.id = t.supplier_id LEFT JOIN workers w ON w.id = t.worker_id
   WHERE coalesce(t.source, '') <> 'count'
  UNION ALL
  SELECT 'log-' || a.id, a.created_at, a.user_id,
         CASE WHEN a.entity_type = 'stock_count' THEN 'count'
              WHEN a.entity_type = 'item' THEN 'item'
              WHEN a.entity_type IN ('category','supplier','worker','unit','unit_conversion') THEN 'setup'
              WHEN a.entity_type = 'user' THEN 'user'
              WHEN a.entity_type IN ('settings') OR a.action LIKE 'setup.%' THEN 'settings'
              ELSE 'setup' END,
         CASE a.action
           WHEN 'item.create' THEN 'Added item ' WHEN 'item.update' THEN 'Edited item ' WHEN 'item.archive' THEN 'Archived item '
           WHEN 'item.restore' THEN 'Restored item ' WHEN 'item.delete' THEN 'Deleted item ' WHEN 'item.conversion.set' THEN 'Set a unit conversion for '
           WHEN 'item.conversion.remove' THEN 'Removed a unit conversion from '
           WHEN 'count.record' THEN 'Recorded a stock count ' WHEN 'count.approve' THEN 'Approved stock count ' WHEN 'count.reject' THEN 'Rejected stock count '
           WHEN 'category.create' THEN 'Added category ' WHEN 'category.update' THEN 'Edited category '
           WHEN 'supplier.create' THEN 'Added supplier ' WHEN 'supplier.update' THEN 'Edited supplier ' WHEN 'supplier.archive' THEN 'Archived supplier ' WHEN 'supplier.restore' THEN 'Restored supplier '
           WHEN 'worker.create' THEN 'Added worker ' WHEN 'worker.update' THEN 'Edited worker ' WHEN 'worker.archive' THEN 'Archived worker ' WHEN 'worker.restore' THEN 'Restored worker '
           WHEN 'unit.create' THEN 'Added unit ' WHEN 'unit_conversion.set' THEN 'Set a unit conversion ' WHEN 'unit_conversion.remove' THEN 'Removed a unit conversion '
           WHEN 'user.create' THEN 'Added user ' WHEN 'user.delete' THEN 'Removed user ' WHEN 'user.update' THEN 'Updated user ' WHEN 'user.permissions' THEN 'Changed permissions for '
           WHEN 'settings.update' THEN 'Changed store settings' WHEN 'settings.email' THEN 'Changed the email account' WHEN 'setup.owner_created' THEN 'Set up the store'
           ELSE initcap(replace(replace(a.action, '.', ' '), '_', ' ')) || ' '
         END || coalesce(CASE
           WHEN a.action IN ('setup.owner_created','settings.update','settings.email') THEN ''
           WHEN a.entity_type = 'item' THEN coalesce((SELECT name FROM items WHERE id::text = a.entity_id), a.details->>'name')
           WHEN a.entity_type = 'user' THEN (SELECT name FROM users WHERE id::text = a.entity_id)
           WHEN a.entity_type = 'worker' THEN (SELECT name FROM workers WHERE id::text = a.entity_id)
           WHEN a.entity_type = 'category' THEN (SELECT name FROM categories WHERE id::text = a.entity_id)
           WHEN a.entity_type = 'supplier' THEN (SELECT name FROM suppliers WHERE id::text = a.entity_id)
           WHEN a.entity_type = 'unit' THEN (SELECT name FROM units WHERE id::text = a.entity_id)
           WHEN a.entity_type = 'stock_count' THEN (SELECT sc.count_no || ' for ' || i.name FROM stock_counts sc JOIN items i ON i.id = sc.item_id WHERE sc.id::text = a.entity_id)
         END, ''),
         NULL,
         CASE WHEN a.entity_type = 'item' AND a.action <> 'item.delete' THEN '/items/' || a.entity_id
              WHEN a.entity_type = 'stock_count' THEN '/stock-count' WHEN a.entity_type = 'category' THEN '/categories'
              WHEN a.entity_type = 'supplier' THEN '/suppliers' WHEN a.entity_type = 'worker' THEN '/workers' WHEN a.entity_type IN ('unit','unit_conversion') THEN '/units' END,
         NULL::numeric
    FROM audit_logs a
   WHERE a.entity_type <> 'stock_transaction' AND a.action NOT IN ('transaction.reverse', 'item.price')
  UNION ALL
  SELECT 'mail-' || e.id, e.sent_at, e.sent_by, 'email',
         CASE WHEN e.status = 'sent' THEN 'Sent an email: ' ELSE 'Tried to send an email (not delivered): ' END || e.subject,
         'To ' || array_to_string(e.recipients, ', ') || CASE WHEN e.status <> 'sent' AND e.error IS NOT NULL THEN ' · ' || e.error ELSE '' END,
         '/mail', NULL
    FROM email_log e WHERE e.sent_by IS NOT NULL
  UNION ALL
  SELECT 'rep-' || r.id, r.created_at, r.generated_by, 'report', 'Saved report: ' || r.title, upper(r.format), '/reports/history', NULL
    FROM generated_reports r WHERE r.generated_by IS NOT NULL AND r.trigger = 'manual' AND r.status = 'success'
  UNION ALL
  SELECT 'in-' || l.id, l.attempted_at, u.id, 'signin', 'Signed in', NULL, NULL, NULL
    FROM login_attempts l JOIN users u ON lower(u.email) = lower(l.email)
                                     AND l.attempted_at >= u.created_at AND (u.deleted_at IS NULL OR l.attempted_at <= u.deleted_at)
   WHERE l.success`;

export type ActivityFilter = { userId?: string | null; onlyUserId?: string | null; kind?: string | null; day?: string | null; tz: string; limit: number; offset: number };

export async function activityFeed(f: ActivityFilter) {
  const where = `($1::uuid IS NULL OR f.user_id = $1::uuid) AND ($2::text IS NULL OR f.kind = $2)
     AND ($3::date IS NULL OR (f.at AT TIME ZONE $4)::date = $3::date)`;
  const user = f.onlyUserId ?? f.userId ?? null;
  const args = [user, f.kind || null, f.day || null, f.tz];
  const rows = await query<Activity & { value: string | null }>(
    `SELECT f.key, f.at::text AS at, f.user_id, u.name AS user_name, f.kind, f.title, f.detail, f.href, f.value::numeric(20,2)::text AS value
       FROM (${FEED}) f LEFT JOIN users u ON u.id = f.user_id
      WHERE ${where}
      ORDER BY f.at DESC, f.key DESC LIMIT $5 OFFSET $6`,
    [...args, f.limit, f.offset],
  );
  const total = await queryOne<{ n: number }>(`SELECT count(*)::int AS n FROM (${FEED}) f WHERE ${where}`, args);
  return { rows, total: total?.n ?? 0 };
}

/** New things other people did since this user last looked (sign-ins are left out of the count). */
export async function unreadActivity(userId: string, limit = 5) {
  const seen = await queryOne<{ at: string | null }>("SELECT activity_seen_at::text AS at FROM users WHERE id = $1", [userId]);
  const since = seen?.at ?? new Date(0).toISOString();
  const latest = await query<Activity>(
    `SELECT f.key, f.at::text AS at, f.user_id, u.name AS user_name, f.kind, f.title, f.detail, f.href
       FROM (${FEED}) f LEFT JOIN users u ON u.id = f.user_id
      WHERE f.at > $2::timestamptz AND f.user_id IS DISTINCT FROM $1::uuid AND f.kind <> 'signin'
      ORDER BY f.at DESC LIMIT $3`,
    [userId, since, limit],
  );
  const n = await queryOne<{ n: number }>(
    `SELECT count(*)::int AS n FROM (${FEED}) f WHERE f.at > $2::timestamptz AND f.user_id IS DISTINCT FROM $1::uuid AND f.kind <> 'signin'`,
    [userId, since],
  );
  return { count: n?.n ?? 0, latest, since };
}

export async function markActivitySeen(userId: string) {
  await query("UPDATE users SET activity_seen_at = now() WHERE id = $1", [userId]);
}
