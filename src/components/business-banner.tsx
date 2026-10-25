"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useApp } from "./app-context";
import { api } from "@/lib/client";

/**
 * Top-of-page notices: the ÌṢÚRA admin viewing another business, or the subscription ending soon.
 */
export function BusinessBanner() {
  const app = useApp();
  const router = useRouter();
  const u = app.user;
  if (u.is_platform_admin && u.store_id !== u.home_store_id) {
    return (
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#111111] px-4 py-3 text-sm text-white" data-testid="viewing-banner">
        <span>You&apos;re viewing <strong>{u.store_name}</strong> as the ÌṢÚRA admin. Anything you record is saved to this business.</span>
        <span className="flex gap-2">
          <Link href="/isura" className="rounded-lg bg-white/10 px-3 py-1.5 font-semibold hover:bg-white/20">ÌṢÚRA admin</Link>
          <button type="button" className="rounded-lg bg-white px-3 py-1.5 font-semibold text-[#111111]"
            onClick={async () => { await api("/api/isura/open", { method: "POST", json: { store_id: u.home_store_id } }); router.push("/dashboard"); router.refresh(); }}>
            Back to my business
          </button>
        </span>
      </div>
    );
  }
  if (!u.is_platform_admin && u.paid_until) {
    const days = Math.ceil((new Date(u.paid_until).getTime() - Date.now()) / 86400_000);
    if (days <= 5 && days >= 0) {
      return (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 text-sm ring-2 ring-[#111111]" data-testid="renew-banner">
          <span>Your ÌṢÚRA subscription ends {days === 0 ? "today" : `in ${days} day${days === 1 ? "" : "s"}`}. When it ends, the account is paused until it&apos;s renewed.</span>
          {u.role === "owner" && <Link href="/billing" className="rounded-lg bg-[#111111] px-3 py-1.5 font-semibold text-white">Renew now</Link>}
        </div>
      );
    }
  }
  return null;
}
