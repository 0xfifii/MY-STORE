import { z } from "zod";
import { handle, ok, readJson } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { assertCategoryAllowed } from "@/lib/inventory";
import { recordCount } from "@/lib/counts";
import { qtyString, uuid } from "@/lib/validation";

const schema = z.object({
  item_id: uuid,
  counted_qty: qtyString,
  notes: z.string().trim().max(500).optional().nullable(),
});

/** Record a physical count (base unit of the item). */
export const POST = handle(async (req) => {
  const user = await requireApiUser("stock.count");
  const b = schema.parse(await readJson(req));
  await assertCategoryAllowed(b.item_id, user.allowed_category_ids);
  return ok(await recordCount(b.item_id, b.counted_qty, b.notes || null, user.id), 201);
});
