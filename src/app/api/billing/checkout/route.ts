import { z } from "zod";
import { handle, ok, readJson } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { startCheckout } from "@/lib/businesses";
import { AppError } from "@/lib/errors";

/** Owner starts paying for their subscription (works while the account is paused). */
export const POST = handle(async (req) => {
  const me = await requireApiUser("view", { allowLocked: true });
  if (me.role !== "owner") throw new AppError("FORBIDDEN", "Only the business owner can pay for the subscription.", 403);
  const { months } = z.object({ months: z.coerce.number().int().refine((m) => [1, 3, 6, 12].includes(m), "Choose 1, 3, 6 or 12 months") }).parse(await readJson(req));
  try {
    return ok(await startCheckout(me.store_id, months, me.email, me.id));
  } catch (e) {
    throw new AppError("PAYMENT_START_FAILED", (e as Error).message, 502);
  }
});
