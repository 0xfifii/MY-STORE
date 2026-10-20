import { handle } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { auditFileName, auditReportPdf, auditReportXlsx, buildAuditReport } from "@/lib/audit-report";

/** Monthly audit report: ?month=YYYY-MM&format=pdf|xlsx */
export const GET = handle(async (req) => {
  const user = await requireApiUser("audit.view");
  const sp = req.nextUrl.searchParams;
  const month = sp.get("month") ?? "";
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new AppError("BAD_MONTH", "Choose a month (YYYY-MM).");
  const format = sp.get("format") === "xlsx" ? "xlsx" : "pdf";
  const data = await buildAuditReport(month, user.name);
  const body = format === "pdf" ? await auditReportPdf(data) : await auditReportXlsx(data);
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${auditFileName(month, format)}"`,
      "Cache-Control": "no-store",
    },
  });
});
