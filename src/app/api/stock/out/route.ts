import { handle, ok, readJson } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { assertCategoryAllowed, getItem, recordStockOut } from "@/lib/inventory";
import { stockOutSchema } from "@/lib/validation";

export const POST = handle(async (req) => {
  const user = await requireApiUser("stock.out");
  const input = stockOutSchema.parse(await readJson(req));
  await assertCategoryAllowed(input.item_id, user.allowed_category_ids);
  const txn = await recordStockOut(input, user.id);
  const item = await getItem(input.item_id);
  return ok({ txn, item }, 201);
});
