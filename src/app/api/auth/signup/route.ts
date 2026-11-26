import { z } from "zod";
import { handle, ok, readJson } from "@/lib/api";
import { createSession, hashPassword } from "@/lib/auth";
import { withStore, withTransaction } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { passwordSchema } from "@/lib/validation";
import { signupSettings } from "@/lib/signup";

const schema = z.object({
  company_name: z.string().trim().min(2, "Enter your company or business name").max(120),
  name: z.string().trim().min(1, "Enter your name").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: passwordSchema,
});

/** Anyone can create an account: a new business (their company) with them as the owner, on a free trial. */
export const POST = handle(async (req) => {
  const input = schema.parse(await readJson(req));
  const s = await signupSettings();
  if (!s.allow) throw new AppError("SIGNUP_CLOSED", "New accounts can't be created right now. Please contact Palm Store.", 403);
  const hash = await hashPassword(input.password);

  const userId = await withStore(null, () => withTransaction(async (c) => {
    // A simple brake on automated sign-ups.
    const recent = await c.query("SELECT 1 FROM stores WHERE created_via = 'signup' AND created_at > now() - interval '1 hour'");
    if ((recent.rowCount ?? 0) >= 30) throw new AppError("TOO_MANY_SIGNUPS", "Too many new accounts right now. Please try again in a little while.", 429);
    const taken = await c.query("SELECT 1 FROM users WHERE lower(email) = $1 AND deleted_at IS NULL", [input.email]);
    if (taken.rowCount) throw new AppError("EMAIL_TAKEN", "An account with this email already exists. Sign in instead.", 409);

    const { rows: [store] } = await c.query<{ id: number }>(
      `INSERT INTO stores (name, price_kobo, interval_months, paid_until, billing_email, created_via, notes)
       VALUES ($1, $2, 1, now() + make_interval(days => $3), $4, 'signup', 'Signed up online')
       RETURNING id`,
      [input.company_name, s.priceKobo, s.trialDays, input.email],
    );
    // Everything else lives inside the new business.
    await c.query("SELECT set_config('isura.store_id', $1, true)", [String(store.id)]);
    await c.query("INSERT INTO settings (id, store_id, store_name) VALUES ($1, $2, $3)", [store.id, store.id, input.company_name]);
    const { rows: [user] } = await c.query<{ id: string }>(
      "INSERT INTO users (name, email, password_hash, role, store_id) VALUES ($1, $2, $3, 'owner', $4) RETURNING id",
      [input.name, input.email, hash, store.id],
    );
    await audit(user.id, "signup.account_created", "store", String(store.id), { company: input.company_name, email: input.email }, c);
    return user.id;
  }));

  await createSession(userId);
  return ok({ ok: true, trial_days: s.trialDays }, 201);
});
