import { handle, ok, readJson } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { assertCategoryAllowed, getItem } from "@/lib/inventory";
import { listTransfers, recordTransfer, transferSchema, transferTargets } from "@/lib/transfers";

/** Accounts you can send to, and the transfers this account has sent or received. */
export const GET = handle(async () => {
  const user = await requireApiUser("stock.out");
  const [targets, transfers] = await Promise.all([transferTargets(user), listTransfers()]);
  return ok({ targets, transfers, store_id: user.store_id });
});

/** Send stock to another account: out of this one and into the other, together. */
export const POST = handle(async (req) => {
  const user = await requireApiUser("stock.out");
  const input = transferSchema.parse(await readJson(req));
  const ids = [...new Set(input.lines.map((l) => l.item_id))];
  for (const id of ids) await assertCategoryAllowed(id, user.allowed_category_ids);
  const transfer = await recordTransfer(user, input);
  const items = (await Promise.all(ids.map((id) => getItem(id)))).filter(Boolean);
  return ok({ transfer, items }, 201);
});
