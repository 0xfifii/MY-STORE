"use client";

import { useState } from "react";
import { Button, Field, Input } from "@/components/ui/primitives";
import { api } from "@/lib/client";

export function SetupForm({ defaultStoreName }: { defaultStoreName: string }) {
  const [f, setF] = useState({ store_name: defaultStoreName, name: "", email: "", password: "", confirm: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (f.password !== f.confirm) return setError("The two passwords don't match.");
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/setup", { method: "POST", json: { store_name: f.store_name, name: f.name, email: f.email, password: f.password } });
      window.location.href = "/dashboard";
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Field label="Store name" htmlFor="store" required>
        <Input id="store" value={f.store_name} onChange={set("store_name")} />
      </Field>
      <Field label="Your name" htmlFor="name" required>
        <Input id="name" autoComplete="name" value={f.name} onChange={set("name")} />
      </Field>
      <Field label="Email" htmlFor="email" required>
        <Input id="email" type="email" autoComplete="email" value={f.email} onChange={set("email")} />
      </Field>
      <Field label="Password" htmlFor="pw" required hint="At least 8 characters.">
        <Input id="pw" type="password" autoComplete="new-password" value={f.password} onChange={set("password")} />
      </Field>
      <Field label="Confirm password" htmlFor="pw2" required>
        <Input id="pw2" type="password" autoComplete="new-password" value={f.confirm} onChange={set("confirm")} />
      </Field>
      {error && <p role="alert" className="rounded-2xl bg-bad-bg px-3 py-2 text-sm text-bad">{error}</p>}
      <Button type="submit" size="lg" className="mt-2 w-full" loading={busy}>
        Create owner account
      </Button>
    </form>
  );
}
