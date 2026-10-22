import { handle, ok, readJson } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { deleteItem, getItem, getItemUnits, updateItem } from "@/lib/inventory";
import { itemUpdateSchema } from "@/lib/validation";
import { can } from "@/lib/permissions";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle<Ctx>(async (_req, { params }) => {
  await requireApiUser("view");
  const { id } = await params;
  const item = await getItem(id);
  if (!item) throw new AppError("ITEM_NOT_FOUND", "Item not found.", 404);
  return ok({ item, units: await getItemUnits(id) });
});

export const PATCH = handle<Ctx>(async (req, { params }) => {
  const user = await requireApiUser("item.write");
  const { id } = await params;
  const input = itemUpdateSchema.parse(await readJson(req));
  await updateItem(id, { ...input, can_change_price: can(user, "price.edit") }, user.id);
  return ok();
});

export const DELETE = handle<Ctx>(async (_req, { params }) => {
  const user = await requireApiUser("item.delete");
  const { id } = await params;
  return ok(await deleteItem(id, user.id));
});
