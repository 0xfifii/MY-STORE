import { z } from "zod";
import { handle, ok, readJson } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { decideCount } from "@/lib/counts";

type Ctx = { params: Promise<{ id: string }> };

/** Approve (posts the shortage / excess) or reject a pending count. */
export const POST = handle<Ctx>(async (req, { params }) => {
  const user = await requireApiUser("count.approve");
  const b = z.object({ decision: z.enum(["approve", "reject"]), note: z.string().trim().max(500).optional().nullable() }).parse(await readJson(req));
  return ok(await decideCount((await params).id, b.decision === "approve", b.note || null, user.id));
});
