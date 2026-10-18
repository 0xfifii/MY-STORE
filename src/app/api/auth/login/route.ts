import { z } from "zod";
import { handle, ok, readJson } from "@/lib/api";
import { createSession, isLoginThrottled, recordLoginAttempt, verifyPassword } from "@/lib/auth";
import { queryOne, query } from "@/lib/db";
import { AppError } from "@/lib/errors";

const schema = z.object({ email: z.string().trim().toLowerCase().min(1, "Enter your email"), password: z.string().min(1, "Enter your password") });

export const POST = handle(async (req) => {
  const { email, password } = schema.parse(await readJson(req));
  if (await isLoginThrottled(email)) {
    throw new AppError("THROTTLED", "Too many failed attempts. Wait 15 minutes and try again.", 429);
  }
  const user = await queryOne<{ id: string; password_hash: string; is_active: boolean }>(
    "SELECT id, password_hash, is_active FROM users WHERE lower(email) = $1",
    [email],
  );
  const valid = user ? await verifyPassword(password, user.password_hash) : false;
  await recordLoginAttempt(email, valid && !!user?.is_active);
  if (!user || !valid) throw new AppError("BAD_LOGIN", "Incorrect email or password.", 401);
  if (!user.is_active) throw new AppError("INACTIVE", "This account has been deactivated. Contact the store owner.", 403);
  await createSession(user.id);
  await query("UPDATE users SET last_login_at = now() WHERE id = $1", [user.id]);
  return ok();
});
