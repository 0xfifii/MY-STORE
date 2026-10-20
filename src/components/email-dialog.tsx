"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Send } from "@/components/hand-icons";
import { Button, Field, Input, Textarea } from "./ui/primitives";
import { Modal } from "./ui/dialog";
import { useToast } from "./ui/toast";
import { api } from "@/lib/client";

/** Small "email this to someone" dialog. Posts { to, message } to the endpoint. */
export function EmailDialog({ open, onClose, endpoint, title, what, extra }: {
  open: boolean; onClose: () => void; endpoint: string; title: string; what: string; extra?: Record<string, unknown>;
}) {
  const [to, setTo] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const toast = useToast();
  const send = async () => {
    setBusy(true); setErr(null);
    try {
      await api(endpoint, { method: "POST", json: { to, message: message || undefined, ...extra } });
      toast.success("Email sent", `${what} sent to ${to}.`);
      setTo(""); setMessage("");
      onClose();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title={title} busy={busy}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={send} loading={busy} disabled={!to.trim()}><Send className="size-4" /> Send</Button></>}>
      <form onSubmit={(e) => { e.preventDefault(); send(); }} className="space-y-4">
        <Field label="Send to" htmlFor="em-to" required hint="Separate several addresses with commas.">
          <Input id="em-to" type="text" inputMode="email" autoComplete="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="name@example.com" autoFocus />
        </Field>
        <Field label="Message (optional)" htmlFor="em-msg">
          <Textarea id="em-msg" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Added to the top of the email" />
        </Field>
        {err && <p role="alert" className="rounded-2xl bg-bad-bg px-3 py-2 text-sm text-bad">{err}</p>}
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}

/** Download + email buttons for a transaction receipt. */
export function ReceiptActions({ txnId, txnNo, canEmail, size = "md" }: { txnId: string; txnNo: string; canEmail: boolean; size?: "sm" | "md" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <a href={`/api/transactions/${txnId}/receipt`} download
        className={`inline-flex items-center justify-center gap-2 rounded-full bg-night font-semibold text-white hover:bg-claret ${size === "sm" ? "h-9 px-4 text-sm" : "h-11 px-5 text-sm"}`}>
        Download receipt
      </a>
      {canEmail && (
        <button type="button" onClick={() => setOpen(true)}
          className={`inline-flex items-center justify-center gap-2 rounded-full bg-white/85 font-semibold ring-1 ring-white hover:bg-white ${size === "sm" ? "h-9 px-4 text-sm" : "h-11 px-5 text-sm"}`}>
          <Send className="size-4" /> Email receipt
        </button>
      )}
      <EmailDialog open={open} onClose={() => setOpen(false)} endpoint={`/api/transactions/${txnId}/receipt/email`} title={`Email receipt ${txnNo}`} what={`Receipt ${txnNo}`} />
    </>
  );
}

/** Resend a logged email, to the same people or to corrected addresses. */
export function ResendButton({ id, recipients, failed }: { id: string; recipients: string[]; failed: boolean }) {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState(recipients.join(", "));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const toast = useToast();
  const router = useRouter();
  const send = async () => {
    setBusy(true); setErr(null);
    try {
      const d = await api<{ to: string[] }>(`/api/mail/resend/${id}`, { method: "POST", json: { to } });
      toast.success("Email sent again", `To ${d.to.join(", ")}.`);
      setOpen(false);
      router.refresh();
    } catch (e) { setErr((e as Error).message); router.refresh(); } finally { setBusy(false); }
  };
  return (
    <>
      <button type="button" onClick={() => { setTo(recipients.join(", ")); setErr(null); setOpen(true); }}
        className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition active:scale-95 ${failed ? "bg-burgundy text-white hover:bg-burgundy-hover" : "bg-white/80 ring-1 ring-white hover:bg-white"}`}>
        <Send className="size-3.5" /> Resend
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Resend email" busy={busy}
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={send} loading={busy} disabled={!to.trim()}><Send className="size-4" /> Send again</Button></>}>
        <form onSubmit={(e) => { e.preventDefault(); send(); }} className="space-y-4">
          <Field label="Send to" htmlFor="rs-to" hint="Fix the address here if it was typed wrong. Separate several with commas.">
            <Input id="rs-to" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
          <p className="text-xs text-muted">Any attached receipt or report is rebuilt from the latest records.</p>
          {err && <p role="alert" className="rounded-2xl bg-bad-bg px-3 py-2 text-sm text-bad">{err}</p>}
          <button type="submit" className="hidden" />
        </form>
      </Modal>
    </>
  );
}
