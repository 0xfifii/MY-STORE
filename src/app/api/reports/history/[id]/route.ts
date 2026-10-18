import { handle } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { getHistoryFile } from "@/lib/reports/history";
import { MIME } from "@/lib/reports/render";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle<Ctx>(async (_req, { params }) => {
  await requireApiUser("view");
  const { id } = await params;
  const f = await getHistoryFile(id);
  if (!f || f.status !== "success" || !f.content) throw new AppError("NOT_FOUND", "Report file not found.", 404);
  return new Response(new Uint8Array(f.content), {
    headers: {
      "Content-Type": MIME[f.format],
      "Content-Disposition": `attachment; filename="${f.file_name}"`,
      "Cache-Control": "private, max-age=0",
    },
  });
});
