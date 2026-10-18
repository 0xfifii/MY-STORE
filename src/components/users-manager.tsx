"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Plus, UserCheck, UserX } from "lucide-react";
import { Button, Field, Input, Select } from "./ui/primitives";
import { Modal } from "./ui/dialog";
import { useToast } from "./ui/toast";
import { api } from "@/lib/client";
import { ROLE_LABELS, type Role } from "@/lib/permissions";

type U = { id: string; name: string; email: string; role: Role; is_active: boolean; last_login: string | null };

const ROLE_HELP: Record<Role, string> = {
  owner: "Everything, including users, settings and reversing transactions.",
  staff: "Stock in and out, add and edit items, categories and suppliers, reports.",
  viewer: "Can look at inventory and download reports. Can't change anything.",
};

export function UsersManager({ users, meId }: { users: U[]; meId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [modal, setModal] = useState<null | { kind: "new" } | { kind: "password"; user: U }>(null);
  const [f, setF] = useState({ name: "", email: "", role: "staff" as Role, password: "" });
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
        await api("/api/users", { method: "POST", json: f });
        toast.success("User added", `${f.name} can now sign in with ${f.email}.`);
      } else if (modal?.kind === "password") {
        await api(`/api/users/${modal.user.id}`, { method: "PATCH", json: { password: f.password } });
        toast.success("Password changed", `${modal.user.name} has been signed out of other devices.`);
      }
      setModal(null);
      router.refresh();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-white">
      <div className="flex items-center justify-between border-b border-line px-4 py-3 sm:px-5">
        <p className="text-sm text-muted">{users.filter((u) => u.is_active).length} active users</p>
        <Button size="sm" onClick={() => { setF({ name: "", email: "", role: "staff", password: "" }); setErr(null); setModal({ kind: "new" }); }}>
          <Plus className="size-4" /> Add user
        </Button>
      </div>
      <ul className="divide-y divide-line">
        {users.map((u) => (
          <li key={u.id} className={`flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:px-5 ${u.is_active ? "" : "opacity-60"}`}>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{u.name}{u.id === meId && <span className="ml-2 text-xs font-normal text-muted">(you)</span>}{!u.is_active && <span className="ml-2 text-xs font-normal text-bad">deactivated</span>}</p>
              <p className="truncate text-xs text-muted">{u.email} · last sign-in {u.last_login ?? "never"}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select aria-label={`Role for ${u.name}`} value={u.role} disabled={u.id === meId} onChange={(e) => patch(u, { role: e.target.value }, "Role updated")} className="h-9 w-48 text-sm">
                {(Object.keys(ROLE_LABELS) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </Select>
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
          {err && <p role="alert" className="text-sm text-bad">{err}</p>}
          <button type="submit" className="hidden" />
        </form>
      </Modal>
    </div>
  );
}
