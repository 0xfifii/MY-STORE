"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { FileSpreadsheet, FileText, Paperclip, Send } from "lucide-react";
import { Button, Field, Input, Select, Textarea } from "./ui/primitives";
import { useToast } from "./ui/toast";
import { api } from "@/lib/client";

type Contact = { name: string; email: string };
type Attach = "none" | "report" | "audit";

export function MailComposer({ contacts, canAudit, thisMonth, ready }: { contacts: Contact[]; canAudit: boolean; thisMonth: string; ready: boolean }) {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [attach, setAttach] = useState<Attach>("none");
  const [preset, setPreset] = useState("today");
  const [format, setFormat] = useState<"pdf" | "xlsx" | "csv">("pdf");
  const [month, setMonth] = useState(thisMonth);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const toast = useToast();
  const router = useRouter();
  const list = to.split(/[,;\s]+/).filter(Boolean);
  const add = (email: string) => { if (!list.includes(email)) setTo([...list, email].join(", ")); };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const body = {
        to, subject, message,
        attach: attach === "report" ? { kind: "report", preset, format } : attach === "audit" ? { kind: "audit", month, format: format === "csv" ? "pdf" : format } : { kind: "none" },
      };
      const d = await api<{ sent: string[]; attachments: string[] }>("/api/mail/send", { method: "POST", json: body });
      toast.success("Email sent", `To ${d.sent.join(", ")}${d.attachments.length ? ` with ${d.attachments.join(", ")}` : ""}.`);
      setSubject(""); setMessage(""); setAttach("none");
      router.refresh();
    } catch (e2) { setErr((e2 as Error).message); } finally { setBusy(false); }
  };

  return (
    <form onSubmit={send} className="space-y-4" noValidate>
      {!ready && (
        <p className="rounded-2xl bg-warn-bg px-3 py-2 text-sm text-warn">
          Email isn&apos;t set up yet. An owner can add the mail account under <a href="/settings" className="font-semibold underline">Store Settings → Email account</a>.
        </p>
      )}
      <Field label="To" htmlFor="m-to" required hint="Separate several addresses with commas.">
        <Input id="m-to" value={to} onChange={(e) => setTo(e.target.value)} placeholder="name@example.com" autoComplete="off" />
      </Field>
      {contacts.length > 0 && (
        <div className="-mt-2 flex flex-wrap gap-1.5">
          {contacts.map((c) => (
            <button key={c.email} type="button" onClick={() => add(c.email)}
              className={clsx("rounded-full px-3 py-1 text-xs font-semibold ring-1 transition active:scale-95",
                list.includes(c.email) ? "bg-burgundy text-white ring-burgundy" : "bg-white/80 text-ink ring-white hover:bg-rose hover:text-burgundy")}>
              {c.name}
            </button>
          ))}
        </div>
      )}
      <Field label="Subject" htmlFor="m-sub" required><Input id="m-sub" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. This week's stock report" /></Field>
      <Field label="Message" htmlFor="m-msg" required><Textarea id="m-msg" rows={6} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Write your message…" /></Field>

      <fieldset>
        <legend className="mb-2 flex items-center gap-1.5 text-sm font-medium"><Paperclip className="size-4" /> Attachment</legend>
        <div className="flex flex-wrap gap-1.5">
          {([["none", "None"], ["report", "Stock report"], ...(canAudit ? [["audit", "Monthly audit report"]] : [])] as [Attach, string][]).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setAttach(k)} aria-pressed={attach === k}
              className={clsx("rounded-full px-4 py-2 text-sm font-semibold ring-1 transition active:scale-95", attach === k ? "bg-night text-white ring-night" : "bg-white/75 ring-white hover:bg-white")}>
              {l}
            </button>
          ))}
        </div>
        {attach !== "none" && (
          <div className="mt-3 grid grid-cols-1 gap-3 rounded-3xl bg-white/60 p-3 ring-1 ring-white sm:grid-cols-2">
            {attach === "report" ? (
              <Field label="Period" htmlFor="m-per">
                <Select id="m-per" value={preset} onChange={(e) => setPreset(e.target.value)}>
                  <option value="today">Today</option><option value="yesterday">Yesterday</option>
                  <option value="this_week">This week</option><option value="last_week">Last week</option>
                  <option value="this_month">This month</option><option value="last_month">Last month</option>
                </Select>
              </Field>
            ) : (
              <Field label="Month" htmlFor="m-mon"><Input id="m-mon" type="month" value={month} max={thisMonth} onChange={(e) => setMonth(e.target.value)} /></Field>
            )}
            <Field label="File type" htmlFor="m-fmt">
              <div className="flex gap-1.5">
                {(["pdf", "xlsx", ...(attach === "report" ? ["csv"] : [])] as ("pdf" | "xlsx" | "csv")[]).map((f) => (
                  <button key={f} type="button" onClick={() => setFormat(f)} aria-pressed={format === f}
                    className={clsx("inline-flex h-11 items-center gap-1.5 rounded-full px-4 text-sm font-semibold ring-1 transition", format === f ? "bg-burgundy text-white ring-burgundy" : "bg-white ring-white hover:bg-rose")}>
                    {f === "pdf" ? <FileText className="size-4" /> : <FileSpreadsheet className="size-4" />}{f === "xlsx" ? "Excel" : f.toUpperCase()}
                  </button>
                ))}
              </div>
            </Field>
          </div>
        )}
      </fieldset>

      {err && <p role="alert" className="rounded-2xl bg-bad-bg px-3 py-2 text-sm text-bad">{err}</p>}
      <div className="flex justify-end">
        <Button type="submit" size="lg" loading={busy} disabled={!ready || !to.trim() || !subject.trim() || !message.trim()}><Send className="size-4" /> Send email</Button>
      </div>
    </form>
  );
}
