import { NextResponse } from "next/server";
import { handle, ok } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { query, queryOne } from "@/lib/db";
import { AppError } from "@/lib/errors";

type Ctx = { params: Promise<{ id: string }> };
const UUID = /^[0-9a-f-]{36}$/i;
const TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX = 1_500_000; // the browser shrinks photos before upload, so real ones are far smaller

/** The item's photo (cached; the URL carries ?v=<last change> so a new photo shows straight away). */
export const GET = handle<Ctx>(async (_req, { params }) => {
  await requireApiUser("view");
  const { id } = await params;
  if (!UUID.test(id)) throw new AppError("NOT_FOUND", "Not found.", 404);
  const row = await queryOne<{ photo: Buffer | null; photo_type: string | null }>("SELECT photo, photo_type FROM items WHERE id = $1", [id]);
  if (!row?.photo) throw new AppError("NOT_FOUND", "No photo.", 404);
  return new NextResponse(new Uint8Array(row.photo), {
    headers: { "content-type": row.photo_type ?? "image/jpeg", "cache-control": "private, max-age=31536000, immutable" },
  });
});

/** Upload or replace the photo: the request body is the image itself. */
export const PUT = handle<Ctx>(async (req, { params }) => {
  const user = await requireApiUser("item.write");
  const { id } = await params;
  if (!UUID.test(id)) throw new AppError("NOT_FOUND", "Item not found.", 404);
  const type = (req.headers.get("content-type") ?? "").split(";")[0].trim();
  if (!TYPES.includes(type)) throw new AppError("BAD_IMAGE", "Use a JPG, PNG or WebP photo.", 415);
  const buf = Buffer.from(await req.arrayBuffer());
  if (!buf.length) throw new AppError("BAD_IMAGE", "The photo is empty.", 400);
  if (buf.length > MAX) throw new AppError("TOO_LARGE", "That photo is too large. Try a smaller one.", 413);
  const rows = await query("UPDATE items SET photo = $2, photo_type = $3, photo_updated_at = now() WHERE id = $1 RETURNING id", [id, buf, type]);
  if (!rows.length) throw new AppError("NOT_FOUND", "Item not found.", 404);
  await audit(user.id, "item.photo", "item", id, { bytes: buf.length });
  return ok();
});

export const DELETE = handle<Ctx>(async (_req, { params }) => {
  const user = await requireApiUser("item.write");
  const { id } = await params;
  if (!UUID.test(id)) throw new AppError("NOT_FOUND", "Item not found.", 404);
  await query("UPDATE items SET photo = NULL, photo_type = NULL, photo_updated_at = now() WHERE id = $1", [id]);
  await audit(user.id, "item.photo.remove", "item", id, {});
  return ok();
});
