"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/client";

export function ProfileForm({ name, email, companyName, canEditCompany }: { name: string; email: string; companyName: string; canEditCompany: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [f, setF] = useState({ name, company: companyName, current: "", next: "", confirm: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!f.name.trim()) return setError("Enter your name.");
    if (canEditCompany && f.company.trim().length < 2) return setError("Enter the company name.");
    if (f.next && f.next !== f.confirm) return setError("The two new passwords don't match.");
    if (f.next && !f.current) return setError("Enter your current password to set a new one.");
    setBusy(true);
    try {
      await api("/api/profile", {
        method: "PATCH",
        json: { name: f.name, ...(canEditCompany ? { company_name: f.company } : {}), ...(f.next ? { current_password: f.current, new_password: f.next } : {}) },
      });
      toast.success("Profile saved", canEditCompany && f.company !== companyName ? `The company name is now “${f.company.trim()}”.` : undefined);
      setF({ ...f, current: "", next: "", confirm: "" });
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} className="space-y-5" noValidate data-testid="profile-form">
      {canEditCompany && (
        <Field label="Company name" htmlFor="company" required hint="Shown on the dashboard, sidebar, reports, PDFs and emails.">
          <Input id="company" autoComplete="organization" value={f.company} onChange={set("company")} />
        </Field>
      )}
      <Field label="Your name" htmlFor="name" required>
        <Input id="name" autoComplete="name" value={f.name} onChange={set("name")} />
      </Field>
      <Field label="Email" htmlFor="email" hint="Ask the account owner if this needs changing.">
        <Input id="email" value={email} disabled readOnly />
      </Field>

      <div className="border-t border-black/[0.06] pt-5">
        <p className="mb-3 text-sm font-semibold">Change password <span className="font-normal text-muted">(optional)</span></p>
        <div className="space-y-4">
          <Field label="Current password" htmlFor="cur"><Input id="cur" type="password" autoComplete="current-password" value={f.current} onChange={set("current")} /></Field>
          <Field label="New password" htmlFor="new" hint="At least 8 characters."><Input id="new" type="password" autoComplete="new-password" value={f.next} onChange={set("next")} /></Field>
          <Field label="Confirm new password" htmlFor="new2"><Input id="new2" type="password" autoComplete="new-password" value={f.confirm} onChange={set("confirm")} /></Field>
        </div>
      </div>

      {error && <p role="alert" className="rounded-2xl bg-bad-bg px-3 py-2 text-sm text-bad">{error}</p>}
      <Button type="submit" size="lg" className="w-full" loading={busy}>Save changes</Button>
    </form>
  );
}
