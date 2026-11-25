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
  /** Businesses this one can send stock to and receive from. */
  linked: number[];
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

export function IsuraAdmin({ businesses, payments, activeStoreId, paystack, webhookUrl, signup }: {
  businesses: B[]; payments: P[]; activeStoreId: number; paystack: { mode: string; ending: string } | null; webhookUrl: string;
  signup: { allow: boolean; trialDays: number; priceKobo: number };
}) {
  const router = useRouter();
  const toast = useToast();
  const [modal, setModal] = useState<null | { kind: "new" } | { kind: "pay" | "edit" | "owner" | "links"; b: B }>(null);
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
      <SignupCard signup={signup} />
      <AccountFinder />

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-[19px] font-bold tracking-[-0.01em]">Businesses <span className="font-medium text-[#111111]/40">{businesses.length}</span></h2>
          <Button size="sm" onClick={() => setModal({ kind: "new" })}><Plus className="size-4" /> Add a business</Button>
        </div>
        <ul className="grid gap-4 lg:grid-cols-2" data-testid="businesses">
          {businesses.map((b) => {
            const st = statusOf(b);
            return (
              <li key={b.id} className="product-card rounded-[28px] bg-paper p-5 ring-1 ring-black/5 shadow-[0_18px_40px_-30px_rgb(0_0_0/0.7)]">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[19px] font-bold tracking-[-0.02em]">{b.name}{b.id === activeStoreId && <span className="ml-2 rounded-md bg-black/5 px-1.5 py-0.5 align-middle text-[11px] font-semibold">viewing</span>}</p>
                    <p className="mt-0.5 truncate text-[13px] text-[#111111]/55">{b.owners ?? "No owner yet"}</p>
                  </div>
                  <span className={clsx("shrink-0 rounded-lg px-2.5 py-1 text-[12px] font-bold",
                    st.tone === "dark" ? "bg-[#111111] text-white" : st.tone === "warn" ? "bg-paper text-[#111111] ring-2 ring-[#111111]" : "bg-black/5 text-[#111111]")}>
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
                  {businesses.length > 1 && (
                    <Button size="sm" variant="secondary" onClick={() => setModal({ kind: "links", b })} data-testid="transfer-links">
                      Transfers{b.linked.length ? ` (${b.linked.length})` : ""}
                    </Button>
                  )}
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
        <section className="rounded-[28px] bg-paper p-5 ring-1 ring-black/5">
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
      {modal?.kind === "links" && <TransferLinks b={modal.b} all={businesses} onClose={() => setModal(null)} />}
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
          className="bg-paper text-[#111111]" aria-label="Paystack secret key" autoComplete="off" />
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

/** Who can create an account themselves, how long the free trial is, and what they pay after. */
function SignupCard({ signup }: { signup: { allow: boolean; trialDays: number; priceKobo: number } }) {
  const router = useRouter();
  const toast = useToast();
  const [f, setF] = useState({ allow: signup.allow, trial: String(signup.trialDays), price: String(signup.priceKobo / 100) });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await api("/api/isura/settings", { method: "PATCH", json: { allow_signup: f.allow, trial_days: f.trial || "0", price_naira: f.price || "0" } });
      toast.success("Sign-up settings saved");
      router.refresh();
    } catch (e) { toast.error("Couldn't save", (e as Error).message); } finally { setBusy(false); }
  };
  return (
    <section className="rounded-[var(--radius-card)] bg-paper p-5 ring-1 ring-black/[0.06]" data-testid="signup-settings">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[19px] font-bold">New accounts</h2>
          <p className="mt-1 max-w-xl text-sm text-muted">
            Anyone can create an account for their company at <strong className="text-ink">/signup</strong>. It becomes its own business here, with them as the owner.
          </p>
        </div>
        <button type="button" role="switch" aria-checked={f.allow} onClick={() => setF({ ...f, allow: !f.allow })}
          className={clsx("flex h-9 items-center gap-2 rounded-full px-3 text-sm font-semibold transition", f.allow ? "bg-[#111111] text-white" : "bg-rose text-ink ring-1 ring-black/10")}>
          <span className={clsx("size-2.5 rounded-full", f.allow ? "bg-gold" : "bg-[#111111]/30")} /> {f.allow ? "Sign-ups open" : "Sign-ups closed"}
        </button>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="Free trial (days)" htmlFor="su-trial" hint="0 means they must pay straight away.">
          <Input id="su-trial" inputMode="numeric" value={f.trial} onChange={(e) => setF({ ...f, trial: e.target.value.replace(/\D/g, "") })} />
        </Field>
        <Field label="Price per month after the trial (₦)" htmlFor="su-price" hint="What new businesses pay through Paystack.">
          <Input id="su-price" inputMode="decimal" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value.replace(/[^\d.]/g, "") })} />
        </Field>
      </div>
      <div className="mt-4 flex justify-end"><Button onClick={save} loading={busy}>Save</Button></div>
    </section>
  );
}

type Acc = { id: string; name: string; email: string; role: string; is_platform_admin: boolean; is_active: boolean; store_id: number; store_name: string; created_via: string; items: number; txns: number; users: number };

/** Look up an account by email; if it sits inside another business, give it its own empty one. */
function AccountFinder() {
  const router = useRouter();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [acc, setAcc] = useState<Acc | null | undefined>(undefined);
  const [company, setCompany] = useState("");
  const [busy, setBusy] = useState(false);
  const find = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setBusy(true);
    try {
      const d = await api<{ account: Acc | null }>(`/api/isura/accounts?email=${encodeURIComponent(email.trim())}`);
      setAcc(d.account);
    } catch (err) { toast.error("Couldn't look that up", (err as Error).message); } finally { setBusy(false); }
  };
  const move = async () => {
    if (!acc) return;
    setBusy(true);
    try {
      await api("/api/isura/accounts/own-business", { method: "POST", json: { email: acc.email, company_name: company } });
      toast.success(`${acc.name} now has their own empty business`, `“${company}”. They'll see it next time they open ÌṢÚRA.`);
      setCompany("");
      await find();
      router.refresh();
    } catch (err) { toast.error("Couldn't do that", (err as Error).message); } finally { setBusy(false); }
  };
  const ownedAlone = acc && acc.users === 1 && acc.role === "owner";
  return (
    <section className="rounded-[var(--radius-card)] bg-paper p-5 ring-1 ring-black/[0.06]" data-testid="account-finder">
      <h2 className="text-[19px] font-bold">Find an account</h2>
      <p className="mt-1 max-w-xl text-sm text-muted">See which business an email belongs to. If it&apos;s inside someone else&apos;s business, you can give it its own empty one.</p>
      <form onSubmit={find} className="mt-4 flex gap-2">
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" aria-label="Account email" className="flex-1" />
        <Button type="submit" loading={busy && acc === undefined}>Find</Button>
      </form>
      {acc === null && <p className="mt-3 text-sm text-muted">No account with that email.</p>}
      {acc && (
        <div className="mt-4 rounded-2xl bg-canvas/70 p-4 text-sm ring-1 ring-black/[0.05]">
          <p className="font-semibold">{acc.name} <span className="font-normal text-muted">· {acc.email}</span></p>
          <p className="mt-1">
            {acc.is_platform_admin ? "Your ÌṢÚRA admin account" : acc.role === "owner" ? "Owner" : acc.role === "staff" ? "Staff" : "Viewer"} of{" "}
            <strong>{acc.store_name}</strong> (business #{acc.store_id}) · {acc.items} item{acc.items === 1 ? "" : "s"}, {acc.txns} stock record{acc.txns === 1 ? "" : "s"}, {acc.users} user{acc.users === 1 ? "" : "s"}
          </p>
          {acc.is_platform_admin ? null : ownedAlone && acc.items === 0 ? (
            <p className="mt-2 font-semibold">This account already has its own empty business. Nothing to do.</p>
          ) : (
            <div className="mt-3">
              <p className="text-muted">
                {ownedAlone
                  ? "This account has its own business with some items in it. To start completely fresh, give it a new empty business (the old one stays in your list; you can pause it)."
                  : `This account is a member of ${acc.store_name}, so it sees that business's data. Give it its own empty business:`}
              </p>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Their company name" aria-label="Company name" className="flex-1" />
                <Button onClick={move} loading={busy} disabled={company.trim().length < 2}>Give them their own business</Button>
              </div>
              <p className="mt-2 text-xs text-muted">They become the owner of the new business, with a free trial. {acc.store_name} itself doesn&apos;t change; they&apos;re just no longer a member.</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/** Which businesses this one can send stock to (and receive from). You can always transfer between any of them yourself. */
function TransferLinks({ b, all, onClose }: { b: B; all: B[]; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [picked, setPicked] = useState<number[]>(b.linked);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await api("/api/isura/links", { method: "PUT", json: { store_id: b.id, linked: picked } });
      toast.success("Transfer links saved");
      router.refresh();
      onClose();
    } catch (e) {
      toast.error("Couldn't save", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const others = all.filter((o) => o.id !== b.id);
  return (
    <Modal open onClose={onClose} title={`Transfers for ${b.name}`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} loading={busy}>Save</Button></>}>
      <p className="text-sm text-[#111111]/60">People in {b.name} with Stock Out permission can send items to the businesses you tick, and those businesses can send back. You can transfer between any businesses yourself.</p>
      <ul className="mt-3 space-y-1.5">
        {others.map((o) => (
          <li key={o.id}>
            <label className="flex items-center gap-3 rounded-2xl bg-black/[0.03] px-3 py-2.5 text-sm font-semibold">
              <input type="checkbox" className="size-4 accent-[#111111]" checked={picked.includes(o.id)}
                onChange={(e) => setPicked((p) => (e.target.checked ? [...p, o.id] : p.filter((x) => x !== o.id)))} />
              {o.name}
            </label>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
