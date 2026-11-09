"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Plus, Trash2, RefreshCcw } from "@/components/hand-icons";
import { StockInIcon } from "@/components/icons";
import { ItemPicker, type PickerItem } from "./item-picker";
import { Button, Field, Input, Select, Spinner, StatusBadge, buttonClass } from "./ui/primitives";
import { useToast } from "./ui/toast";
import { useApp } from "./app-context";
import { WhenPicker, nowLocalInput } from "./stock-move-form";
import { SuccessCheck } from "./motion";
import { api, newRequestId } from "@/lib/client";
import { isValidQty, mulFactor } from "@/lib/decimal";
import { formatMoney, formatQty, type StockStatus } from "@/lib/format";

const MAX_LINES = 20;

type UnitOpt = { unit_id: number; symbol: string; name: string; factor: string; is_base: boolean; allow_decimal: boolean };
type LineItem = PickerItem & { avg_cost: string; price: string | null; unit_id: number; archived_at: string | null; allow_fraction: boolean; default_supplier_id: number | null };
type Line = { key: string; item: LineItem | null; units: UnitOpt[]; loading: boolean; qty: string; unitId: number | null; cost: string; notes: string; requestId: string };
type Supplier = { id: number; name: string };
type Saved = { id: string; name: string; quantity: string; unit_symbol: string; status: StockStatus };

const blankLine = (): Line => ({ key: newRequestId(), item: null, units: [], loading: false, qty: "", unitId: null, cost: "", notes: "", requestId: newRequestId() });
const trimCost = (v: string | number) => String(Math.round(Number(v) * 100) / 100);
const clean = (v: string) => v.replace(/,/g, "");

/** The item's price for the chosen unit, e.g. ₦800 per kg becomes ₦40,000 per 50 kg bag. */
function costFor(item: LineItem, u: UnitOpt | undefined) {
  const base = Number(item.price ?? item.avg_cost);
  return base > 0 && u ? trimCost(base * Number(u.factor)) : "";
}

/**
 * Several items received at once: pick the supplier once, then add up to 20 lines, each with its own item,
 * quantity, unit and cost per unit. Everything is saved together, so either all lines are recorded or none.
 */
