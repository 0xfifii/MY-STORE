"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Mail, Plus, ShieldCheck, UserCheck, UserX } from "@/components/hand-icons";
import { Button, Field, Input, Select } from "./ui/primitives";
import { Modal } from "./ui/dialog";
import { useToast } from "./ui/toast";
import { api } from "@/lib/client";
import { ROLE_LABELS, TOGGLEABLE, permissionsOf, type Role } from "@/lib/permissions";

type U = {
  id: string; name: string; email: string; role: Role; is_active: boolean; last_login: string | null;
  welcome?: { status: string; at: string; error: string | null } | null;
  permissions: string[] | null; allowed_category_ids: number[] | null;
};

const ROLE_HELP: Record<Role, string> = {
  owner: "Everything, including users, settings and reversing transactions.",
  staff: "Stock in and out, add and edit items, categories and suppliers, reports.",
  viewer: "Can look at inventory and download reports. Can't change anything.",
};

export function UsersManager({ users, meId, categories, mailReady = true }: { users: U[]; meId: string; categories: { id: number; name: string }[]; mailReady?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [modal, setModal] = useState<null | { kind: "new" } | { kind: "password"; user: U }>(null);
  const [permUser, setPermUser] = useState<U | null>(null);
  const [welcomeUser, setWelcomeUser] = useState<U | null>(null);
  const [f, setF] = useState({ name: "", email: "", role: "staff" as Role, password: "" });
  const [welcome, setWelcome] = useState({ send_welcome: true, include_password: true });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const patch = async (u: U, body: Record<string, unknown>, msg: string) => {
    try {
      await api(`/api/users/${u.id}`, { method: "PATCH", json: body });
      toast.success(msg);
      router.refresh();
    } catch (e) { toast.error("Couldn't update user", (e as Error).message); }
  };

  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      if (modal?.kind === "new") {
        const d = await api<{ welcome: { status: string; detail?: string } }>("/api/users", { method: "POST", json: { ...f, ...welcome } });
        const w = d.welcome.status;
        if (w === "sent") toast.success("User added", `A welcome email was sent to ${f.email}.`);
        else if (w === "failed") toast.error("User added, but the welcome email failed", d.welcome.detail ?? "");
        else if (w === "not_configured") toast.success("User added", `${f.name} can sign in with ${f.email}. (No welcome email: set up the email account in Store Settings.)`);
        else toast.success("User added", `${f.name} can now sign in with ${f.email}.`);
      } else if (modal?.kind === "password") {
        await api(`/api/users/${modal.user.id}`, { method: "PATCH", json: { password: f.password } });
        toast.success("Password changed", `${modal.user.name} has been signed out of other devices.`);
      }
      setModal(null);
      router.refresh();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-burgundy/70">{users.filter((u) => u.is_active).length} active users</p>
        <Button size="sm" onClick={() => { setF({ name: "", email: "", role: "staff", password: "" }); setErr(null); setModal({ kind: "new" }); }}>
          <Plus className="size-4" /> Add user
        </Button>
      </div>
      <ul className="stagger space-y-3">
        {users.map((u) => {
          const perms = permissionsOf(u).filter((p) => p !== "view").map((p) => TOGGLEABLE.find((t) => t.action === p)?.label).filter(Boolean) as string[];
          const cats = u.allowed_category_ids?.length ? u.allowed_category_ids.map((id) => categories.find((c) => c.id === id)?.name).filter(Boolean) : null;
          const initials = u.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
          return (
            <li key={u.id} className={`overflow-hidden rounded-[var(--radius-card)] bg-paper shadow-[0_12px_30px_-22px_rgb(82_8_16/0.6)] ring-1 ring-burgundy/12 ${u.is_active ? "" : "opacity-60"}`}>
              {/* Who */}
              <div className="flex flex-col gap-3 px-4 pb-3 pt-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-burgundy to-claret text-sm font-bold tracking-wide text-paper">{initials}</span>
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-x-2 text-[16px] font-semibold tracking-[-0.01em]">
                      {u.name}
                      {u.id === meId && <span className="rounded-full bg-burgundy/10 px-2 py-0.5 text-[11px] font-semibold text-burgundy">You</span>}
                      {!u.is_active && <span className="rounded-full bg-bad-bg px-2 py-0.5 text-[11px] font-semibold text-bad">Deactivated</span>}
                    </p>
                    <p className="truncate text-sm text-muted">{u.email}</p>
                    <p className="mt-0.5 text-xs text-muted">Last sign-in {u.last_login ?? "never"}</p>
                  </div>
                </div>
                <Select aria-label={`Role for ${u.name}`} value={u.role} disabled={u.id === meId} onChange={(e) => patch(u, { role: e.target.value }, "Role updated")}
                  className="h-10 w-full rounded-xl border-burgundy/15 bg-paper text-sm font-semibold text-burgundy sm:w-56">
                  {(Object.keys(ROLE_LABELS) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                </Select>
              </div>

              {/* What they can do */}
              <div className="border-t border-burgundy/10 bg-burgundy/[0.03] px-4 py-3 sm:px-5">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-burgundy/60">
                  {u.role === "owner" ? "Access" : "Can do"}
                </p>
                {u.role === "owner" ? (
                  <span className="inline-flex rounded-full bg-burgundy px-3 py-1 text-xs font-semibold text-paper">Everything (owner)</span>
                ) : perms.length ? (
                  <ul className="flex flex-wrap gap-1.5">
                    {perms.map((p) => <li key={p} className="rounded-full bg-paper px-2.5 py-1 text-xs font-medium text-burgundy ring-1 ring-burgundy/20">{p}</li>)}
                  </ul>
                ) : (
                  <span className="inline-flex rounded-full bg-paper px-2.5 py-1 text-xs font-medium text-muted ring-1 ring-burgundy/15">View only</span>
                )}
                {cats && u.role !== "owner" && (
                  <p className="mt-2 text-xs text-muted">Only these categories: <span className="font-medium text-ink">{cats.join(", ")}</span></p>
                )}
                {u.id !== meId && (
                  <p className={`mt-2 flex items-center gap-1.5 text-xs ${u.welcome?.status === "sent" ? "text-ok" : u.welcome ? "text-bad" : "text-muted"}`}>
                    <Mail className="size-3.5 shrink-0" />
                    {u.welcome?.status === "sent" ? `Welcome email sent ${u.welcome.at}` : u.welcome ? `Welcome email not delivered (${u.welcome.at}): ${u.welcome.error ?? "failed"}` : "No welcome email sent yet"}
                  </p>
                )}
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-2 border-t border-burgundy/10 px-4 py-3 sm:px-5">
                {u.role !== "owner" && (
                  <Button size="sm" variant="secondary" onClick={() => setPermUser(u)}>
                    <ShieldCheck className="size-4" /> Permissions
                  </Button>
                )}
                <Button size="sm" variant="secondary" onClick={() => { setF({ ...f, password: "" }); setErr(null); setModal({ kind: "password", user: u }); }}>
                  <KeyRound className="size-4" /> Password
                </Button>
                {u.id !== meId && u.is_active && (
                  <Button size="sm" variant="secondary" onClick={() => setWelcomeUser(u)}>
                    <Mail className="size-4" /> {u.welcome?.status === "sent" ? "Resend welcome email" : "Send welcome email"}
                  </Button>
                )}
                {u.id !== meId && (
                  <Button size="sm" variant={u.is_active ? "outline-danger" : "secondary"} className="sm:ml-auto"
                    onClick={() => patch(u, { is_active: !u.is_active }, u.is_active ? "User deactivated" : "User reactivated")}>
                    {u.is_active ? <UserX className="size-4" /> : <UserCheck className="size-4" />} {u.is_active ? "Deactivate" : "Reactivate"}
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <Modal open={!!modal} onClose={() => setModal(null)} busy={busy}
        title={modal?.kind === "new" ? "Add user" : modal?.kind === "password" ? `Set password for ${modal.user.name}` : ""}
        footer={<><Button variant="secondary" onClick={() => setModal(null)}>Cancel</Button><Button onClick={submit} loading={busy}>{modal?.kind === "new" ? "Add user" : "Set password"}</Button></>}>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          {modal?.kind === "new" && (
            <>
              <Field label="Name" htmlFor="nu-name" required><Input id="nu-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
              <Field label="Email" htmlFor="nu-email" required><Input id="nu-email" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
              <Field label="Role" htmlFor="nu-role" required hint={ROLE_HELP[f.role]}>
                <Select id="nu-role" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })}>
                  {(Object.keys(ROLE_LABELS) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                </Select>
              </Field>
            </>
          )}
          <Field label={modal?.kind === "new" ? "Temporary password" : "New password"} htmlFor="nu-pw" required hint="At least 8 characters. Share it with the person privately.">
            <Input id="nu-pw" type="text" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
          </Field>
          {modal?.kind === "new" && (
            <div className="space-y-2 rounded-2xl bg-white/70 p-3 text-sm ring-1 ring-white">
              <label className="flex items-start gap-2.5">
                <input type="checkbox" className="mt-0.5 size-4 accent-burgundy" checked={welcome.send_welcome} onChange={(e) => setWelcome({ ...welcome, send_welcome: e.target.checked })} />
                <span><span className="font-medium">Send a welcome email</span><span className="block text-xs text-muted">With the sign-in link and their login email.</span></span>
              </label>
              {welcome.send_welcome && (
                <label className="flex items-start gap-2.5 pl-6">
                  <input type="checkbox" className="mt-0.5 size-4 accent-burgundy" checked={welcome.include_password} onChange={(e) => setWelcome({ ...welcome, include_password: e.target.checked })} />
                  <span>Include the temporary password in the email</span>
                </label>
              )}
            </div>
          )}
          {err && <p role="alert" className="text-sm text-bad">{err}</p>}
          <button type="submit" className="hidden" />
        </form>
      </Modal>
      {welcomeUser && <WelcomeModal user={welcomeUser} mailReady={mailReady} onClose={() => setWelcomeUser(null)} />}
      {permUser && <PermissionsModal user={permUser} categories={categories} onClose={() => setPermUser(null)} />}
    </div>
  );
}

function PermissionsModal({ user, categories, onClose }: { user: U; categories: { id: number; name: string }[]; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [perms, setPerms] = useState<Set<string>>(new Set(permissionsOf(user).filter((p) => p !== "view")));
  const [limit, setLimit] = useState(Boolean(user.allowed_category_ids?.length));
  const [cats, setCats] = useState<Set<number>>(new Set(user.allowed_category_ids ?? []));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const toggle = (a: string) => setPerms((p) => { const n = new Set(p); if (n.has(a)) n.delete(a); else n.add(a); return n; });
  const save = async () => {
    setBusy(true); setErr(null);
    try {
      await api(`/api/users/${user.id}/permissions`, {
        method: "PUT",
        json: { permissions: Array.from(perms), allowed_category_ids: limit ? Array.from(cats) : null },
      });
      toast.success("Permissions saved", `${user.name} can now only do what you ticked.`);
      onClose();
      router.refresh();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={`What can ${user.name} do?`} busy={busy} wide
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} loading={busy} disabled={limit && cats.size === 0}>Save permissions</Button></>}>
      <p className="text-sm text-muted">Everyone can view inventory and download reports. Tick what else this person may do.</p>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {TOGGLEABLE.map((t) => (
          <li key={t.action}>
            <label className={`flex h-full cursor-pointer items-start gap-3 rounded-2xl p-3 ring-1 transition-colors ${perms.has(t.action) ? "bg-rose ring-burgundy/25" : "bg-white/70 ring-white"}`}>
              <input type="checkbox" className="mt-0.5 size-5 accent-burgundy" checked={perms.has(t.action)} onChange={() => toggle(t.action)} />
              <span>
                <span className="block text-sm font-semibold">{t.label}</span>
                {t.hint && <span className="block text-xs text-muted">{t.hint}</span>}
              </span>
            </label>
          </li>
        ))}
      </ul>
      {(perms.has("stock.in") || perms.has("stock.out")) && (
        <div className="mt-5 rounded-2xl bg-white/70 p-4 ring-1 ring-white">
          <label className="flex items-center gap-3 text-sm font-semibold">
            <input type="checkbox" className="size-5 accent-burgundy" checked={limit} onChange={(e) => setLimit(e.target.checked)} />
            Only let them move stock for certain categories
          </label>
          {limit && (
            categories.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {categories.map((c) => {
                  const on = cats.has(c.id);
                  return (
                    <button key={c.id} type="button" onClick={() => setCats((p) => { const n = new Set(p); if (on) n.delete(c.id); else n.add(c.id); return n; })}
                      className={`rounded-full px-3.5 py-1.5 text-sm font-medium ring-1 ${on ? "bg-night text-white ring-night" : "bg-white text-ink ring-line"}`}>
                      {c.name}
                    </button>
                  );
                })}
              </div>
            ) : <p className="mt-2 text-sm text-muted">Create categories first, then come back here.</p>
          )}
          {limit && cats.size === 0 && categories.length > 0 && <p className="mt-2 text-xs text-bad">Pick at least one category.</p>}
        </div>
      )}
      {err && <p role="alert" className="mt-3 text-sm text-bad">{err}</p>}
    </Modal>
  );
}

/** Send (or resend) the welcome email, optionally with a fresh temporary password. */
function WelcomeModal({ user, mailReady, onClose }: { user: U; mailReady: boolean; onClose: () => void }) {
  const [reset, setReset] = useState(false);
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();
  const toast = useToast();
  const send = async () => {
    setBusy(true); setErr(null);
    try {
      await api(`/api/users/${user.id}/welcome`, { method: "POST", json: reset ? { new_password: pw } : {} });
      toast.success("Welcome email sent", `Sent to ${user.email}. Ask them to check spam if it doesn't arrive in a few minutes.`);
      onClose();
      router.refresh();
    } catch (e) { setErr((e as Error).message); router.refresh(); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={`Welcome email for ${user.name}`} busy={busy}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={send} loading={busy} disabled={!mailReady || (reset && pw.length < 8)}><Mail className="size-4" /> Send email</Button></>}>
      <form onSubmit={(e) => { e.preventDefault(); if (mailReady && (!reset || pw.length >= 8)) send(); }} className="space-y-4">
        <p className="text-sm">Sends the sign-in link and login email to <strong>{user.email}</strong>.</p>
        {!mailReady && <p className="rounded-2xl bg-warn-bg px-3 py-2 text-sm text-warn">Email isn&apos;t set up yet. Add the email account in Store Settings first.</p>}
        <label className="flex items-start gap-2.5 text-sm">
          <input type="checkbox" className="mt-0.5 size-4 accent-burgundy" checked={reset} onChange={(e) => setReset(e.target.checked)} />
          <span><span className="font-medium">Set a new temporary password and include it</span><span className="block text-xs text-muted">Passwords are stored scrambled, so the old one can&apos;t be sent again. This signs them out of other devices.</span></span>
        </label>
        {reset && (
          <Field label="New temporary password" htmlFor="wl-pw" hint="At least 8 characters.">
            <Input id="wl-pw" type="text" autoComplete="new-password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} />
          </Field>
        )}
        {err && <p role="alert" className="rounded-2xl bg-bad-bg px-3 py-2 text-sm text-bad">{err}</p>}
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}
