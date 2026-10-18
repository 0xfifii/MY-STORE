import { handle } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { normaliseParams } from "@/lib/reports/engine";
import { buildAndRender, type ReportFormat } from "@/lib/reports/render";
import { getSettings } from "@/lib/settings";

export const runtime = "nodejs";

/** Direct download of a report built from live ledger data with the chosen filters. */
export const GET = handle(async (req) => {
  await requireApiUser("view");
  const sp = req.nextUrl.searchParams;
  const format = (sp.get("format") ?? "pdf") as ReportFormat;
  if (!["pdf", "xlsx", "csv"].includes(format)) throw new AppError("BAD_FORMAT", "Unknown format.");
  const settings = await getSettings();
  const params = normaliseParams(Object.fromEntries(sp.entries()), settings.timezone);
  const { content, fileName, mime } = await buildAndRender(params, format, settings);
  return new Response(new Uint8Array(content), {
    headers: {
      "Content-Type": mime,
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Content-Length": String(content.length),
      "Cache-Control": "no-store",
    },
  });
});
