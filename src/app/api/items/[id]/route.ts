import { handle, ok, readJson } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { getItem, getItemUnits, updateItem } from "@/lib/inventory";
import { itemUpdateSchema } from "@/lib/validation";

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
  await updateItem(id, input, user.id);
  return ok();
});
