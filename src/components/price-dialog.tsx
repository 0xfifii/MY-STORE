"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "./ui/dialog";
import { Button, Field, Input, Select, Spinner } from "./ui/primitives";
import { useToast } from "./ui/toast";
import { useApp } from "./app-context";
import { api, newRequestId } from "@/lib/client";
import { formatMoney, formatQty, formatUnitCost } from "@/lib/format";

type UnitOpt = { unit_id: number; symbol: string; name: string; factor: string; is_base: boolean };
type Item = { id: string; name: string; sku: string; quantity: string; stock_value: string; avg_cost: string; unit_symbol: string; unit_id: number };

/**
 * Change the price of an item's stock on hand. Everything already in the store is re-priced, so worth,
 * stock-out values and reports use the new price from now on. Recorded in the item's history.
 */
export function PriceDialog({ itemId, onClose }: { itemId: string; onClose: () => void }) {
  const app = useApp();
  const sym = app.currencySymbol;
  const router = useRouter();
  const toast = useToast();
  const [item, setItem] = useState<Item | null>(null);
  const [units, setUnits] = useState<UnitOpt[]>([]);
  const [unitId, setUnitId] = useState<number | null>(null);
  const [price, setPrice] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [requestId] = useState(newRequestId);

  useEffect(() => {
    api<{ item: Item; units: UnitOpt[] }>(`/api/items/${itemId}`)
      .then((d) => { setItem(d.item); setUnits(d.units); setUnitId(d.item.unit_id); })
      .catch((e) => setErr((e as Error).message));
  }, [itemId]);

  const unit = units.find((u) => u.unit_id === unitId) ?? null;
  const factor = Number(unit?.factor ?? 1);
  const qty = Number(item?.quantity ?? 0);
  const currentPerUnit = Number(item?.avg_cost ?? 0) * factor;
  const p = Number(price);
  const valid = price.trim() !== "" && Number.isFinite(p) && p >= 0;
  const newWorth = valid ? Math.round((qty * (p / factor)) * 100) / 100 : null;
  const oldWorth = Number(item?.stock_value ?? 0);
  const diff = newWorth === null ? null : Math.round((newWorth - oldWorth) * 100) / 100;
  const pct = useMemo(() => (valid && currentPerUnit > 0 ? ((p - currentPerUnit) / currentPerUnit) * 100 : null), [valid, p, currentPerUnit]);

  const save = async () => {
    if (!item || !unit || !valid) return;
    setBusy(true); setErr(null);
    try {
      await api(`/api/items/${item.id}/price`, { method: "POST", json: { unit_id: unit.unit_id, unit_cost: price, reason: reason.trim() || null, request_id: requestId } });
      toast.success("Price updated", `${item.name} is now ${formatUnitCost(price, sym)} per ${unit.symbol}.`);
      onClose();
      router.refresh();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} busy={busy} title={item ? `Change price · ${item.name}` : "Change price"}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={save} loading={busy} disabled={!item || qty <= 0 || !valid || diff === 0}>Save new price</Button></>}>
      {!item ? (
        err ? <p role="alert" className="text-sm text-bad">{err}</p> : <div className="flex justify-center py-8"><Spinner className="size-6" /></div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-2xl bg-burgundy/[0.05] p-3 ring-1 ring-burgundy/10">
              <p className="text-xs text-muted">Current price</p>
              <p className="text-lg font-bold tabular-nums text-burgundy">{formatUnitCost(currentPerUnit, sym)}</p>
              <p className="text-xs text-muted">per {unit?.symbol ?? item.unit_symbol}</p>
            </div>
            <div className="rounded-2xl bg-burgundy/[0.05] p-3 ring-1 ring-burgundy/10">
              <p className="text-xs text-muted">In stock</p>
              <p className="text-lg font-bold tabular-nums">{formatQty(item.quantity)} {item.unit_symbol}</p>
              <p className="text-xs text-muted">worth {formatMoney(item.stock_value, sym)}</p>
            </div>
          </div>

          {qty <= 0 ? (
            <p className="rounded-2xl bg-warn-bg px-4 py-3 text-sm text-warn">
              There is nothing in stock to re-price. Enter the new price when you record the next Stock In.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <Field label={`New price (${sym})`} htmlFor="new-price" required>
                  <Input id="new-price" inputMode="decimal" autoFocus value={price} placeholder={currentPerUnit ? String(Math.round(currentPerUnit * 100) / 100) : "0"}
                    onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ""))} onKeyDown={(e) => { if (e.key === "Enter") save(); }} />
                </Field>
                <Field label="Per" htmlFor="price-unit" required>
                  <Select id="price-unit" value={unitId ?? ""} onChange={(e) => setUnitId(Number(e.target.value))} className="w-28">
                    {units.map((u) => <option key={u.unit_id} value={u.unit_id}>{u.symbol}</option>)}
                  </Select>
                </Field>
              </div>
              <Field label="Why did it change?" htmlFor="price-reason" hint="For example: supplier increased prices">
                <Input id="price-reason" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
              </Field>
              {valid && diff !== null && (
                <div className="rounded-2xl bg-paper p-4 ring-1 ring-burgundy/15" data-testid="price-preview">
                  <p className="text-sm text-muted">Stock worth after the change</p>
                  <p className="mt-0.5 text-sm">
                    <span className="tabular-nums text-muted line-through decoration-burgundy/40">{formatMoney(oldWorth, sym)}</span>
                    {"  →  "}
                    <strong className="text-lg tabular-nums">{formatMoney(newWorth!, sym)}</strong>
                  </p>
                  <p className={`mt-1 text-sm font-semibold ${diff > 0 ? "text-burgundy" : diff < 0 ? "text-ok" : "text-muted"}`}>
                    {diff === 0 ? "No change" : `${diff > 0 ? "+" : "−"}${formatMoney(Math.abs(diff), sym)}`}
                    {pct !== null && diff !== 0 && <span className="font-normal text-muted"> · price {pct > 0 ? "up" : "down"} {Math.abs(pct).toFixed(1)}%</span>}
                  </p>
                  <p className="mt-2 text-xs text-muted">All {formatQty(item.quantity)} {item.unit_symbol} in the store are re-priced. Quantities don&apos;t change. The change is saved in the item&apos;s history and shows in reports as a price change.</p>
                </div>
              )}
            </>
          )}
          {err && <p role="alert" className="text-sm text-bad">{err}</p>}
        </div>
      )}
    </Modal>
  );
}

/** Button that opens the price dialog (shown only to people allowed to change prices). */
export function ChangePriceButton({ itemId, className, label = "Change price", children }: { itemId: string; className?: string; label?: string; children?: React.ReactNode }) {
  const app = useApp();
  const [open, setOpen] = useState(false);
  if (!app.can("price.edit")) return null;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className} aria-label={label} title={label}>{children ?? label}</button>
      {open && <PriceDialog itemId={itemId} onClose={() => setOpen(false)} />}
    </>
  );
}
