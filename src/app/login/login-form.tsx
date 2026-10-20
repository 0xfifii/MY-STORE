"use client";

import { useState } from "react";
import { AtSign, KeyRound, Loader2 } from "lucide-react";

const pill =
  "flex h-14 items-center gap-3 rounded-full bg-white/70 pl-2 pr-2 shadow-[inset_0_1px_2px_rgb(79_16_34/0.06)] ring-1 ring-white focus-within:bg-white focus-within:ring-burgundy/25";
const knob = "flex size-10 shrink-0 items-center justify-center rounded-full bg-white text-ink shadow-sm";

export function LoginForm({ next }: { next: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Couldn't sign in. Try again.");
      window.location.href = next;
    } catch (err) {
      setError((err as Error).message === "Failed to fetch" ? "Can't reach the server. Check your internet connection." : (err as Error).message);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <label className={pill}>
        <span className={knob}><AtSign className="size-4" /></span>
        <span className="sr-only">Email address</span>
        <input id="email" type="email" autoComplete="email" placeholder="e-mail address" value={email}
          onChange={(e) => setEmail(e.target.value)} className="h-full min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-ink/60" />
      </label>
      <label className={pill}>
        <span className={knob}><KeyRound className="size-4" /></span>
        <span className="sr-only">Password</span>
        <input id="password" type={show ? "text" : "password"} autoComplete="current-password" placeholder="password" value={password}
          onChange={(e) => setPassword(e.target.value)} className="h-full min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-ink/60" />
        <button type="button" onClick={() => setShow(!show)} className="h-9 shrink-0 rounded-full bg-white px-4 text-xs font-semibold shadow-sm">
          {show ? "Hide" : "Show"}
        </button>
      </label>

      {error && <p role="alert" className="rounded-2xl bg-bad-bg px-4 py-2.5 text-sm text-bad">{error}</p>}

      <div className="flex items-end justify-between gap-4 pt-4">
        <p className="max-w-[15rem] text-xs leading-relaxed text-muted">
          For staff of this store only. Forgot your password? Ask the store owner to reset it under Users.
        </p>
        <button type="submit" disabled={busy} aria-label="Sign in"
          className="flex h-14 min-w-36 items-center justify-center gap-2 rounded-full bg-night px-8 text-sm font-semibold text-white transition-colors hover:bg-claret disabled:opacity-60">
          {busy && <Loader2 className="size-4 animate-spin" />}
          Sign in
        </button>
      </div>
    </form>
  );
}
