import "server-only";
import type { ReportData, ReportParams } from "./engine";
import { buildReport, reportFileName } from "./engine";
import { reportToCsv } from "./csv";
import { reportToXlsx } from "./xlsx";
import { reportToPdf } from "./pdf";
import type { StoreSettings } from "../settings";

export type ReportFormat = "pdf" | "xlsx" | "csv";

export const MIME: Record<ReportFormat, string> = {
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv; charset=utf-8",
};

export async function renderReport(data: ReportData, format: ReportFormat): Promise<Buffer> {
  if (format === "csv") return reportToCsv(data);
  if (format === "xlsx") return reportToXlsx(data);
  return reportToPdf(data);
}

export async function buildAndRender(params: ReportParams, format: ReportFormat, settings?: StoreSettings) {
  const data = await buildReport(params, settings);
  const content = await renderReport(data, format);
  return { data, content, fileName: reportFileName(params, format), mime: MIME[format] };
}
