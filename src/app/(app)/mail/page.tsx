import { PageHeader, Panel } from "@/components/ui/primitives";
import { MailComposer } from "@/components/mail-composer";
import { ResendButton } from "@/components/email-dialog";
import { requirePageUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { query } from "@/lib/db";
import { smtpConfigured } from "@/lib/mailer";
import { getSettings } from "@/lib/settings";
import { formatDateTime, todayIn } from "@/lib/format";

export const metadata = { title: "Send Email" };

const KIND: Record<string, string> = {
  message: "Message", receipt: "Receipt", report: "Report", audit_report: "Audit report", welcome: "Welcome", test: "Test", scheduled: "Automatic report",
};

export default async function MailPage() {
  const user = await requirePageUser("mail.send");
  const s = await getSettings();
  const [users, ready, log] = await Promise.all([
    query<{ name: string; email: string }>("SELECT name, email FROM users WHERE is_active AND deleted_at IS NULL ORDER BY name"),
    smtpConfigured(),
    query<{ id: string; sent_at: string; kind: string; recipients: string[]; subject: string; attachments: string[]; status: string; error: string | null; sender: string | null; can_resend: boolean }>(
      `SELECT e.id::text, e.sent_at, e.kind, e.recipients, e.subject, e.attachments, e.status, e.error, u.name AS sender, (e.payload IS NOT NULL AND e.kind <> 'scheduled') AS can_resend
         FROM email_log e LEFT JOIN users u ON u.id = e.sent_by ORDER BY e.sent_at DESC LIMIT 40`,
    ),
  ]);
  const contacts = [...users, ...s.email_recipients.filter((e) => !users.some((u) => u.email === e)).map((e) => ({ name: e, email: e }))];
  return (
    <div>
      <PageHeader title="Send Email" description="Email anyone a message, a stock report or the monthly audit report. Receipts can be emailed from any stock out." />
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <Panel title="New email"><MailComposer contacts={contacts} canAudit={can(user, "audit.view")} thisMonth={todayIn(s.timezone).slice(0, 7)} ready={ready} /></Panel>
        <Panel title="Sent emails" bodyClass="max-h-[70vh] overflow-y-auto">
          {log.length ? (
            <ul className="divide-y divide-white/80" data-testid="email-log">
              {log.map((e) => (
                <li key={e.id} className="px-5 py-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 truncate font-semibold">{e.subject}</p>
                    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${e.status === "sent" ? "bg-ok-bg text-ok" : "bg-bad-bg text-bad"}`}>{e.status === "sent" ? "Sent" : "Failed"}</span>
                  </div>
                  <p className="truncate text-xs text-muted">{KIND[e.kind] ?? e.kind} · to {e.recipients.join(", ")}</p>
                  <p className="text-xs text-muted">{formatDateTime(e.sent_at, s.timezone)}{e.sender ? ` · by ${e.sender}` : ""}{e.attachments.length ? ` · ${e.attachments.join(", ")}` : ""}</p>
                  {e.error && <p className="mt-1 text-xs text-bad">{e.error}</p>}
                  {e.can_resend && <div className="mt-2"><ResendButton id={e.id} recipients={e.recipients} failed={e.status !== "sent"} /></div>}
                </li>
              ))}
            </ul>
          ) : <p className="p-6 text-sm text-muted">No emails sent yet.</p>}
        </Panel>
      </div>
    </div>
  );
}
