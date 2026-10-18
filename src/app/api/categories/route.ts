import { handle, ok, readJson } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { listCategories } from "@/lib/catalog";
import { queryOne } from "@/lib/db";
import { categorySchema } from "@/lib/validation";

export const GET = handle(async () => {
  await requireApiUser("view");
  return ok({ categories: await listCategories() });
});

export const POST = handle(async (req) => {
  const user = await requireApiUser("catalog.write");
  const input = categorySchema.parse(await readJson(req));
  const row = await queryOne<{ id: number; name: string }>(
    "INSERT INTO categories (name, description) VALUES ($1, $2) RETURNING id, name",
    [input.name, input.description],
  );
  await audit(user.id, "category.create", "category", row!.id, { name: input.name });
  return ok({ category: row }, 201);
});
