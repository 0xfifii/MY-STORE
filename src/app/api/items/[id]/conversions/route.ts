import { z } from "zod";
import { handle, ok, readJson } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { deleteItemConversion, getItemConversions, upsertItemConversion } from "@/lib/inventory";
import { conversionInput } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle<Ctx>(async (_req, { params }) => {
  await requireApiUser("view");
  const { id } = await params;
  return ok({ conversions: await getItemConversions(id) });
});

export const POST = handle<Ctx>(async (req, { params }) => {
  const user = await requireApiUser("item.write");
  const { id } = await params;
  const input = conversionInput.parse(await readJson(req));
  await upsertItemConversion(id, input.unit_id, input.factor, user.id);
  return ok();
});

export const DELETE = handle<Ctx>(async (req, { params }) => {
  const user = await requireApiUser("item.write");
  const { id } = await params;
  const { conversion_id } = z.object({ conversion_id: z.coerce.number().int().positive() }).parse(await readJson(req));
  await deleteItemConversion(id, conversion_id, user.id);
  return ok();
});
