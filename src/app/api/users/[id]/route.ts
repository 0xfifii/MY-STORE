import { handle, ok, readJson } from "@/lib/api";
import { hashPassword, requireApiUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { withTransaction } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { userUpdateSchema } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handle<Ctx>(async (req, { params }) => {
  const me = await requireApiUser("users.manage");
  const { id } = await params;
  const u = userUpdateSchema.parse(await readJson(req));
  await withTransaction(async (c) => {
    const cur = await c.query("SELECT id, role, is_active FROM users WHERE id = $1 FOR UPDATE", [id]);
    if (!cur.rowCount) throw new AppError("NOT_FOUND", "User not found.", 404);
    const demoting = (u.role && u.role !== "owner") || u.is_active === false;
    if (demoting && cur.rows[0].role === "owner") {
      const owners = await c.query("SELECT count(*)::int AS n FROM users WHERE role = 'owner' AND is_active AND id <> $1", [id]);
      if (owners.rows[0].n === 0) throw new AppError("LAST_OWNER", "There must always be at least one active owner.", 409);
    }
    await c.query(
      `UPDATE users SET name = coalesce($2, name), role = coalesce($3, role), is_active = coalesce($4, is_active),
              password_hash = coalesce($5, password_hash), updated_at = now() WHERE id = $1`,
      [id, u.name ?? null, u.role ?? null, u.is_active ?? null, u.password ? await hashPassword(u.password) : null],
    );
    // Deactivation or password reset signs the user out everywhere.
    if (u.is_active === false || u.password) await c.query("DELETE FROM sessions WHERE user_id = $1 AND $1 <> $2", [id, me.id]);
    await audit(me.id, "user.update", "user", id, { ...u, password: u.password ? "(changed)" : undefined }, c);
  });
  return ok();
});
