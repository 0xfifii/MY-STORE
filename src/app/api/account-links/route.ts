import { z } from "zod";
import { handle, ok, readJson } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { linkAccount, linkedAccounts, unlinkAccount } from "@/lib/account-links";

// Linking works even when this business's subscription has ended, so the person can still reach their other accounts.
export const GET = handle(async () => {
  const me = await requireApiUser("view", { allowLocked: true });
  return ok({ accounts: await linkedAccounts(me.id) });
});

const linkSchema = z.object({
  email: z.string().trim().toLowerCase().min(1, "Enter the other account's email"),
  password: z.string().min(1, "Enter the other account's password"),
});

/** Link another account (its email and password prove it's yours). */
export const POST = handle(async (req) => {
  const me = await requireApiUser("view", { allowLocked: true });
  const b = linkSchema.parse(await readJson(req));
  return ok({ accounts: await linkAccount(me, b.email, b.password) });
});

const unlinkSchema = z.object({ user_id: z.string().uuid() });

export const DELETE = handle(async (req) => {
  const me = await requireApiUser("view", { allowLocked: true });
  const { user_id } = unlinkSchema.parse(await readJson(req));
  return ok({ accounts: await unlinkAccount(me, user_id) });
});
