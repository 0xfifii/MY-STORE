import Link from "next/link";
import { Cowry, TAGLINE } from "@/components/logo";
import { requirePageUser } from "@/lib/auth";
import { getBusiness, paystackKey } from "@/lib/businesses";
import { query, withStore } from "@/lib/db";
import { formatMoney } from "@/lib/format";
import { PayButton, SignOutLink } from "./pay";

export const dynamic = "force-dynamic";
export const metadata = { title: "Subscription" };

const fmtDate = (d: string) => new Date(d).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Lagos" });

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const me = await requirePageUser("view", { allowLocked: true });
  const { error } = await searchParams;
  const [b, key, payments] = await Promise.all([
    getBusiness(me.store_id),
    paystackKey(),
    withStore(null, () => query<{ reference: string; amount_kobo: string; months: number; method: string; paid_at: string; new_paid_until: string }>(
      "SELECT reference, amount_kobo::text, months, method, paid_at::text, new_paid_until::text FROM payments WHERE store_id = $1 AND status = 'success' ORDER BY paid_at DESC LIMIT 12",
      [me.store_id])),
  ]);
  if (!b) return null;
  const monthly = Number(b.price_kobo) / 100;
  const owner = me.role === "owner";
  const ended = b.locked;
  return (
    <div className="min-h-dvh bg-[#f4f4f4] px-4 py-8">
      <div className="mx-auto max-w-xl">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-lg font-bold"><Cowry className="size-8" /> ÌṢÚRA</span>
          {ended ? <SignOutLink /> : <Link href="/dashboard" className="text-sm font-semibold underline">Back to the app</Link>}
        </div>

        <section className="mt-6 overflow-hidden rounded-[28px] bg-[#111111] p-7 text-white">
          <p className="text-sm text-white/60">{b.name}</p>
          <h1 className="mt-1 text-[30px] font-bold leading-tight tracking-[-0.02em]" data-testid="billing-title">
            {b.status === "paused" ? "Your account is paused" : ended ? "Your subscription has ended" : "Your subscription"}
          </h1>
          <p className="mt-2 text-[15px] text-white/75">
            {ended
              ? "Everything is safe and nothing has been deleted. Renew to unlock the app straight away."
              : b.paid_until ? `Paid until ${fmtDate(b.paid_until)}${b.days_left !== null ? ` (${b.days_left} day${b.days_left === 1 ? "" : "s"} left)` : ""}.` : "No end date."}
          </p>
          {b.status === "paused" && <p className="mt-2 text-sm text-white/60">ÌṢÚRA paused this account. Contact ÌṢÚRA if you think this is a mistake.</p>}
          <p className="mt-6 text-xs uppercase tracking-[0.16em] text-white/50">{TAGLINE}</p>
        </section>

        {error && <p role="alert" className="mt-4 rounded-2xl bg-bad-bg px-4 py-3 text-sm text-bad">{error}</p>}

        <section className="mt-4 rounded-[28px] bg-white p-6 ring-1 ring-black/5">
          {monthly <= 0 ? (
            <p className="text-sm text-[#111111]/70">No price is set for this subscription yet. Contact ÌṢÚRA to renew.</p>
          ) : !owner ? (
            <p className="text-sm text-[#111111]/70">Only the business owner can renew. Ask them to sign in and pay; the app unlocks for everyone as soon as they do.</p>
          ) : !key ? (
            <p className="text-sm text-[#111111]/70">Online payment isn&apos;t switched on yet. Contact ÌṢÚRA to renew.</p>
          ) : (
            <PayButton monthly={monthly} />
          )}
        </section>

        {payments.length > 0 && (
          <section className="mt-4 rounded-[28px] bg-white p-6 ring-1 ring-black/5">
            <h2 className="font-semibold">Payments</h2>
            <ul className="mt-3 divide-y divide-black/5 text-sm">
              {payments.map((p) => (
                <li key={p.reference} className="flex items-center justify-between gap-3 py-2.5">
                  <span>{new Date(p.paid_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} · {p.months} month{p.months === 1 ? "" : "s"}{p.method === "manual" ? " (recorded by ÌṢÚRA)" : ""}</span>
                  <strong className="tabular-nums">{formatMoney(Number(p.amount_kobo) / 100, "₦")}</strong>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
