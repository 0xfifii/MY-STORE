"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Button } from "@/components/ui/primitives";
import { api } from "@/lib/client";
import { formatMoney } from "@/lib/format";

const OPTIONS = [1, 3, 6, 12];

export function PayButton({ monthly }: { monthly: number }) {
  const [months, setMonths] = useState(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const pay = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await api<{ url: string }>("/api/billing/checkout", { method: "POST", json: { months } });
      window.location.href = r.url; // Paystack's secure payment page
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  };
  return (
    <div>
      <h2 className="font-semibold">Renew</h2>
      <p className="mt-0.5 text-sm text-[#111111]/60">{formatMoney(monthly, "₦")} per month. Pay by card, bank transfer or USSD through Paystack.</p>
      <div className="mt-4 grid grid-cols-4 gap-2" role="radiogroup" aria-label="How many months">
        {OPTIONS.map((m) => (
          <button key={m} type="button" role="radio" aria-checked={months === m} onClick={() => setMonths(m)}
            className={clsx("rounded-2xl px-2 py-3 text-center text-sm font-semibold ring-1 transition active:scale-95", months === m ? "bg-[#111111] text-white ring-[#111111]" : "bg-white ring-black/10 hover:ring-black/30")}>
            {m} month{m === 1 ? "" : "s"}
          </button>
        ))}
      </div>
      <Button size="lg" className="mt-4 w-full" loading={busy} onClick={pay} data-testid="pay-now">
        Pay {formatMoney(monthly * months, "₦")} with Paystack
      </Button>
      {err && <p role="alert" className="mt-3 text-sm text-bad">{err}</p>}
    </div>
  );
}

export function SignOutLink() {
  const router = useRouter();
  return (
    <button type="button" className="text-sm font-semibold underline"
      onClick={async () => { await api("/api/auth/logout", { method: "POST" }).catch(() => {}); router.replace("/login"); router.refresh(); }}>
      Sign out
    </button>
  );
}
