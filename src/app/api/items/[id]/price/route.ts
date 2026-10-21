import { handle, ok, readJson } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { assertCategoryAllowed, changePrice, getItem } from "@/lib/inventory";
import { priceChangeSchema } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

/** Re-price the stock on hand. Value moves, quantity doesn't; recorded in the history as a price change. */
export const POST = handle<Ctx>(async (req, { params }) => {
  const user = await requireApiUser("price.edit");
  const { id } = await params;
  const input = priceChangeSchema.parse({ ...(await readJson(req) as object), item_id: id });
  await assertCategoryAllowed(id, user.allowed_category_ids);
  const txn = await changePrice(input, user.id);
  return ok({ txn, item: await getItem(id) }, 201);
});
