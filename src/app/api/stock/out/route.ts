import { handle, ok, readJson } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { getItem, recordStockOut } from "@/lib/inventory";
import { stockOutSchema } from "@/lib/validation";

export const POST = handle(async (req) => {
  const user = await requireApiUser("stock.move");
  const input = stockOutSchema.parse(await readJson(req));
  const txn = await recordStockOut(input, user.id);
  const item = await getItem(input.item_id);
  return ok({ txn, item }, 201);
});
