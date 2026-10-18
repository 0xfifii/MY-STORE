import "server-only";
import { query, queryOne } from "../db";
import { addDays, formatMoney, todayIn } from "../format";
import { getSettings, type StoreSettings } from "../settings";
import { sendMail, smtpConfigured } from "../mailer";
import { periodTypeOf, titleFor, weekStart, type ReportParams } from "./engine";
import { buildAndRender, type ReportFormat } from "./render";

export type HistoryRow = {
  id: string;
  title: string;
  report_kind: string;
  period_start: string;
  period_end: string;
  format: ReportFormat;
  file_name: string | null;
  size_bytes: number | null;
  status: "success" | "failed";
  error: string | null;
  trigger: "manual" | "scheduled";
  delivery_status: string;
  delivery_detail: string | null;
  generated_by_name: string | null;
  created_at: string;
};

export async function listHistory(limit = 50, offset = 0) {
  const rows = await query<HistoryRow>(
    `SELECT r.id::text, r.title, r.report_kind, to_char(r.period_start,'YYYY-MM-DD') AS period_start,
            to_char(r.period_end,'YYYY-MM-DD') AS period_end, r.format, r.file_name, r.size_bytes, r.status, r.error,
            r.trigger, r.delivery_status, r.delivery_detail, u.name AS generated_by_name, r.created_at
       FROM generated_reports r LEFT JOIN users u ON u.id = r.generated_by
      ORDER BY r.created_at DESC, r.id DESC LIMIT $1 OFFSET $2`,
    [limit, offset],
  );
  const total = await queryOne<{ n: number }>("SELECT count(*)::int AS n FROM generated_reports");
  return { rows, total: total?.n ?? 0 };
}

export async function getHistoryFile(id: string) {
  if (!/^\d+$/.test(id)) return null;
  return queryOne<{ file_name: string; format: ReportFormat; content: Buffer | null; status: string }>(
    "SELECT file_name, format, content, status FROM generated_reports WHERE id = $1",
    [id],
  );
}

/** Generate a report, store it in Report History and return the row id. */
export async function generateAndStore(
  params: ReportParams,
  format: ReportFormat,
  opts: { trigger: "manual" | "scheduled"; userId?: string | null; settings?: StoreSettings },
) {
  const periodType = periodTypeOf(params.from, params.to);
  const title = titleFor(params.kind, periodType);
  try {
    const { content, fileName } = await buildAndRender(params, format, opts.settings);
    const row = await queryOne<{ id: string }>(
      `INSERT INTO generated_reports (title, report_kind, period_start, period_end, filters, format, file_name, content,
                                      size_bytes, status, trigger, generated_by, period_type)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'success',$10,$11,$12)
       ON CONFLICT DO NOTHING
       RETURNING id::text`,
      [title, params.kind, params.from, params.to,
       JSON.stringify({ item: params.itemId ?? null, category: params.categoryId ?? null }),
       format, fileName, content, content.length, opts.trigger, opts.userId ?? null, periodType],
    );
    return { ok: true as const, id: row?.id ?? null, fileName, content, skipped: !row };
  } catch (e) {
    const msg = (e as Error).message?.slice(0, 500) ?? "Unknown error";
    console.error("Report generation failed", e);
    const row = await queryOne<{ id: string }>(
      `INSERT INTO generated_reports (title, report_kind, period_start, period_end, filters, format, status, error, trigger, generated_by, period_type)
       VALUES ($1,$2,$3,$4,'{}',$5,'failed',$6,$7,$8,$9) RETURNING id::text`,
      [title, params.kind, params.from, params.to, format, msg, opts.trigger, opts.userId ?? null, periodType],
    );
    return { ok: false as const, id: row?.id ?? null, error: msg };
  }
}

/**
 * Called by the cron endpoint (every 15–60 minutes). Once the configured local time has passed it
 * generates, at most once each per format:
 *   - the daily report (previous day or same day, per settings)
 *   - the weekly report for the last complete week (Mon–Sun), if switched on
 *   - the monthly report for the last complete month, if switched on
 * Safe to call repeatedly or late: missed runs catch up on the next call.
 */
