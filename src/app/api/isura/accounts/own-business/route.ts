import { z } from "zod";
import { handle, ok, readJson } from "@/lib/api";
import { requirePlatformAdmin } from "@/lib/auth";
import { forgetSessionStore, withStore, withTransaction } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { signupSettings } from "@/lib/signup";

const schema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  company_name: z.string().trim().min(2, "Enter the company name").max(120),
});

/**
 * Gives an account its own new, empty business (with them as owner), taking them out of the business
 * they were in. Nothing in the old business changes except that this person is no longer a member.
 */
export const POST = handle(async (req) => {
  const me = await requirePlatformAdmin();
  const input = schema.parse(await readJson(req));
  const s = await signupSettings();
  const result = await withStore(null, () => withTransaction(async (c) => {
    const { rows: [u] } = await c.query<{ id: string; store_id: number; is_platform_admin: boolean; name: string }>(
      "SELECT id, store_id, is_platform_admin, name FROM users WHERE lower(email) = $1 AND deleted_at IS NULL FOR UPDATE", [input.email]);
    if (!u) throw new AppError("NOT_FOUND", "No account with that email.", 404);
    if (u.is_platform_admin) throw new AppError("NOT_ALLOWED", "That's your own Palm Store admin account; it can't be moved.", 400);
    const { rows: [store] } = await c.query<{ id: number }>(
      `INSERT INTO stores (name, price_kobo, interval_months, paid_until, billing_email, created_via, notes)
       VALUES ($1, $2, 1, now() + make_interval(days => $3), $4, 'admin', 'Given its own business by the Palm Store admin') RETURNING id`,
      [input.company_name, s.priceKobo, s.trialDays, input.email]);
    await c.query("UPDATE users SET store_id = $1, role = 'owner', allowed_category_ids = NULL, updated_at = now() WHERE id = $2", [store.id, u.id]);
    await c.query("UPDATE sessions SET active_store_id = NULL WHERE user_id = $1", [u.id]);
    await c.query("SELECT set_config('isura.store_id', $1, true)", [String(store.id)]);
    await c.query("INSERT INTO settings (id, store_id, store_name) VALUES ($1, $2, $3)", [store.id, store.id, input.company_name]);
    await audit(me.id, "isura.account_given_own_business", "store", String(store.id), { email: input.email, from_store: u.store_id }, c);
    return { store_id: store.id, from_store: u.store_id, name: u.name };
  }));
  forgetSessionStore();
  return ok(result, 201);
});
