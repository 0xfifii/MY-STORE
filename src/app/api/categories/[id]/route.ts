import { z } from "zod";
import { handle, ok, readJson } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { queryOne } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { categorySchema } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };
const schema = categorySchema.partial().extend({ archived: z.boolean().optional() });

export const PATCH = handle<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const input = schema.parse(await readJson(req));
  const user = await requireApiUser(input.archived !== undefined ? "item.archive" : "catalog.write");
  const row = await queryOne(
    `UPDATE categories SET name = coalesce($2, name), description = CASE WHEN $3::boolean THEN $4 ELSE description END,
            archived_at = CASE WHEN $5::boolean IS NULL THEN archived_at WHEN $5 THEN now() ELSE NULL END
      WHERE id = $1 RETURNING id`,
    [Number(id), input.name ?? null, input.description !== undefined, input.description ?? null, input.archived ?? null],
  );
  if (!row) throw new AppError("NOT_FOUND", "Category not found.", 404);
  await audit(user.id, "category.update", "category", id, input);
  return ok();
});
