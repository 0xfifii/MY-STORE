"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/client";

type Account = { id: string; name: string; email: string; business: string; locked: boolean };

/** Link this sign-in to your accounts in other businesses, then switch between them without signing out. */
export function LinkedAccounts({ initial }: { initial: Account[] }) {
  const router = useRouter();
  const toast = useToast();
  const [accounts, setAccounts] = useState(initial);
  const [f, setF] = useState({ email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const link = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!f.email.trim() || !f.password) return setError("Enter the other account's email and password.");
    setBusy("link");
    try {
      const r = await api<{ accounts: Account[] }>("/api/account-links", { method: "POST", json: f });
      setAccounts(r.accounts);
      setF({ email: "", password: "" });
      toast.success("Account linked", "Switch to it from the bottom of the menu.");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const unlink = async (a: Account) => {
    if (!window.confirm(`Unlink ${a.business} (${a.email})? You can link it again later with its password.`)) return;
    setBusy(a.id);
    try {
      const r = await api<{ accounts: Account[] }>("/api/account-links", { method: "DELETE", json: { user_id: a.id } });
      setAccounts(r.accounts);
      router.refresh();
    } catch (err) {
      toast.error("Couldn't unlink", (err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const switchTo = async (a: Account) => {
    setBusy(a.id);
    try {
      await api("/api/account-links/switch", { method: "POST", json: { user_id: a.id } });
      router.replace("/dashboard");
      router.refresh();
    } catch (err) {
      toast.error("Couldn't switch", (err as Error).message);
      setBusy(null);
    }
  };

  return (
    <div className="space-y-5" data-testid="linked-accounts">
      <p className="text-sm text-muted">
        Have a separate ÌṢÚRA account for another business? Link it here once with its email and password, then switch
        between your businesses from the menu without signing out. Each account keeps its own items, stock and reports.
      </p>
      {accounts.length > 0 && (
        <ul className="divide-y divide-black/10 rounded-2xl border border-black/10">
          {accounts.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{a.business}{a.locked ? " · paused" : ""}</p>
                <p className="truncate text-xs text-muted">{a.name} · {a.email}</p>
              </div>
              <Button size="sm" onClick={() => switchTo(a)} loading={busy === a.id} disabled={busy !== null}>Switch</Button>
              <Button size="sm" variant="ghost" onClick={() => unlink(a)} disabled={busy !== null}>Unlink</Button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={link} className="space-y-3">
        <Field label="Other account's email" htmlFor="link-email" required>
          <Input id="link-email" type="email" autoComplete="off" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        </Field>
        <Field label="Its password" htmlFor="link-password" required error={error}>
          <Input id="link-password" type="password" autoComplete="off" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
        </Field>
        <Button type="submit" loading={busy === "link"} disabled={busy !== null}>Link account</Button>
      </form>
    </div>
  );
}
