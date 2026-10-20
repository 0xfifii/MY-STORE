"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Plus, ShieldCheck, UserCheck, UserX } from "lucide-react";
import { Button, Field, Input, Select } from "./ui/primitives";
import { Modal } from "./ui/dialog";
import { useToast } from "./ui/toast";
import { api } from "@/lib/client";
import { ROLE_LABELS, TOGGLEABLE, permissionsOf, type Role } from "@/lib/permissions";

type U = {
  id: string; name: string; email: string; role: Role; is_active: boolean; last_login: string | null;
  permissions: string[] | null; allowed_category_ids: number[] | null;
};

const ROLE_HELP: Record<Role, string> = {
  owner: "Everything, including users, settings and reversing transactions.",
  staff: "Stock in and out, add and edit items, categories and suppliers, reports.",
  viewer: "Can look at inventory and download reports. Can't change anything.",
};

export function UsersManager({ users, meId, categories }: { users: U[]; meId: string; categories: { id: number; name: string }[] }) {
  const router = useRouter();
  const toast = useToast();
  const [modal, setModal] = useState<null | { kind: "new" } | { kind: "password"; user: U }>(null);
  const [permUser, setPermUser] = useState<U | null>(null);
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
    <div className="glass overflow-hidden rounded-[var(--radius-card)]">
      <div className="flex items-center justify-between border-b border-white/80 px-4 py-3 sm:px-5">
        <p className="text-sm text-muted">{users.filter((u) => u.is_active).length} active users</p>
        <Button size="sm" onClick={() => { setF({ name: "", email: "", role: "staff", password: "" }); setErr(null); setModal({ kind: "new" }); }}>
          <Plus className="size-4" /> Add user
        </Button>
      </div>
      <ul className="divide-y divide-white/80">
        {users.map((u) => (
          <li key={u.id} className={`flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:px-5 ${u.is_active ? "" : "opacity-60"}`}>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{u.name}{u.id === meId && <span className="ml-2 text-xs font-normal text-muted">(you)</span>}{!u.is_active && <span className="ml-2 text-xs font-normal text-bad">deactivated</span>}</p>
              <p className="truncate text-xs text-muted">{u.email} · last sign-in {u.last_login ?? "never"}</p>
              {u.role !== "owner" && (
                <p className="mt-1 truncate text-xs text-ink/70">
                  Can: {permissionsOf(u).filter((p) => p !== "view").map((p) => TOGGLEABLE.find((t) => t.action === p)?.label).filter(Boolean).join(", ") || "view only"}
                  {u.allowed_category_ids?.length ? ` · only ${u.allowed_category_ids.map((id) => categories.find((c) => c.id === id)?.name).filter(Boolean).join(", ")}` : ""}
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select aria-label={`Role for ${u.name}`} value={u.role} disabled={u.id === meId} onChange={(e) => patch(u, { role: e.target.value }, "Role updated")} className="h-9 w-48 text-sm">
                {(Object.keys(ROLE_LABELS) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </Select>
              {u.role !== "owner" && (
                <Button size="sm" variant="secondary" onClick={() => setPermUser(u)}>
                  <ShieldCheck className="size-4" /> Permissions
                </Button>
              )}
              <Button size="sm" variant="secondary" onClick={() => { setF({ ...f, password: "" }); setErr(null); setModal({ kind: "password", user: u }); }}>
                <KeyRound className="size-4" /> Password
              </Button>
              {u.id !== meId && (
                <Button size="sm" variant={u.is_active ? "outline-danger" : "secondary"} onClick={() => patch(u, { is_active: !u.is_active }, u.is_active ? "User deactivated" : "User reactivated")}>
                  {u.is_active ? <UserX className="size-4" /> : <UserCheck className="size-4" />} {u.is_active ? "Deactivate" : "Reactivate"}
                </Button>
              )}
            </div>
          </li>
        ))}
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
