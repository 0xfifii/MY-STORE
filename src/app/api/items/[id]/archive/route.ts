import { z } from "zod";
import { handle, ok, readJson } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { setItemArchived } from "@/lib/inventory";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handle<Ctx>(async (req, { params }) => {
  const user = await requireApiUser("item.archive");
  const { id } = await params;
  const { archived } = z.object({ archived: z.boolean() }).parse(await readJson(req));
  await setItemArchived(id, archived, user.id);
  return ok();
});
