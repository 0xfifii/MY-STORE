import { z } from "zod";
import { handle, ok, readJson } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { queryOne } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { supplierSchema } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handle<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const body = await readJson(req);
  if (typeof body.archived === "boolean" && Object.keys(body).length === 1) {
    const user = await requireApiUser("item.archive");
    const row = await queryOne(
      `UPDATE suppliers SET archived_at = ${body.archived ? "now()" : "NULL"} WHERE id = $1 RETURNING id`,
      [Number(id)],
    );
    if (!row) throw new AppError("NOT_FOUND", "Supplier not found.", 404);
    await audit(user.id, body.archived ? "supplier.archive" : "supplier.restore", "supplier", id);
    return ok();
  }
  const user = await requireApiUser("catalog.write");
  const s = supplierSchema.extend({ archived: z.boolean().optional() }).parse(body);
  const row = await queryOne(
    `UPDATE suppliers SET name=$2, contact_person=$3, phone=$4, email=$5, address=$6, notes=$7 WHERE id=$1 RETURNING id`,
    [Number(id), s.name, s.contact_person, s.phone, s.email, s.address, s.notes],
  );
  if (!row) throw new AppError("NOT_FOUND", "Supplier not found.", 404);
  await audit(user.id, "supplier.update", "supplier", id, { name: s.name });
  return ok();
});
