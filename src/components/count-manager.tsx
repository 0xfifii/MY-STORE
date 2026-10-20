"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ClipboardCheck, X } from "@/components/hand-icons";
import { ItemPicker, type PickerItem } from "./item-picker";
import { Button, Field, Input, Textarea } from "./ui/primitives";
import { Modal } from "./ui/dialog";
import { useToast } from "./ui/toast";
import { api } from "@/lib/client";
import { formatQty } from "@/lib/format";

/** Record a physical count: pick an item, type what is on the shelf, save for approval. */
export function CountForm({ symbol }: { symbol: string }) {
  const [item, setItem] = useState<(PickerItem & { cost?: number }) | null>(null);
  const [counted, setCounted] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();
  const toast = useToast();
  const valid = /^\d{1,14}(\.\d{1,6})?$/.test(counted.trim());
  const diff = item && valid ? Number(counted) - Number(item.quantity) : null;

  const save = async () => {
    if (!item) return;
    setBusy(true); setErr(null);
    try {
      const d = await api<{ count_no: string }>("/api/counts", { method: "POST", json: { item_id: item.id, counted_qty: counted.trim(), notes } });
      toast.success(`${d.count_no} saved`, diff === 0 ? "The count matches the balance." : "Waiting for approval before the balance changes.");
      setItem(null); setCounted(""); setNotes("");
      router.refresh();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  if (!item) {
    return (
      <div>
        <p className="mb-3 text-sm text-muted">Find the item you counted on the shelf.</p>
        <ItemPicker onSelect={(it) => { setItem(it); setErr(null); }} placeholder="Search item to count" />
      </div>
    );
  }
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (valid) save(); }} className="space-y-4" noValidate>
      <div className="flex items-start justify-between gap-3 rounded-3xl bg-white/80 p-4 ring-1 ring-white">
        <div className="min-w-0">
          <p className="truncate font-semibold">{item.name}</p>
          <p className="text-xs text-muted">{item.sku}{item.category_name ? ` · ${item.category_name}` : ""}</p>
        </div>
        <button type="button" onClick={() => setItem(null)} className="shrink-0 text-sm font-semibold text-burgundy hover:underline">Change item</button>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-2xl bg-white/70 p-3 ring-1 ring-white">
          <p className="text-xs text-muted">System balance</p>
          <p className="text-xl font-semibold">{formatQty(item.quantity)} <span className="text-sm text-muted">{item.unit_symbol}</span></p>
        </div>
        <div className="rounded-2xl bg-white/70 p-3 ring-1 ring-white">
          <p className="text-xs text-muted">Counted</p>
          <p className="text-xl font-semibold">{valid ? formatQty(counted) : "-"} <span className="text-sm text-muted">{item.unit_symbol}</span></p>
        </div>
        <div className={`rounded-2xl p-3 ring-1 ring-white ${diff === null ? "bg-white/70" : diff < 0 ? "bg-bad-bg text-bad" : diff > 0 ? "bg-sky-50 text-sky-700" : "bg-ok-bg text-ok"}`}>
          <p className="text-xs opacity-80">{diff === null ? "Difference" : diff < 0 ? "Shortage" : diff > 0 ? "Excess" : "Matches"}</p>
          <p className="text-xl font-semibold">{diff === null ? "-" : `${diff > 0 ? "+" : diff < 0 ? "−" : ""}${formatQty(String(Math.abs(Math.round(diff * 1e6) / 1e6)))}`}</p>
        </div>
      </div>
      <Field label={`Quantity counted (${item.unit_symbol})`} htmlFor="cnt-q" required>
        <Input id="cnt-q" inputMode="decimal" autoFocus value={counted} onChange={(e) => setCounted(e.target.value.replace(/[^\d.]/g, ""))} placeholder="0" className="text-lg" />
      </Field>
      <Field label="Notes" htmlFor="cnt-n" hint="e.g. 2 bags torn, found extra carton in back store">
        <Textarea id="cnt-n" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      {err && <p role="alert" className="rounded-2xl bg-bad-bg px-3 py-2 text-sm text-bad">{err}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={() => setItem(null)}>Cancel</Button>
        <Button type="submit" loading={busy} disabled={!valid}><ClipboardCheck className="size-4" /> Save count</Button>
      </div>
      <p className="text-xs text-muted">Values use the item&apos;s average cost ({symbol}). The balance only changes when the count is approved.</p>
    </form>
  );
}

export function CountDecision({ id, countNo, summary }: { id: string; countNo: string; summary: string }) {
  const [mode, setMode] = useState<null | "approve" | "reject">(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();
  const toast = useToast();
  const go = async () => {
    setBusy(true); setErr(null);
    try {
      await api(`/api/counts/${id}`, { method: "POST", json: { decision: mode, note } });
      toast.success(mode === "approve" ? `${countNo} approved` : `${countNo} rejected`, mode === "approve" ? "The stock balance has been adjusted." : undefined);
      setMode(null); setNote("");
      router.refresh();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <>
      <div className="flex gap-1.5">
        <button type="button" onClick={() => setMode("approve")} className="inline-flex h-8 items-center gap-1 rounded-full bg-ok px-3 text-xs font-semibold text-white transition hover:brightness-110 active:scale-95"><Check className="size-3.5" /> Approve</button>
        <button type="button" onClick={() => setMode("reject")} className="inline-flex h-8 items-center gap-1 rounded-full bg-white px-3 text-xs font-semibold text-muted ring-1 ring-line transition hover:text-bad active:scale-95"><X className="size-3.5" /> Reject</button>
      </div>
      <Modal open={mode !== null} onClose={() => setMode(null)} title={mode === "approve" ? `Approve ${countNo}?` : `Reject ${countNo}?`} busy={busy}
        footer={<><Button variant="secondary" onClick={() => setMode(null)}>Cancel</Button><Button variant={mode === "approve" ? "primary" : "danger"} onClick={go} loading={busy}>{mode === "approve" ? "Approve and adjust" : "Reject count"}</Button></>}>
        <p className="text-sm">{summary}</p>
        <p className="mt-2 text-sm text-muted">{mode === "approve" ? "The difference is posted to the stock balance as a stock count adjustment and shows in the audit." : "Nothing changes in the stock balance."}</p>
        <div className="mt-4"><Field label="Note (optional)" htmlFor="cd-note"><Textarea id="cd-note" value={note} onChange={(e) => setNote(e.target.value)} /></Field></div>
        {err && <p role="alert" className="mt-3 rounded-2xl bg-bad-bg px-3 py-2 text-sm text-bad">{err}</p>}
      </Modal>
    </>
  );
}
