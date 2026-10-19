import { handle, ok, readJson } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { queryOne } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { workerSchema } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handle<Ctx>(async (req, { params }) => {
  const user = await requireApiUser("workers.manage");
  const { id } = await params;
  const body = await readJson(req);
  if (typeof body.archived === "boolean" && Object.keys(body).length === 1) {
    const row = await queryOne(`UPDATE workers SET archived_at = ${body.archived ? "now()" : "NULL"} WHERE id = $1 RETURNING id`, [Number(id)]);
    if (!row) throw new AppError("NOT_FOUND", "Worker not found.", 404);
    await audit(user.id, body.archived ? "worker.archive" : "worker.restore", "worker", id);
    return ok();
  }
  const w = workerSchema.parse(body);
  const row = await queryOne("UPDATE workers SET name=$2, department=$3, phone=$4, notes=$5 WHERE id=$1 RETURNING id", [Number(id), w.name, w.department, w.phone, w.notes]);
  if (!row) throw new AppError("NOT_FOUND", "Worker not found.", 404);
  await audit(user.id, "worker.update", "worker", id, { name: w.name });
  return ok();
});
