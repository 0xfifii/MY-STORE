"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input } from "@/components/ui/primitives";
import { api } from "@/lib/client";

export function InviteForm({ token, email, existing }: { token: string; email: string; existing: boolean }) {
  const [name, setName] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!existing && pw !== pw2) { setErr("The two passwords don't match."); return; }
    setBusy(true);
    try {
      await api("/api/invites/accept", { method: "POST", json: { token, name, password: pw } });
      router.replace("/dashboard");
      router.refresh();
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Field label="Email" htmlFor="inv-email" required><Input id="inv-email" value={email} disabled /></Field>
      {!existing && (
        <Field label="Your name" htmlFor="inv-name" required><Input id="inv-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus autoComplete="name" /></Field>
      )}
      <Field label={existing ? "Your password" : "Choose a password"} htmlFor="inv-pw" required hint={existing ? undefined : "At least 8 characters."}>
        <Input id="inv-pw" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete={existing ? "current-password" : "new-password"} autoFocus={existing} />
      </Field>
      {!existing && (
        <Field label="Type it again" htmlFor="inv-pw2" required><Input id="inv-pw2" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" /></Field>
      )}
      {err && <p role="alert" className="rounded-2xl bg-bad-bg px-4 py-3 text-sm text-bad">{err}</p>}
      <Button type="submit" size="lg" loading={busy} className="w-full">Accept and continue</Button>
    </form>
  );
}
