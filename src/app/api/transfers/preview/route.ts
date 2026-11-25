import { z } from "zod";
import { handle, ok, readJson } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { previewTransfer } from "@/lib/transfers";

const schema = z.object({ to_store: z.coerce.number().int().positive(), item_ids: z.array(z.string().uuid()).min(1).max(50) });

/** What each item will become in the other account: added to an item that's there, or a new item. */
export const POST = handle(async (req) => {
  const user = await requireApiUser("stock.out");
  const { to_store, item_ids } = schema.parse(await readJson(req));
  return ok(await previewTransfer(user, to_store, item_ids));
});
