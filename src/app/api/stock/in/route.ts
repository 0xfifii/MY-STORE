import { handle, ok, readJson } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { assertCategoryAllowed, getItem, recordStockIn } from "@/lib/inventory";
import { stockInSchema } from "@/lib/validation";

export const POST = handle(async (req) => {
  const user = await requireApiUser("stock.in");
  const input = stockInSchema.parse(await readJson(req));
  await assertCategoryAllowed(input.item_id, user.allowed_category_ids);
  const txn = await recordStockIn(input, user.id);
  const item = await getItem(input.item_id);
  return ok({ txn, item }, 201);
});
