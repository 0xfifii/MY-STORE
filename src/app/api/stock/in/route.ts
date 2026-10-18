import { handle, ok, readJson } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { getItem, recordStockIn } from "@/lib/inventory";
import { stockInSchema } from "@/lib/validation";

export const POST = handle(async (req) => {
  const user = await requireApiUser("stock.move");
  const input = stockInSchema.parse(await readJson(req));
  const txn = await recordStockIn(input, user.id);
  const item = await getItem(input.item_id);
  return ok({ txn, item }, 201);
});