export function StockInBatchForm() {
  const app = useApp();
  const canBackdate = app.can("stock.backdate");
  const toast = useToast();
  const router = useRouter();
  const sym = app.currencySymbol;

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [reference, setReference] = useState("");
  const [occurredAt, setOccurredAt] = useState("");
  const [dateTouched, setDateTouched] = useState(false);
  useEffect(() => setOccurredAt(nowLocalInput()), []);
  const [lines, setLines] = useState<Line[]>(() => [blankLine()]);

  const [step, setStep] = useState<"edit" | "confirm" | "done">("edit");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; line?: number } | null>(null);
  const [saved, setSaved] = useState<{ txns: { txn_no: string; item_id: string }[]; items: Saved[] } | null>(null);

  useEffect(() => {
    api<{ suppliers: Supplier[] }>("/api/suppliers").then((d) => setSuppliers(d.suppliers)).catch(() => {});
  }, []);

  const patch = (key: string, p: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...p } : l)));

  const pickItem = async (key: string, it: PickerItem) => {
    patch(key, { loading: true });
    setError(null);
    try {
      const d = await api<{ item: LineItem; units: UnitOpt[] }>(`/api/items/${it.id}`);
      const u = d.units.find((x) => x.unit_id === d.item.unit_id);
      patch(key, { item: d.item, units: d.units, unitId: d.item.unit_id, cost: costFor(d.item, u), loading: false });
      if (!supplierId && !supplierName && d.item.default_supplier_id) setSupplierId(String(d.item.default_supplier_id));
    } catch (e) {
      toast.error("Couldn't load that item", (e as Error).message);
      patch(key, { loading: false });
    }
  };

  const changeUnit = (l: Line, unitId: number) => {
    const u = l.units.find((x) => x.unit_id === unitId);
    patch(l.key, { unitId, cost: l.item ? costFor(l.item, u) || l.cost : l.cost });
  };

  const addLine = () => setLines((ls) => (ls.length >= MAX_LINES ? ls : [...ls, blankLine()]));
  const removeLine = (key: string) => setLines((ls) => (ls.length === 1 ? [blankLine()] : ls.filter((l) => l.key !== key)));

  // ------------------------------------------------------------ checks
  const filled = lines.filter((l) => l.item);
  const lineTotal = (l: Line) => (isValidQty(l.qty) && Number(clean(l.cost)) >= 0 ? Number(clean(l.qty)) * Number(clean(l.cost) || 0) : 0);
  const lineProblem = (l: Line): string | null => {
    if (!l.item) return null;
    if (l.item.archived_at) return "This item is archived.";
    const u = l.units.find((x) => x.unit_id === l.unitId);
    if (!isValidQty(l.qty)) return "Enter a quantity.";
    if (u && !u.allow_decimal && Number(clean(l.qty)) % 1 !== 0) return `${u.name} must be a whole number.`;
    const q = u ? mulFactor(clean(l.qty), u.factor) : null;
    if (q && !l.item.allow_fraction && q.includes(".")) return `Counted in whole ${l.item.unit_symbol} only.`;
    if (l.cost !== "" && !/^\d+(\.\d{1,4})?$/.test(clean(l.cost))) return "Enter a valid cost.";
    return null;
  };
  const problems: string[] = [];
  if (!filled.length) problems.push("Add at least one item.");
  filled.forEach((l, i) => { const p = lineProblem(l); if (p) problems.push(`Line ${i + 1}, ${l.item!.name}: ${p}`); });
  if (dateTouched && occurredAt && new Date(occurredAt).getTime() > Date.now() + 5 * 60000) problems.push("The date can't be in the future.");
  const totalValue = filled.reduce((a, l) => a + lineTotal(l), 0);
  const supplierLabel = suppliers.find((s) => String(s.id) === supplierId)?.name ?? supplierName;

  const review = () => {
    setTouched(true);
    setError(null);
    if (problems.length) return;
    setLines((ls) => ls.filter((l) => l.item));
    setStep("confirm");
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ txns: { txn_no: string; item_id: string }[]; items: Saved[] }>("/api/stock/in/batch", {
        method: "POST",
        json: {
          supplier_id: supplierId || null, supplier_name: supplierId ? null : supplierName, reference,
          occurred_at: dateTouched && occurredAt ? new Date(occurredAt).toISOString() : null,
          lines: filled.map((l) => ({ item_id: l.item!.id, quantity: clean(l.qty), unit_id: l.unitId, unit_cost: clean(l.cost) || "0", notes: l.notes, request_id: l.requestId })),
        },
      });
      setSaved(res);
      setStep("done");
      toast.success("Stock in recorded", `${res.txns.length} item${res.txns.length === 1 ? "" : "s"} received${supplierLabel ? ` from ${supplierLabel}` : ""}.`);
      router.refresh();
    } catch (e) {
      const err = e as Error & { data?: { line?: number } };
      setError({ message: err.message, line: err.data?.line });
      setStep("edit");
    } finally {
      setBusy(false);
    }
  };

  const startOver = () => {
    setLines([blankLine()]); setSupplierId(""); setSupplierName(""); setReference("");
    setOccurredAt(nowLocalInput()); setDateTouched(false); setTouched(false); setError(null); setSaved(null); setStep("edit");
  };

  // ------------------------------------------------------------ done
  if (step === "done" && saved) {
    const byId = new Map(saved.items.map((i) => [i.id, i]));
    return (
      <div data-testid="batch-done">
        <SuccessCheck className="mb-3 size-14" />
        <p className="font-display text-xl font-bold">Stock in recorded</p>
        <p className="mt-1 text-sm text-muted">{saved.txns.length} item{saved.txns.length === 1 ? "" : "s"} received{supplierLabel ? ` from ${supplierLabel}` : ""} · {formatMoney(totalValue, sym)}</p>
        <ul className="mt-4 divide-y divide-black/5 overflow-hidden rounded-2xl bg-paper ring-1 ring-black/5">
          {saved.txns.map((t) => {
            const it = byId.get(t.item_id);
            return (
              <li key={t.txn_no} className="pop-in flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{it?.name}</p>
                  <p className="text-xs text-muted">{t.txn_no}</p>
                </div>
                {it && (
                  <div className="flex shrink-0 items-center gap-2 text-right">
                    <span className="text-muted">Now: <b className="text-ink">{formatQty(it.quantity)} {it.unit_symbol}</b></span>
                    <StatusBadge status={it.status} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <Button onClick={startOver}><RefreshCcw className="size-4" /> Record another delivery</Button>
          <Link href="/transactions" className={buttonClass("secondary")}>View transactions</Link>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------ confirm
  if (step === "confirm") {
    return (
      <div>
        <div className="rounded-3xl bg-rose p-5 ring-1 ring-burgundy/15">
          <p className="font-semibold">Receive {filled.length} item{filled.length === 1 ? "" : "s"}{supplierLabel ? ` from ${supplierLabel}` : ""}?</p>
          {(reference || dateTouched) && (
            <p className="mt-1 text-sm text-muted">
              {[reference && `Ref ${reference}`, dateTouched && occurredAt && new Date(occurredAt).toLocaleString()].filter(Boolean).join(" · ")}
            </p>
          )}
          <ol className="mt-3 divide-y divide-black/5 rounded-2xl bg-paper/80 text-sm">
            {filled.map((l, i) => {
              const u = l.units.find((x) => x.unit_id === l.unitId)?.symbol;
              return (
                <li key={l.key} className="grid grid-cols-[1.5rem_1fr_auto] gap-2 px-3 py-2">
                  <span className="text-muted">{i + 1}</span>
                  <span className="min-w-0">
                    <b className="block truncate">{l.item!.name}</b>
                    <span className="text-xs text-muted">{formatQty(clean(l.qty))} {u} × {formatMoney(clean(l.cost) || 0, sym)}{l.notes ? ` · ${l.notes}` : ""}</span>
                  </span>
                  <span className="text-right font-semibold">{formatMoney(lineTotal(l), sym)}</span>
                </li>
              );
            })}
          </ol>
          <p className="mt-3 flex justify-between text-sm font-semibold"><span>Total cost</span><span>{formatMoney(totalValue, sym)}</span></p>
        </div>
        {error && <p role="alert" className="mt-3 rounded-2xl bg-bad-bg px-3 py-2 text-sm text-bad">{error.message}</p>}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" size="lg" onClick={() => setStep("edit")} disabled={busy}>Back</Button>
          <Button variant="accent" size="lg" onClick={submit} loading={busy} data-testid="confirm-batch">
            <StockInIcon className="size-5" /> Confirm stock in
          </Button>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------ edit
  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Supplier" htmlFor="supplier" hint="Applies to every item below.">
          <Select id="supplier" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="h-12 font-semibold">
            <option value="">No supplier / other</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        {!supplierId && (
          <Field label="Source" htmlFor="source" hint="e.g. Market, another branch">
            <Input id="source" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} className="h-12" />
          </Field>
        )}
      </div>

      <div className="mt-5 space-y-3">
        {lines.map((l, i) => {
          const problem = touched ? lineProblem(l) : null;
          const failed = error?.line !== undefined && filled[error.line]?.key === l.key;
          const u = l.units.find((x) => x.unit_id === l.unitId);
          return (
            <div key={l.key} data-testid="batch-line"
              className={clsx("pop-in rounded-2xl bg-paper p-3 ring-1 transition", problem || failed ? "ring-bad/50" : "ring-black/5")}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wide text-muted">Item {i + 1}</span>
                <button type="button" onClick={() => removeLine(l.key)} aria-label={`Remove item ${i + 1}`}
                  className="flex size-8 items-center justify-center rounded-lg text-muted hover:bg-black/5 hover:text-bad">
                  <Trash2 className="size-4" />
                </button>
              </div>
              {l.loading ? (
                <div className="flex justify-center py-4"><Spinner className="size-5" /></div>
              ) : !l.item ? (
                <ItemPicker compact autoFocus={i > 0} onSelect={(it) => pickItem(l.key, it)} placeholder="Search the item received" />
              ) : (
                <>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{l.item.name}</p>
                      <p className="text-xs text-muted">In stock now: {formatQty(l.item.quantity)} {l.item.unit_symbol}</p>
                    </div>
                    <button type="button" onClick={() => patch(l.key, { item: null, units: [], qty: "", unitId: null, cost: "" })}
                      className="shrink-0 text-sm font-semibold text-burgundy hover:underline">Change</button>
                  </div>
                  <div className="mt-3 grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[1fr_auto_1.3fr]">
                    <Input inputMode="decimal" autoComplete="off" autoFocus placeholder="Qty" aria-label={`Quantity for ${l.item.name}`}
                      value={l.qty} onChange={(e) => patch(l.key, { qty: e.target.value.replace(/[^\d.,]/g, "") })}
                      className="h-11 font-semibold" />
                    <Select aria-label="Unit" value={l.unitId ?? ""} onChange={(e) => changeUnit(l, Number(e.target.value))} className="h-11 min-w-20 font-semibold">
                      {l.units.map((x) => <option key={x.unit_id} value={x.unit_id}>{x.symbol}</option>)}
                    </Select>
                    <div className="relative col-span-2 sm:col-span-1">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted">{sym}</span>
                      <Input inputMode="decimal" autoComplete="off" placeholder="Cost" aria-label={`Cost per ${u?.symbol ?? "unit"} for ${l.item.name}`}
                        value={l.cost} onChange={(e) => patch(l.key, { cost: e.target.value.replace(/[^\d.,]/g, "") })}
                        className="h-11 pl-8 pr-16 font-semibold" />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">per {u?.symbol}</span>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                    <button type="button" onClick={() => patch(l.key, { notes: l.notes ? "" : " " })} className="font-semibold text-muted hover:text-ink">
                      {l.notes ? "Remove note" : "+ Add note"}
                    </button>
                    <span className="text-muted">Line total: <b className="text-ink">{formatMoney(lineTotal(l), sym)}</b></span>
                  </div>
                  {l.notes !== "" && (
                    <Input className="mt-2 h-10" placeholder="Note" value={l.notes.trimStart()} onChange={(e) => patch(l.key, { notes: e.target.value || " " })} />
                  )}
                  {problem && <p className="mt-2 text-sm text-bad">{problem}</p>}
                </>
              )}
            </div>
          );
        })}
      </div>

      <button type="button" onClick={addLine} disabled={lines.length >= MAX_LINES} data-testid="add-line"
        className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-black/15 text-sm font-semibold text-ink transition hover:border-black/40 disabled:opacity-40">
        <Plus className="size-4" /> {lines.length >= MAX_LINES ? `Maximum of ${MAX_LINES} items reached` : `Add another item (${lines.length}/${MAX_LINES})`}
      </button>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field label="Reference" htmlFor="ref" hint="Invoice or delivery note number">
          <Input id="ref" value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>
        {canBackdate && (
          <WhenPicker label="When were they received?" value={occurredAt} touched={dateTouched} canBackdate
            onChange={(v, t) => { setOccurredAt(v); setDateTouched(t); }} />
        )}
      </div>

      {error && <p role="alert" className="mt-4 rounded-2xl bg-bad-bg px-3 py-2 text-sm text-bad">{error.message}</p>}
      {touched && problems.length > 0 && !error && <p className="mt-4 text-sm text-bad">{problems[0]}</p>}

      <div className="mt-6 flex items-center justify-between gap-3">
        <span className="text-sm text-muted">{filled.length} item{filled.length === 1 ? "" : "s"}{totalValue > 0 ? ` · ${formatMoney(totalValue, sym)}` : ""}</span>
        <Button size="lg" onClick={review} data-testid="review-batch">
          <StockInIcon className="size-5" /> Review stock in
        </Button>
      </div>
    </div>
  );
}
