import { z } from "zod";
import { cookies } from "next/headers";
import { handle, ok, readJson } from "@/lib/api";
import { requirePlatformAdmin } from "@/lib/auth";
import { getBusiness } from "@/lib/businesses";
import { SESSION_COOKIE, forgetSessionStore, hashToken, query, withStore } from "@/lib/db";
import { AppError } from "@/lib/errors";

/** The ÌṢÚRA admin switches which business they are looking at (for support). */
export const POST = handle(async (req) => {
  await requirePlatformAdmin();
  const { store_id } = z.object({ store_id: z.coerce.number().int().positive() }).parse(await readJson(req));
  if (!(await getBusiness(store_id))) throw new AppError("NOT_FOUND", "Business not found.", 404);
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) throw new AppError("UNAUTHENTICATED", "Please sign in again.", 401);
  await withStore(null, () => query("UPDATE sessions SET active_store_id = $2 WHERE token_hash = $1", [hashToken(token), store_id]));
  forgetSessionStore(hashToken(token));
  return ok();
});
