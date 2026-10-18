import { handle, ok, readJson } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { createItem, listItems } from "@/lib/inventory";
import { itemCreateSchema } from "@/lib/validation";

export const GET = handle(async (req) => {
  await requireApiUser("view");
  const sp = req.nextUrl.searchParams;
  const data = await listItems({
    q: sp.get("q") ?? undefined,
    category: sp.get("category") ? Number(sp.get("category")) : null,
    status: (sp.get("status") as "low" | "out" | "in_stock" | "attention" | null) || null,
    sort: (sp.get("sort") as "name") || "name",
    dir: sp.get("dir") === "desc" ? "desc" : "asc",
    page: Number(sp.get("page") ?? 1),
    pageSize: Number(sp.get("pageSize") ?? 20),
  });
  return ok(data);
});

export const POST = handle(async (req) => {
  const user = await requireApiUser("item.write");
  const input = itemCreateSchema.parse(await readJson(req));
  const res = await createItem(input, user.id);
  return ok(res, res.duplicate ? 200 : 201);
});
