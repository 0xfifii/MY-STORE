import { z } from "zod";
import { handle, ok, readJson } from "@/lib/api";
import { requirePlatformAdmin } from "@/lib/auth";
import { getBusiness } from "@/lib/businesses";
import { AppError } from "@/lib/errors";
import { listLinks, setLinks } from "@/lib/transfers";

export const GET = handle(async () => {
  await requirePlatformAdmin();
  return ok({ links: await listLinks() });
});

const schema = z.object({ store_id: z.coerce.number().int().positive(), linked: z.array(z.coerce.number().int().positive()).max(200) });

/** Which businesses can send stock to each other (both ways). */
export const PUT = handle(async (req) => {
  const me = await requirePlatformAdmin();
  const b = schema.parse(await readJson(req));
  for (const id of [b.store_id, ...b.linked]) if (!(await getBusiness(id))) throw new AppError("NOT_FOUND", "Business not found.", 404);
  await setLinks(b.store_id, b.linked, me.id);
  return ok({ links: await listLinks() });
});
