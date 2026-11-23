import { handle, ok } from "@/lib/api";
import { requirePlatformAdmin } from "@/lib/auth";
import { queryOne, withStore } from "@/lib/db";
import { AppError } from "@/lib/errors";

/** Find an account by email: which business it belongs to and what's in that business. */
export const GET = handle(async (req) => {
  await requirePlatformAdmin();
  const email = (new URL(req.url).searchParams.get("email") ?? "").trim().toLowerCase();
  if (!email.includes("@")) throw new AppError("VALIDATION", "Enter the account's email.", 400);
  const u = await withStore(null, () => queryOne<{
    id: string; name: string; email: string; role: string; is_platform_admin: boolean; is_active: boolean; store_id: number; store_name: string; created_via: string;
  }>(
    `SELECT u.id, u.name, u.email, u.role, u.is_platform_admin, u.is_active, u.store_id, s.name AS store_name, s.created_via
       FROM users u JOIN stores s ON s.id = u.store_id WHERE lower(u.email) = $1 AND u.deleted_at IS NULL`, [email]));
  if (!u) return ok({ account: null });
  const counts = await withStore(u.store_id, () => queryOne<{ items: number; txns: number; users: number }>(
    `SELECT (SELECT count(*)::int FROM items) AS items, (SELECT count(*)::int FROM stock_transactions) AS txns,
            (SELECT count(*)::int FROM users WHERE store_id = current_store() AND deleted_at IS NULL) AS users`));
  return ok({ account: { ...u, ...counts! } });
});
