import { z } from "zod";
import { handle, ok, readJson } from "@/lib/api";
import { audit } from "@/lib/audit";
import { createSession, hashPassword, verifyPassword } from "@/lib/auth";
import { getInvite } from "@/lib/businesses";
import { hashToken, withStore, withTransaction } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { passwordSchema } from "@/lib/validation";

const schema = z.object({
  token: z.string().min(10),
  name: z.string().trim().max(120).optional(),
  password: z.string().min(1, "Enter a password"),
});

/**
 * Accept an invitation. New email: an account is created with the chosen password. Someone already in
 * this business: confirms with their password and gets the new role. As owner, previous owners become
 * staff (unless the invitation said otherwise). The ÌṢÚRA admin is never changed.
 */
export const POST = handle(async (req) => withStore(null, async () => {
  const input = schema.parse(await readJson(req));
  const inv = await getInvite(input.token);
  if (!inv) throw new AppError("INVITE_INVALID", "This invitation link isn't valid.", 404);
  if (inv.accepted) throw new AppError("INVITE_USED", "This invitation has already been used. Sign in instead.", 409);
  if (inv.expired) throw new AppError("INVITE_EXPIRED", "This invitation has expired. Ask ÌṢÚRA to send a new one.", 410);

  const userId = await withTransaction(async (c) => {
    const lock = await c.query("SELECT 1 FROM store_invites WHERE token_hash = $1 AND accepted_at IS NULL FOR UPDATE", [hashToken(input.token)]);
    if (!lock.rowCount) throw new AppError("INVITE_USED", "This invitation has already been used. Sign in instead.", 409);
    const found = await c.query<{ id: string; store_id: number | null; password_hash: string; is_platform_admin: boolean }>(
      "SELECT id, store_id, password_hash, is_platform_admin FROM users WHERE lower(email) = $1 AND deleted_at IS NULL", [inv.email]);
    let id: string;
    if (found.rowCount) {
      const u = found.rows[0];
      if (u.store_id !== inv.store_id && !u.is_platform_admin) {
        throw new AppError("EMAIL_IN_OTHER_BUSINESS", "This email is already used by another business on ÌṢÚRA. Ask for the invitation to go to a different email.", 409);
      }
      if (!(await verifyPassword(input.password, u.password_hash))) throw new AppError("BAD_LOGIN", "That password is not right for this email.", 401);
      id = u.id;
      if (!u.is_platform_admin) await c.query("UPDATE users SET role = $2, permissions = NULL, is_active = true, updated_at = now() WHERE id = $1", [id, inv.role]);
    } else {
      passwordSchema.parse(input.password);
      if (!input.name?.trim()) throw new AppError("NAME_REQUIRED", "Enter your name.", 400);
      const r = await c.query<{ id: string }>(
        "INSERT INTO users (name, email, password_hash, role, store_id) VALUES ($1, $2, $3, $4, $5) RETURNING id",
        [input.name.trim(), inv.email, await hashPassword(input.password), inv.role, inv.store_id]);
      id = r.rows[0].id;
    }
    const demote = await c.query<{ demote_previous: boolean }>("SELECT demote_previous FROM store_invites WHERE id = $1", [inv.id]);
    if (inv.role === "owner" && demote.rows[0].demote_previous) {
      await c.query(
        "UPDATE users SET role = 'staff', updated_at = now() WHERE store_id = $1 AND role = 'owner' AND id <> $2 AND NOT is_platform_admin AND deleted_at IS NULL",
        [inv.store_id, id]);
    }
    await c.query("UPDATE store_invites SET accepted_at = now(), accepted_user = $2 WHERE id = $1", [inv.id, id]);
    await c.query(`SELECT set_config('isura.store_id', '${Math.trunc(inv.store_id)}', true)`);
    await audit(id, inv.role === "owner" ? "business.owner_changed" : "user.joined", "user", id, { email: inv.email, role: inv.role }, c);
    return id;
  });
  await createSession(userId);
  return ok({ ok: true });
}));
