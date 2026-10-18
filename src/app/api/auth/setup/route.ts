import { z } from "zod";
import { handle, ok, readJson } from "@/lib/api";
import { createSession, hashPassword } from "@/lib/auth";
import { withTransaction } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { passwordSchema } from "@/lib/validation";

const schema = z.object({
  name: z.string().trim().min(1, "Enter your name").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: passwordSchema,
  store_name: z.string().trim().min(1).max(120).optional(),
});

/** First-run only: creates the owner account. Refuses once any user exists. */
export const POST = handle(async (req) => {
  const input = schema.parse(await readJson(req));
  const hash = await hashPassword(input.password);
  const id = await withTransaction(async (c) => {
    await c.query("LOCK TABLE users IN EXCLUSIVE MODE");
    const n = await c.query("SELECT 1 FROM users LIMIT 1");
    if (n.rowCount) throw new AppError("SETUP_DONE", "Setup has already been completed. Please sign in.", 409);
    const { rows } = await c.query<{ id: string }>(
      "INSERT INTO users (name, email, password_hash, role) VALUES ($1,$2,$3,'owner') RETURNING id",
      [input.name, input.email, hash],
    );
    if (input.store_name) await c.query("UPDATE settings SET store_name = $1, updated_at = now()", [input.store_name]);
    await audit(rows[0].id, "setup.owner_created", "user", rows[0].id, { email: input.email }, c);
    return rows[0].id;
  });
  await createSession(id);
  return ok({ ok: true }, 201);
});
