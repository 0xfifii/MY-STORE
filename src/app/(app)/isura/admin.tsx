"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Plus } from "@/components/hand-icons";
import { Button, Field, Input, Textarea } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/client";
import { formatMoney } from "@/lib/format";

type B = {
  id: number; name: string; status: "active" | "paused"; paid_until: string | null; price_kobo: string; billing_email: string | null;
  notes: string | null; locked: boolean; days_left: number | null; items: number; users: number; owners: string | null; last: string | null;
  pending: { email: string; role: string; expires_at: string }[];
};
type P = { store_id: number; reference: string; amount_kobo: string; months: number; method: string; paid_at: string };

const naira = (kobo: string | number) => formatMoney(Number(kobo) / 100, "₦");
const day = (d: string) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Lagos" });

function statusOf(b: B) {
  if (b.status === "paused") return { label: "Paused by you", tone: "dark" };
  if (!b.paid_until) return { label: "No end date", tone: "light" };
  if (b.locked) return { label: `Ended ${day(b.paid_until)}`, tone: "dark" };
  if ((b.days_left ?? 99) <= 5) return { label: `Ends in ${b.days_left} day${b.days_left === 1 ? "" : "s"}`, tone: "warn" };
  return { label: `Paid until ${day(b.paid_until)}`, tone: "light" };
}

