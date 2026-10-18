import { handle, ok, readJson } from "@/lib/api";
import { hashPassword, requireApiUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { query, queryOne } from "@/lib/db";
import { userCreateSchema } from "@/lib/validation";

export const GET = handle(async () => {
  await requireApiUser("users.manage");
  const users = await query(
    "SELECT id, name, email, role, is_active, created_at, last_login_at FROM users ORDER BY created_at",
  );
  return ok({ users });
});

export const POST = handle(async (req) => {
  const me = await requireApiUser("users.manage");
  const u = userCreateSchema.parse(await readJson(req));
  const row = await queryOne<{ id: string }>(
    "INSERT INTO users (name, email, password_hash, role) VALUES ($1,$2,$3,$4) RETURNING id",
    [u.name, u.email, await hashPassword(u.password), u.role],
  );
  await audit(me.id, "user.create", "user", row!.id, { email: u.email, role: u.role });
  return ok({ id: row!.id }, 201);
});
