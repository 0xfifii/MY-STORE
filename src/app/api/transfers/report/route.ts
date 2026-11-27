import { handle, ok } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { can } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";
import {
  buildTransferReport, transferFileName, transferParams, transferReportCsv, transferReportPdf, transferReportXlsx,
} from "@/lib/reports/transfers";

export const runtime = "nodejs";

/**
 * Transfer report for the account you're in: items sent to and received from other accounts.
 * ?preset=today|yesterday|week|month|last_month or ?from=&to=, ?direction=all|sent|received, ?format=json|pdf|xlsx|csv
 */
export const GET = handle(async (req) => {
  const user = await requireApiUser("view");
  if (!can(user, "stock.out") && !can(user, "page.reports")) throw new AppError("FORBIDDEN", "You don't have access to transfer reports.", 403);
  const sp = req.nextUrl.searchParams;
  const settings = await getSettings();
  const report = await buildTransferReport(transferParams(sp, settings.timezone), settings, user.store_id);
  const format = sp.get("format") ?? "json";
  if (format === "json") return ok({ report });
  const out =
    format === "pdf" ? { body: await transferReportPdf(report, settings), mime: "application/pdf", ext: "pdf" }
    : format === "xlsx" ? { body: await transferReportXlsx(report, settings), mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ext: "xlsx" }
    : format === "csv" ? { body: transferReportCsv(report, settings), mime: "text/csv; charset=utf-8", ext: "csv" }
    : null;
  if (!out) throw new AppError("BAD_FORMAT", "Unknown format.");
  return new Response(new Uint8Array(out.body), {
    headers: {
      "Content-Type": out.mime,
      "Content-Disposition": `attachment; filename="${transferFileName(report, out.ext)}"`,
      "Content-Length": String(out.body.length),
      "Cache-Control": "no-store",
    },
  });
});
