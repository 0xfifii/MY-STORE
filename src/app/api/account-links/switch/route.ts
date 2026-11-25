import { z } from "zod";
import { handle, ok, readJson } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { switchAccount } from "@/lib/account-links";

const schema = z.object({ user_id: z.string().uuid() });

/** Switch to a linked account: signs out of this one and into that one in one step. */
export const POST = handle(async (req) => {
  const me = await requireApiUser("view", { allowLocked: true });
  const { user_id } = schema.parse(await readJson(req));
  const to = await switchAccount(me, user_id);
  return ok({ name: to.name, business: to.business });
});
