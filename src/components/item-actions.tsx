"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Trash2, Undo2, Plus } from "lucide-react";
import { Button, Field, Input, Select, Textarea } from "./ui/primitives";
import { Modal } from "./ui/dialog";
import { useToast } from "./ui/toast";
import { api, newRequestId } from "@/lib/client";
import { formatQty } from "@/lib/format";

export function ArchiveButton({ itemId, archived, name, quantity }: { itemId: string; archived: boolean; name: string; quantity: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const toast = useToast();
  const go = async () => {
    setBusy(true);
    try {
      await api(`/api/items/${itemId}/archive`, { method: "POST", json: { archived: !archived } });
      toast.success(archived ? "Item restored" : "Item archived");
      setOpen(false);
      router.refresh();
    } catch (e) { toast.error("Couldn't update item", (e as Error).message); } finally { setBusy(false); }
  };
  return (
    <>
      <Button variant={archived ? "secondary" : "outline-danger"} onClick={() => setOpen(true)}>
        {archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />} {archived ? "Restore item" : "Archive"}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={archived ? `Restore ${name}?` : `Archive ${name}?`} busy={busy}
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant={archived ? "primary" : "danger"} onClick={go} loading={busy}>{archived ? "Restore item" : "Archive item"}</Button></>}>
        <p className="text-sm">
          {archived
            ? "The item will appear in the inventory list again and stock can be moved."
            : "Archived items are hidden from the inventory list and can't be stocked in or out. Their history stays in reports, and you can restore them later."}
        </p>
        {!archived && Number(quantity) > 0 && (
          <p className="mt-3 rounded-2xl bg-warn-bg px-3 py-2 text-sm text-warn">This item still has {formatQty(quantity)} in stock.</p>
        )}
      </Modal>
    </>
  );
}

export function ReverseButton({ txnId, txnNo, summary }: { txnId: string; txnNo: string; summary: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [requestId, setRequestId] = useState(newRequestId);
  const router = useRouter();
  const toast = useToast();
  const go = async () => {
    setBusy(true); setErr(null);
    try {
      const d = await api<{ txn: { txn_no: string } }>(`/api/transactions/${txnId}/reverse`, { method: "POST", json: { reason, request_id: requestId } });
      toast.success("Transaction reversed", `${d.txn.txn_no} cancels ${txnNo}. Balances have been recalculated.`);
      setOpen(false);
      setReason("");
      setRequestId(newRequestId());
      router.refresh();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <>
      <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold text-muted hover:bg-rose hover:text-burgundy">
        <Undo2 className="size-3.5" /> Reverse
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Reverse ${txnNo}?`} busy={busy}
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Keep it</Button>
          <Button variant="danger" onClick={go} loading={busy} disabled={reason.trim().length < 3}>Reverse transaction</Button></>}>
        <p className="text-sm">{summary}</p>
        <p className="mt-2 text-sm text-muted">
          The original stays in the history. A correction entry is added that undoes its effect on the balance and stock value. This can&apos;t be undone.
        </p>
        <div className="mt-4">
          <Field label="Reason for the correction" htmlFor="rev-reason" required error={err}>
            <Textarea id="rev-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Entered 25 bags instead of 2.5" />
          </Field>
        </div>
      </Modal>
    </>
  );
}

type Conv = { id: number; unit_id: number; symbol: string; name: string; factor: string };

export function ConversionManager({ itemId, baseSymbol, conversions, units, canEdit, globalRules }: {
  itemId: string; baseSymbol: string; conversions: Conv[]; units: { id: number; symbol: string; name: string }[]; canEdit: boolean;
  globalRules: { symbol: string; factor: string }[];
}) {
  const [unitId, setUnitId] = useState("");
  const [factor, setFactor] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const toast = useToast();
  const add = async () => {
    setBusy(true);
    try {
      await api(`/api/items/${itemId}/conversions`, { method: "POST", json: { unit_id: Number(unitId), factor } });
      setUnitId(""); setFactor("");
      toast.success("Conversion saved");
      router.refresh();
    } catch (e) { toast.error("Couldn't save conversion", (e as Error).message); } finally { setBusy(false); }
  };
  const remove = async (id: number) => {
    try {
      await api(`/api/items/${itemId}/conversions`, { method: "DELETE", json: { conversion_id: id } });
      router.refresh();
    } catch (e) { toast.error("Couldn't remove", (e as Error).message); }
  };
  return (
    <div>
      {conversions.length === 0 && globalRules.length === 0 && (
        <p className="text-sm text-muted">Only {baseSymbol} can be used for this item.</p>
      )}
      <ul className="space-y-1.5 text-sm">
        {conversions.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-2">
            <span>1 {c.symbol} = <strong>{formatQty(c.factor)} {baseSymbol}</strong></span>
            {canEdit && (
              <button onClick={() => remove(c.id)} className="rounded p-1 text-muted hover:text-bad" aria-label={`Remove ${c.symbol} conversion`}>
                <Trash2 className="size-4" />
              </button>
            )}
          </li>
        ))}
        {globalRules.map((g) => (
          <li key={g.symbol} className="text-muted">1 {g.symbol} = {formatQty(g.factor)} {baseSymbol} <span className="text-xs">(standard)</span></li>
        ))}
      </ul>
      {canEdit && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span>1</span>
          <Select aria-label="Unit" value={unitId} onChange={(e) => setUnitId(e.target.value)} className="h-9 w-28">
            <option value="">unit…</option>
            {units.map((u) => <option key={u.id} value={u.id}>{u.symbol}</option>)}
          </Select>
          <span>=</span>
          <Input aria-label={`Number of ${baseSymbol}`} inputMode="decimal" value={factor} onChange={(e) => setFactor(e.target.value.replace(/[^\d.]/g, ""))} className="h-9 w-24" />
          <span className="text-muted">{baseSymbol}</span>
          <Button size="sm" variant="secondary" onClick={add} loading={busy} disabled={!unitId || !(Number(factor) > 0)}>
            <Plus className="size-4" /> Add
          </Button>
        </div>
      )}
    </div>
  );
}
