import { z } from "zod";
import { handle, ok, readJson } from "@/lib/api";
import { requirePlatformAdmin } from "@/lib/auth";
import { query, queryOne, withStore } from "@/lib/db";
import { signupSettings } from "@/lib/signup";

/** Paystack secret key (never sent back; only whether one is saved and if it's a test key). */
export const GET = handle(async () => {
  await requirePlatformAdmin();
  const r = await withStore(null, () => queryOne<{ k: string | null }>("SELECT paystack_secret_key AS k FROM platform_settings WHERE id = 1"));
  const k = r?.k || process.env.PAYSTACK_SECRET_KEY || "";
  return ok({ paystack: k ? { saved: true, mode: k.startsWith("sk_live_") ? "live" : "test", ending: k.slice(-4) } : { saved: false }, signup: await signupSettings() });
});

/** Sign-up settings: open or closed, free trial length, monthly price for new sign-ups. */
export const PATCH = handle(async (req) => {
  await requirePlatformAdmin();
  const v = z.object({
    allow_signup: z.boolean(),
    trial_days: z.coerce.number().int().min(0).max(365),
    price_naira: z.coerce.number().min(0).max(100_000_000),
  }).parse(await readJson(req));
  await withStore(null, () => query(
    "UPDATE platform_settings SET allow_signup = $1, signup_trial_days = $2, signup_price_kobo = $3, updated_at = now() WHERE id = 1",
    [v.allow_signup, v.trial_days, Math.round(v.price_naira * 100)],
  ));
  return ok();
});

export const PUT = handle(async (req) => {
  await requirePlatformAdmin();
  const { paystack_secret_key } = z.object({
    paystack_secret_key: z.string().trim().regex(/^sk_(test|live)_[A-Za-z0-9]{10,}$/, "That doesn't look like a Paystack secret key (it starts with sk_test_ or sk_live_).").or(z.literal("")),
  }).parse(await readJson(req));
  await withStore(null, () => query("UPDATE platform_settings SET paystack_secret_key = nullif($1, ''), updated_at = now() WHERE id = 1", [paystack_secret_key]));
  return ok();
});
