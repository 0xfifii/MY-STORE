"use client";

import { useState } from "react";
import { Button, Field, Input } from "@/components/ui/primitives";
import { api } from "@/lib/client";

export function LoginForm({ next }: { next: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/login", { method: "POST", json: { email, password } });
      window.location.href = next;
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Field label="Email" htmlFor="email" required>
        <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </Field>
      <Field label="Password" htmlFor="password" required>
        <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </Field>
      {error && <p role="alert" className="rounded-md bg-bad-bg px-3 py-2 text-sm text-bad">{error}</p>}
      <Button type="submit" size="lg" className="w-full" loading={busy}>
        Sign in
      </Button>
    </form>
  );
}