export async function runScheduledReports(now = new Date()) {
  const settings = await getSettings();
  const anyOn = settings.auto_report_enabled || settings.auto_weekly_enabled || settings.auto_monthly_enabled;
  if (!anyOn) return { status: "disabled" as const, generated: [] as string[] };

  const tz = settings.timezone;
  const localTime = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
  const due = settings.auto_report_time.slice(0, 5);
  const today = todayIn(tz, now);
  if (localTime < due) return { status: "not_due" as const, localTime, due, generated: [] as string[] };

  const periods: { type: "day" | "week" | "month"; params: ReportParams }[] = [];
  if (settings.auto_report_enabled) {
    const day = settings.auto_report_covers === "previous_day" ? addDays(today, -1) : today;
    periods.push({ type: "day", params: { from: day, to: day, kind: "full" } });
  }
  if (settings.auto_weekly_enabled) {
    const from = addDays(weekStart(today), -7);
    periods.push({ type: "week", params: { from, to: addDays(from, 6), kind: "full" } });
  }
  if (settings.auto_monthly_enabled) {
    const lastOfPrev = addDays(today.slice(0, 8) + "01", -1);
    periods.push({ type: "month", params: { from: lastOfPrev.slice(0, 8) + "01", to: lastOfPrev, kind: "full" } });
  }

  const generated: { id: string; fileName: string; content: Buffer; format: ReportFormat; type: string }[] = [];
  const failed: string[] = [];
  for (const p of periods) {
    for (const format of settings.auto_report_formats) {
      const exists = await queryOne(
        "SELECT 1 FROM generated_reports WHERE trigger='scheduled' AND status='success' AND period_type=$1 AND period_start=$2 AND format=$3",
        [p.type, p.params.from, format],
      );
      if (exists) continue;
      const res = await generateAndStore(p.params, format, { trigger: "scheduled", settings });
      if (res.ok && res.id && !res.skipped) generated.push({ id: res.id, fileName: res.fileName, content: res.content, format, type: p.type });
      if (!res.ok) failed.push(`${p.type} ${format}: ${res.error}`);
    }
  }

  // Delivery (only real when SMTP is configured — never faked).
  if (generated.length) {
    const ids = generated.map((g) => g.id);
    if (!settings.email_enabled || settings.email_recipients.length === 0) {
      await query("UPDATE generated_reports SET delivery_status='not_requested' WHERE id = ANY($1::bigint[])", [ids]);
    } else if (!smtpConfigured()) {
      await query(
        "UPDATE generated_reports SET delivery_status='not_configured', delivery_detail='Email is switched on but SMTP settings are missing on the server.' WHERE id = ANY($1::bigint[])",
        [ids],
      );
    } else {
      try {
        const kinds = [...new Set(generated.map((g) => ({ day: "Daily", week: "Weekly", month: "Monthly" })[g.type as "day"]))];
        const totals = await queryOne<{ v: string }>("SELECT coalesce(sum(stock_value),0)::text AS v FROM items WHERE archived_at IS NULL");
        const messageId = await sendMail({
          to: settings.email_recipients,
          subject: `${settings.store_name} — ${kinds.join(" & ")} inventory report (${today})`,
          text:
            `Attached: ${generated.map((g) => g.fileName).join(", ")}.\n\n` +
            `Current inventory worth: ${formatMoney(totals?.v ?? 0, settings.currency_symbol)}\n\n` +
            `This email was sent automatically by ${settings.store_name}.`,
          attachments: generated.map((g) => ({ filename: g.fileName, content: g.content })),
        });
        await query(
          "UPDATE generated_reports SET delivery_status='sent', delivery_detail=$2 WHERE id = ANY($1::bigint[])",
          [ids, `Sent to ${settings.email_recipients.join(", ")} (${messageId})`],
        );
      } catch (e) {
        await query(
          "UPDATE generated_reports SET delivery_status='failed', delivery_detail=$2 WHERE id = ANY($1::bigint[])",
          [ids, (e as Error).message.slice(0, 400)],
        );
      }
    }
  }
  return { status: "ran" as const, generated: generated.map((g) => g.fileName), failed };
}
