import { randomUUID } from "node:crypto";
import { z } from "zod";
import { handle, ok, readJson } from "@/lib/api";
import { requirePlatformAdmin } from "@/lib/auth";
import { applyPayment, getBusiness } from "@/lib/businesses";
import { AppError } from "@/lib/errors";

type Ctx = { params: Promise<{ id: string }> };
const schema = z.object({ months: z.coerce.number().int().min(1).max(36), amount_naira: z.coerce.number().min(0).default(0), note: z.string().max(300).optional() });

/** Record a payment made outside the app (bank transfer, cash) or a free extension. */
export const POST = handle<Ctx>(async (req, { params }) => {
  const me = await requirePlatformAdmin();
  const id = Number((await params).id);
  if (!(await getBusiness(id))) throw new AppError("NOT_FOUND", "Business not found.", 404);
  const b = schema.parse(await readJson(req));
  const until = await applyPayment({ storeId: id, reference: `manual-${randomUUID()}`, amountKobo: Math.round(b.amount_naira * 100), months: b.months, method: "manual", by: me.id, raw: { note: b.note ?? null } });
  return ok({ paid_until: until, business: await getBusiness(id) });
});
