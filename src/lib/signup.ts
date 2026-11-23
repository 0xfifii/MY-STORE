import "server-only";
import { queryOne, withStore } from "./db";

export type SignupSettings = { allow: boolean; trialDays: number; priceKobo: number };

export async function signupSettings(): Promise<SignupSettings> {
  const r = await withStore(null, () => queryOne<{ allow_signup: boolean; signup_trial_days: number; signup_price_kobo: string }>(
    "SELECT allow_signup, signup_trial_days, signup_price_kobo::text FROM platform_settings WHERE id = 1",
  ));
  return { allow: r?.allow_signup ?? true, trialDays: r?.signup_trial_days ?? 14, priceKobo: Number(r?.signup_price_kobo ?? 0) };
}
