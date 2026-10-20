import Link from "next/link";
import { Archive, Clock } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/ui/primitives";
import { GenerateNow } from "@/components/generate-now";
import { Pagination } from "@/components/list-filters";
import { requirePageUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { listHistory } from "@/lib/reports/history";
import { getSettings } from "@/lib/settings";
import { smtpConfigured } from "@/lib/mailer";
import { formatDate, formatDateTime } from "@/lib/format";

export const metadata = { title: "Report History" };

const DELIVERY: Record<string, string> = {
  not_configured: "Email not set up",
  not_requested: "Not emailed",
  sent: "Emailed",
  failed: "Email failed",
};

export default async function ReportHistoryPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user = await requirePageUser("view");
  const { page: p } = await searchParams;
  const page = Math.max(1, Number(p ?? 1) || 1);
  const s = await getSettings();
  const { rows, total } = await listHistory(30, (page - 1) * 30);

  return (
    <div>
      <PageHeader title="Report History"
                description="Saved and automatically generated reports. Each file is kept exactly as it was generated."
        actions={can(user, "report.generate") ? <GenerateNow /> : undefined} />

      <div className="mb-4 flex items-start gap-3 glass rounded-[var(--radius-card)] px-4 py-3 text-sm">
        <Clock className="mt-0.5 size-5 shrink-0 text-burgundy" />
        {s.auto_report_enabled || s.auto_weekly_enabled || s.auto_monthly_enabled ? (
          <p>
            Automatic reports are <strong>on</strong>:{" "}
            {[s.auto_report_enabled && `daily (${s.auto_report_covers === "previous_day" ? "previous day" : "same day"})`,
              s.auto_weekly_enabled && "weekly (Mondays, previous week)",
              s.auto_monthly_enabled && "monthly (1st, previous month)"].filter(Boolean).join(", ")}
            , generated after {s.auto_report_time.slice(0, 5)} ({s.timezone}) as {s.auto_report_formats.map((f) => f.toUpperCase()).join(", ")}.
            {s.email_enabled && ((await smtpConfigured()) ? ` Emailed to ${s.email_recipients.join(", ")}.` : " Email is switched on but the mail server isn't configured, so nothing is emailed.")}
            {can(user, "settings.write") && <> <Link href="/settings" className="font-semibold text-burgundy hover:underline">Change</Link></>}
          </p>
        ) : (
          <p>
            Automatic reports are <strong>off</strong>.{" "}
            {can(user, "settings.write") ? <Link href="/settings" className="font-semibold text-burgundy hover:underline">Turn them on in Store Settings</Link> : "The owner can turn them on in Store Settings."}
          </p>
        )}
      </div>

      <div className="glass overflow-hidden rounded-[var(--radius-card)]">
        {rows.length === 0 ? (
          <EmptyState icon={<Archive className="size-6" />} title="No saved reports yet" body="Generate a report now, or turn on automatic daily reports in Store Settings." />
        ) : (
          <ul className="divide-y divide-white/80">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:px-5">
                <span className={`w-12 shrink-0 rounded px-1.5 py-0.5 text-center text-xs font-bold ${r.format === "pdf" ? "bg-rose text-burgundy" : r.format === "xlsx" ? "bg-ok-bg text-ok" : "bg-canvas text-muted ring-1 ring-line"}`}>
                  {r.format.toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {r.title} · {r.period_start === r.period_end ? formatDate(r.period_start) : `${formatDate(r.period_start)} – ${formatDate(r.period_end)}`}
                  </p>
                  <p className="text-xs text-muted">
                    {r.trigger === "scheduled" ? "Automatic" : `Manual${r.generated_by_name ? ` by ${r.generated_by_name}` : ""}`} · {formatDateTime(r.created_at, s.timezone)}
                    {r.size_bytes ? ` · ${(r.size_bytes / 1024).toFixed(0)} KB` : ""}
                    {r.trigger === "scheduled" ? ` · ${DELIVERY[r.delivery_status] ?? r.delivery_status}` : ""}
                  </p>
                  {r.delivery_status === "failed" && r.delivery_detail && <p className="text-xs text-bad">{r.delivery_detail}</p>}
                  {r.status === "failed" && <p className="text-xs text-bad">Generation failed: {r.error}</p>}
                </div>
                {r.status === "success" ? (
                  <a href={`/api/reports/history/${r.id}`} className="inline-flex h-9 items-center justify-center rounded-md border border-line px-3 text-sm font-semibold hover:bg-rose">Download</a>
                ) : (
                  <span className="rounded-full bg-bad-bg px-2.5 py-0.5 text-xs font-semibold text-bad">Failed</span>
                )}
              </li>
            ))}
          </ul>
        )}
        <div className="border-t border-white/80">
          <Pagination page={page} pages={Math.max(1, Math.ceil(total / 30))} total={total} label="files" />
        </div>
      </div>
    </div>
  );
}