export function IsuraAdmin({ businesses, payments, activeStoreId, paystack, webhookUrl }: {
  businesses: B[]; payments: P[]; activeStoreId: number; paystack: { mode: string; ending: string } | null; webhookUrl: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [modal, setModal] = useState<null | { kind: "new" } | { kind: "pay" | "edit" | "owner"; b: B }>(null);
  const [link, setLink] = useState<{ url: string; email: string; note: string } | null>(null);

  const open = async (b: B) => {
    await api("/api/isura/open", { method: "POST", json: { store_id: b.id } });
    toast.success(`Now viewing ${b.name}`, "Everything you open shows this business's data.");
    router.push("/dashboard");
    router.refresh();
  };
  const togglePause = async (b: B) => {
    await api(`/api/isura/businesses/${b.id}`, { method: "PATCH", json: { status: b.status === "paused" ? "active" : "paused" } });
    toast.success(b.status === "paused" ? `${b.name} resumed` : `${b.name} paused`);
    router.refresh();
  };

  return (
    <div className="space-y-6">
      <PaystackCard paystack={paystack} webhookUrl={webhookUrl} />

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-[19px] font-bold tracking-[-0.01em]">Businesses <span className="font-medium text-[#111111]/40">{businesses.length}</span></h2>
          <Button size="sm" onClick={() => setModal({ kind: "new" })}><Plus className="size-4" /> Add a business</Button>
        </div>
        <ul className="grid gap-4 lg:grid-cols-2" data-testid="businesses">
          {businesses.map((b) => {
            const st = statusOf(b);
            return (
              <li key={b.id} className="product-card rounded-[28px] bg-white p-5 ring-1 ring-black/5 shadow-[0_18px_40px_-30px_rgb(0_0_0/0.7)]">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[19px] font-bold tracking-[-0.02em]">{b.name}{b.id === activeStoreId && <span className="ml-2 rounded-md bg-black/5 px-1.5 py-0.5 align-middle text-[11px] font-semibold">viewing</span>}</p>
                    <p className="mt-0.5 truncate text-[13px] text-[#111111]/55">{b.owners ?? "No owner yet"}</p>
                  </div>
                  <span className={clsx("shrink-0 rounded-lg px-2.5 py-1 text-[12px] font-bold",
                    st.tone === "dark" ? "bg-[#111111] text-white" : st.tone === "warn" ? "bg-white text-[#111111] ring-2 ring-[#111111]" : "bg-black/5 text-[#111111]")}>
                    {st.label}
                  </span>
                </div>
                <dl className="mt-4 grid grid-cols-3 gap-2 text-sm">
                  <div className="rounded-2xl bg-black/[0.03] p-3"><dt className="text-[11px] text-[#111111]/50">Per month</dt><dd className="font-bold tabular-nums">{Number(b.price_kobo) ? naira(b.price_kobo) : "Free"}</dd></div>
                  <div className="rounded-2xl bg-black/[0.03] p-3"><dt className="text-[11px] text-[#111111]/50">Items · users</dt><dd className="font-bold tabular-nums">{b.items} · {b.users}</dd></div>
                  <div className="rounded-2xl bg-black/[0.03] p-3"><dt className="text-[11px] text-[#111111]/50">Last stock entry</dt><dd className="font-bold">{b.last ? day(b.last) : "None"}</dd></div>
                </dl>
                {b.pending.length > 0 && (
                  <p className="mt-3 text-xs text-[#111111]/60">Invitation waiting: {b.pending.map((p) => `${p.email} (${p.role})`).join(", ")}</p>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => open(b)} disabled={b.id === activeStoreId}>Open</Button>
                  <Button size="sm" variant="secondary" onClick={() => setModal({ kind: "pay", b })}>Record payment</Button>
                  <Button size="sm" variant="secondary" onClick={() => setModal({ kind: "owner", b })}>Hand to new owner</Button>
                  <Button size="sm" variant="secondary" onClick={() => setModal({ kind: "edit", b })}>Price &amp; dates</Button>
                  {b.id !== 1 && (
                    <Button size="sm" variant={b.status === "paused" ? "primary" : "outline-danger"} onClick={() => togglePause(b)}>
                      {b.status === "paused" ? "Resume" : "Pause"}
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {payments.length > 0 && (
        <section className="rounded-[28px] bg-white p-5 ring-1 ring-black/5">
          <h2 className="font-semibold">Recent payments</h2>
          <ul className="mt-3 divide-y divide-black/5 text-sm">
            {payments.map((p) => (
              <li key={p.reference} className="flex items-center justify-between gap-3 py-2.5">
                <span>{businesses.find((b) => b.id === p.store_id)?.name ?? `Business ${p.store_id}`} · {p.months} month{p.months === 1 ? "" : "s"} · {p.method === "manual" ? "recorded" : "Paystack"} · {day(p.paid_at)}</span>
                <strong className="tabular-nums">{naira(p.amount_kobo)}</strong>
              </li>
            ))}
          </ul>
        </section>
      )}

      {modal?.kind === "new" && <NewBusiness onClose={() => setModal(null)} onLink={setLink} />}
      {modal?.kind === "pay" && <RecordPayment b={modal.b} onClose={() => setModal(null)} />}
      {modal?.kind === "edit" && <EditBusiness b={modal.b} onClose={() => setModal(null)} />}
      {modal?.kind === "owner" && <NewOwner b={modal.b} onClose={() => setModal(null)} onLink={setLink} />}
      {link && (
        <Modal open onClose={() => setLink(null)} title="Invitation ready" footer={<Button onClick={() => setLink(null)}>Done</Button>}>
          <p className="text-sm">{link.note}</p>
          <p className="mt-3 text-sm text-[#111111]/60">You can also send this link yourself (WhatsApp, SMS). It works for 7 days:</p>
          <div className="mt-2 flex gap-2">
            <Input readOnly value={link.url} onFocus={(e) => e.target.select()} data-testid="invite-link" />
            <Button variant="secondary" onClick={() => { navigator.clipboard?.writeText(link.url); toast.success("Link copied"); }}>Copy</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function PaystackCard({ paystack, webhookUrl }: { paystack: { mode: string; ending: string } | null; webhookUrl: string }) {
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();
  const toast = useToast();
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try { await api("/api/isura/settings", { method: "PUT", json: { paystack_secret_key: key } }); setKey(""); toast.success("Paystack key saved"); router.refresh(); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <section className="rounded-[28px] bg-[#111111] p-6 text-white">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[19px] font-bold">Paystack</h2>
          <p className="mt-1 text-sm text-white/65">
            {paystack ? <>Connected with a <strong className="text-white">{paystack.mode}</strong> key ending …{paystack.ending}.{paystack.mode === "test" ? " Test mode: no real money is taken." : ""}</> : "Not connected yet, so businesses can't pay online. Paste your secret key below."}
          </p>
        </div>
      </div>
      <form onSubmit={save} className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Input type="password" value={key} onChange={(e) => setKey(e.target.value.trim())} placeholder={paystack ? "Paste a new key to replace it" : "sk_test_… or sk_live_…"}
          className="bg-white text-[#111111]" aria-label="Paystack secret key" autoComplete="off" />
        <Button type="submit" variant="secondary" loading={busy} disabled={!key}>Save key</Button>
      </form>
      {err && <p role="alert" className="mt-2 text-sm text-red-300">{err}</p>}
      <p className="mt-4 text-xs text-white/55">In Paystack: Settings → API Keys &amp; Webhooks. Copy the <strong className="text-white">Secret key</strong>, and set the Webhook URL to:</p>
      <p className="mt-1 break-all rounded-xl bg-white/10 px-3 py-2 font-mono text-xs">{webhookUrl}</p>
    </section>
  );
}

function NewBusiness({ onClose, onLink }: { onClose: () => void; onLink: (l: { url: string; email: string; note: string }) => void }) {
  const [f, setF] = useState({ name: "", owner_email: "", price_naira: "", free_days: "0", notes: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();
  const save = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await api<{ invite_link: string; email: string }>("/api/isura/businesses", { method: "POST", json: { ...f, price_naira: f.price_naira || "0" } });
      onClose();
      onLink({ url: r.invite_link, email: f.owner_email, note: r.email === "sent" ? `${f.name} is ready. We emailed ${f.owner_email} an invitation to take over as owner.` : `${f.name} is ready, but the invitation email couldn't be sent (${r.email.replace(/^failed: /, "")}). Send them the link below.` });
      router.refresh();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal open onClose={onClose} busy={busy} title="Add a business"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} loading={busy} disabled={!f.name || !f.owner_email}>Create and invite owner</Button></>}>
      <div className="space-y-4">
        <Field label="Business name" htmlFor="nb-name" required><Input id="nb-name" value={f.name} onChange={set("name")} placeholder="e.g. Palmspring Social Eatery" autoFocus /></Field>
        <Field label="Owner's email" htmlFor="nb-email" required hint="They get an invitation to set their password and take over as owner.">
          <Input id="nb-email" type="email" value={f.owner_email} onChange={set("owner_email")} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Price per month (₦)" htmlFor="nb-price" required hint="What they pay through Paystack."><Input id="nb-price" inputMode="decimal" value={f.price_naira} onChange={(e) => setF({ ...f, price_naira: e.target.value.replace(/[^\d.]/g, "") })} /></Field>
          <Field label="Free days to start" htmlFor="nb-free" hint="0 = they pay before they can use it."><Input id="nb-free" inputMode="numeric" value={f.free_days} onChange={(e) => setF({ ...f, free_days: e.target.value.replace(/\D/g, "") })} /></Field>
        </div>
        <Field label="Notes" htmlFor="nb-notes"><Textarea id="nb-notes" value={f.notes} onChange={set("notes")} /></Field>
        {err && <p role="alert" className="text-sm text-bad">{err}</p>}
      </div>
    </Modal>
  );
}

function RecordPayment({ b, onClose }: { b: B; onClose: () => void }) {
  const [months, setMonths] = useState("1");
  const [amount, setAmount] = useState(String(Number(b.price_kobo) / 100 || ""));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();
  const toast = useToast();
  const save = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await api<{ paid_until: string }>(`/api/isura/businesses/${b.id}/extend`, { method: "POST", json: { months, amount_naira: amount || "0", note } });
      toast.success(`${b.name} extended`, `Now paid until ${day(r.paid_until)}.`);
      onClose(); router.refresh();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} busy={busy} title={`Record a payment · ${b.name}`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} loading={busy} disabled={!(Number(months) > 0)}>Add {months} month{months === "1" ? "" : "s"}</Button></>}>
      <p className="text-sm text-[#111111]/60">For a bank transfer or cash paid to you directly, or a free extension (amount 0). The months are added on top of what&apos;s left, and a paused or ended account unlocks.</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="Months" htmlFor="rp-m" required><Input id="rp-m" inputMode="numeric" value={months} onChange={(e) => setMonths(e.target.value.replace(/\D/g, ""))} /></Field>
        <Field label="Amount received (₦)" htmlFor="rp-a"><Input id="rp-a" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} /></Field>
      </div>
      <Field label="Note" htmlFor="rp-n" className="mt-4"><Input id="rp-n" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Transfer from GTBank, 24 Oct" /></Field>
      {err && <p role="alert" className="mt-3 text-sm text-bad">{err}</p>}
    </Modal>
  );
}

function EditBusiness({ b, onClose }: { b: B; onClose: () => void }) {
  const [f, setF] = useState({ name: b.name, price_naira: String(Number(b.price_kobo) / 100), paid_until: b.paid_until ? b.paid_until.slice(0, 10) : "", no_end: !b.paid_until, notes: b.notes ?? "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();
  const save = async () => {
    setBusy(true); setErr(null);
    try {
      await api(`/api/isura/businesses/${b.id}`, { method: "PATCH", json: { name: f.name, price_naira: f.price_naira || "0", notes: f.notes, paid_until: f.no_end ? null : f.paid_until || undefined } });
      onClose(); router.refresh();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} busy={busy} title={`Price & dates · ${b.name}`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} loading={busy}>Save</Button></>}>
      <div className="space-y-4">
        <Field label="Business name" htmlFor="eb-name" required><Input id="eb-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Price per month (₦)" htmlFor="eb-price" required><Input id="eb-price" inputMode="decimal" value={f.price_naira} onChange={(e) => setF({ ...f, price_naira: e.target.value.replace(/[^\d.]/g, "") })} /></Field>
        <Field label="Paid until" htmlFor="eb-until" hint="The account locks after this day.">
          <Input id="eb-until" type="date" value={f.paid_until} disabled={f.no_end} onChange={(e) => setF({ ...f, paid_until: e.target.value })} />
        </Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-black" checked={f.no_end} onChange={(e) => setF({ ...f, no_end: e.target.checked })} /> No end date (never locks)</label>
        <Field label="Notes" htmlFor="eb-notes"><Textarea id="eb-notes" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
        {err && <p role="alert" className="text-sm text-bad">{err}</p>}
      </div>
    </Modal>
  );
}

function NewOwner({ b, onClose, onLink }: { b: B; onClose: () => void; onLink: (l: { url: string; email: string; note: string }) => void }) {
  const [email, setEmail] = useState("");
  const [demote, setDemote] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();
  const save = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await api<{ invite_link: string; email: string }>(`/api/isura/businesses/${b.id}/invite`, { method: "POST", json: { email, role: "owner", demote_previous: demote } });
      onClose();
      onLink({ url: r.invite_link, email, note: r.email === "sent" ? `We emailed ${email}. When they accept, they become the owner of ${b.name}.` : `The email couldn't be sent (${r.email.replace(/^failed: /, "")}). Send them the link below.` });
      router.refresh();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} busy={busy} title={`Hand ${b.name} to a new owner`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} loading={busy} disabled={!email.includes("@")}>Send invitation</Button></>}>
      <p className="text-sm text-[#111111]/60">They get an email with a link to set their password (or confirm it, if they already work there). When they accept, they become the owner. You stay the ÌṢÚRA admin above them.</p>
      <Field label="New owner's email" htmlFor="no-email" required className="mt-4"><Input id="no-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus /></Field>
      <label className="mt-4 flex items-start gap-2 text-sm"><input type="checkbox" className="mt-0.5 size-4 accent-black" checked={demote} onChange={(e) => setDemote(e.target.checked)} /> Make the current owner(s) staff when they accept{b.owners ? ` (${b.owners})` : ""}</label>
      {err && <p role="alert" className="mt-3 text-sm text-bad">{err}</p>}
    </Modal>
  );
}
