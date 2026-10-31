import { handle, ok, readJson } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { assertCategoryAllowed, assertDateAllowed, getItem, recordStockOutBatch } from "@/lib/inventory";
import { stockOutBatchSchema } from "@/lib/validation";

/** Several items taken out by one worker, saved together (all or nothing). */
export const POST = handle(async (req) => {
  const user = await requireApiUser("stock.out");
  const input = stockOutBatchSchema.parse(await readJson(req));
  const ids = [...new Set(input.lines.map((l) => l.item_id))];
  for (const id of ids) await assertCategoryAllowed(id, user.allowed_category_ids);
  await assertDateAllowed(user, input.occurred_at, (await getSettings()).timezone);
  const txns = await recordStockOutBatch(input, user.id);
  const items = (await Promise.all(ids.map((id) => getItem(id)))).filter(Boolean);
  return ok({ txns, items }, 201);
});
