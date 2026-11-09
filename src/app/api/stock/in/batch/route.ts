import { handle, ok, readJson } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { assertCategoryAllowed, assertDateAllowed, getItem, recordStockInBatch } from "@/lib/inventory";
import { stockInBatchSchema } from "@/lib/validation";

/** Several items received at once, saved together (all or nothing). */
export const POST = handle(async (req) => {
  const user = await requireApiUser("stock.in");
  const input = stockInBatchSchema.parse(await readJson(req));
  const ids = [...new Set(input.lines.map((l) => l.item_id))];
  for (const id of ids) await assertCategoryAllowed(id, user.allowed_category_ids);
  await assertDateAllowed(user, input.occurred_at, (await getSettings()).timezone);
  const txns = await recordStockInBatch(input, user.id);
  const items = (await Promise.all(ids.map((id) => getItem(id)))).filter(Boolean);
  return ok({ txns, items }, 201);
});
