"use client";
import { ReceiptActions } from "./email-dialog";
import { Mascot } from "./mascot";
import { StockInIcon, StockOutIcon } from "@/components/icons";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  RefreshCcw,
} from "@/components/hand-icons";
import clsx from "clsx";
import { ItemPicker, type PickerItem } from "./item-picker";
import { Button, Field, Input, Select, Spinner, StatusBadge, Textarea, buttonClass } from "./ui/primitives";
import { useToast } from "./ui/toast";
import { useApp } from "./app-context";
import { api, newRequestId } from "@/lib/client";
import { cmp, isValidQty, mulFactor, sub, add } from "@/lib/decimal";
import { STOCK_OUT_REASONS, formatMoney, formatQty, formatUnitCost, reasonLabel, type StockStatus } from "@/lib/format";

type Mode = "in" | "out";
type FullItem = PickerItem & { avg_cost: string; price: string | null; min_stock_level: string; default_supplier_id: number | null; unit_id: number; archived_at: string | null; allow_fraction: boolean };
type UnitOpt = { unit_id: number; symbol: string; name: string; factor: string; is_base: boolean; allow_decimal: boolean };
type Supplier = { id: number; name: string };

function nowLocalInput() {
  const d = new Date();
  d.setSeconds(0, 0);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

export function StockMoveForm({
  mode, initialItemId, onDone, embedded,
}: {
  mode: Mode;
  initialItemId?: string | null;
  onDone?: (result: { item: FullItem }) => void;
  embedded?: boolean;
}) {
  const app = useApp();
  const canBackdate = app.can("stock.backdate");
  const toast = useToast();
  const router = useRouter();
  const sym = app.currencySymbol;

  const [itemId, setItemId] = useState<string | null>(initialItemId ?? null);
  const [item, setItem] = useState<FullItem | null>(null);
  const [units, setUnits] = useState<UnitOpt[]>([]);
  const [loadingItem, setLoadingItem] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  const [qty, setQty] = useState("");
  const [unitId, setUnitId] = useState<number | null>(null);
  const [cost, setCost] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [supplierName, setSupplierName] = useState("");
  // Filled in after mount: the server's clock/time zone may differ from the browser's.
  const [occurredAt, setOccurredAt] = useState("");
  useEffect(() => setOccurredAt(nowLocalInput()), []);
  const [dateTouched, setDateTouched] = useState(false);
  const [reason, setReason] = useState("");
  const [recipient, setRecipient] = useState("");
  const [workerId, setWorkerId] = useState("");
  const [workers, setWorkers] = useState<{ id: number; name: string; department: string | null }[]>([]);
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");

  const [step, setStep] = useState<"edit" | "confirm" | "done">("edit");
  const [requestId, setRequestId] = useState(newRequestId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [lastTxn, setLastTxn] = useState<{ id: string; txn_no: string } | null>(null);

  const loadItem = useCallback(async (id: string) => {
    setLoadingItem(true);
    setError(null);
    try {
      const data = await api<{ item: FullItem; units: UnitOpt[] }>(`/api/items/${id}`);
      setItem(data.item);
      setUnits(data.units);
      setUnitId(data.item.unit_id);
      if (mode === "in") {
        setCost(Number(data.item.price ?? data.item.avg_cost) > 0 ? trimCost(data.item.price ?? data.item.avg_cost) : "");
        setSupplierId(data.item.default_supplier_id ? String(data.item.default_supplier_id) : "");
      }
    } catch (e) {
      setError((e as Error).message);
      setItemId(null);
    } finally {
      setLoadingItem(false);
    }
  }, [mode]);

  useEffect(() => {
    if (itemId) loadItem(itemId);
    else { setItem(null); setUnits([]); }
  }, [itemId, loadItem]);

  useEffect(() => {
    if (mode !== "out") return;
    api<{ workers: { id: number; name: string; department: string | null }[] }>("/api/workers").then((d) => setWorkers(d.workers)).catch(() => {});
  }, [mode]);

  useEffect(() => {
    if (mode !== "in") return;
    api<{ suppliers: Supplier[] }>("/api/suppliers").then((d) => setSuppliers(d.suppliers)).catch(() => {});
  }, [mode]);

  const unit = units.find((u) => u.unit_id === unitId) ?? null;
  const base = item?.unit_symbol ?? "";

  // When the unit changes, keep the suggested cost meaningful for that unit.
  const changeUnit = (id: number) => {
    setUnitId(id);
    const u = units.find((x) => x.unit_id === id);
    if (mode === "in" && item && Number(item.price ?? item.avg_cost) > 0 && u) setCost(trimCost(String(Number(item.price ?? item.avg_cost) * Number(u.factor))));
  };

  const qtyValid = isValidQty(qty);
  const fractionBlocked =
    qtyValid && unit && !unit.allow_decimal && qty.includes(".") && Number(qty) % 1 !== 0;
  const baseQty = qtyValid && unit ? mulFactor(qty.replace(/,/g, ""), unit.factor) : null;
  const itemFractionBlocked = !!(item && baseQty && !item.allow_fraction && baseQty.includes("."));
  const after = item && baseQty ? (mode === "in" ? add(item.quantity, baseQty) : sub(item.quantity, baseQty)) : null;
  const exceeds = mode === "out" && item && baseQty ? cmp(baseQty, item.quantity) > 0 : false;
  const costValid = mode === "out" || /^\d+(\.\d{1,6})?$/.test(cost.replace(/,/g, ""));
  const lineValue =
    mode === "in"
      ? qtyValid && costValid ? Number(qty.replace(/,/g, "")) * Number(cost.replace(/,/g, "")) : null
      : baseQty && item ? Number(baseQty) * Number(item.avg_cost) : null;

  const problems: string[] = [];
  if (!qtyValid) problems.push("Enter a quantity greater than zero.");
  if (fractionBlocked) problems.push(`${unit?.name} must be a whole number.`);
  if (exceeds) problems.push(`Only ${formatQty(item!.quantity)} ${base} available.`);
  if (!costValid) problems.push("Enter the cost per unit (use 0 if free).");
  if (mode === "out" && !reason) problems.push("Choose a reason.");
  if (mode === "out" && reason === "other" && !notes.trim()) problems.push("Add a note explaining the reason.");
  if (dateTouched && occurredAt && new Date(occurredAt).getTime() > Date.now() + 5 * 60000) problems.push("The date can't be in the future.");
  if (dateTouched && occurredAt && !canBackdate && occurredAt.slice(0, 10) < nowLocalInput().slice(0, 10)) problems.push("Only an owner can record stock for an earlier day.");
  if (itemFractionBlocked) problems.push(`${item!.name} is counted in whole ${base} only.`);

  const review = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    setError(null);
    if (problems.length) return;
    setStep("confirm");
  };

  const submit = async () => {
    if (!item || !unit) return;
    setBusy(true);
    setError(null);
    try {
      const body =
        mode === "in"
          ? {
              item_id: item.id, quantity: qty, unit_id: unit.unit_id, unit_cost: cost || "0",
              supplier_id: supplierId || null, supplier_name: supplierId ? null : supplierName,
              // Untouched date means "now": let the server stamp the exact time.
              occurred_at: dateTouched && occurredAt ? new Date(occurredAt).toISOString() : null,
              reference, notes, request_id: requestId,
            }
          : {
              item_id: item.id, quantity: qty, unit_id: unit.unit_id, reason, recipient, reference, notes, request_id: requestId,
              worker_id: workerId || null,
              occurred_at: dateTouched && occurredAt ? new Date(occurredAt).toISOString() : null,
            };
      const res = await api<{ txn: { id: string; txn_no: string }; item: FullItem }>(`/api/stock/${mode}`, { method: "POST", json: body });
      setItem(res.item);
      setLastTxn(res.txn);
      setStep("done");
      toast.success(
        mode === "in" ? "Stock in recorded" : "Stock out recorded",
        `${res.txn.txn_no} · ${res.item.name} now has ${formatQty(res.item.quantity)} ${res.item.unit_symbol}.`,
      );
      router.refresh();
      onDone?.({ item: res.item });
    } catch (e) {
      const err = e as Error & { data?: { available?: string } };
      setError(err.message);
      setStep("edit");
      // Refresh the balance, someone else may have just issued stock.
      if (item) loadItem(item.id);
    } finally {
      setBusy(false);
    }
  };

  const resetForNext = (keepItem: boolean) => {
    setQty(""); setReference(""); setNotes(""); setRecipient(""); setTouched(false); setError(null);
    setOccurredAt(nowLocalInput());
    setDateTouched(false);
    setRequestId(newRequestId());
    setStep("edit");
    if (!keepItem) { setItemId(null); setReason(""); setWorkerId(""); }
  };

  const verb = mode === "in" ? "Receive" : "Issue";
  const Icon = mode === "in" ? StockInIcon : StockOutIcon;

  // ---------------------------------------------------------------- no item yet
  if (!itemId) {
    return (
      <div>
        <p className="mb-3 text-sm text-muted">
          {mode === "in" ? "Find the item you're receiving." : "Find the item you're issuing."}
        </p>
        <ItemPicker
          autoFocus
          onSelect={(it) => setItemId(it.id)}
          addNewHref={mode === "in" && app.can("item.write") ? (q) => `/items/new?name=${encodeURIComponent(q)}&then=stock-in` : undefined}
        />
      </div>
    );
  }

  if (loadingItem || !item) {
    return <div className="flex justify-center py-16"><Spinner className="size-7" /></div>;
  }

  if (item.archived_at) {
    return (
      <div className="rounded-2xl bg-warn-bg p-4 text-sm text-warn">
        <strong>{item.name}</strong> is archived, so stock can&apos;t be moved. An owner can restore it from the item page.
        <div className="mt-3"><Button variant="secondary" size="sm" onClick={() => setItemId(null)}>Choose another item</Button></div>
      </div>
    );
  }

  // ---------------------------------------------------------------- done
  if (step === "done") {
    return (
      <div className="text-center">
        <Mascot mood="excited" className="mx-auto h-32 w-28" label="Velvy celebrating" />
        <p className="mt-3 font-display text-xl font-bold">{mode === "in" ? "Stock received" : "Stock issued"}</p>
        <p className="mt-1 text-sm text-muted">Transaction {lastTxn?.txn_no}</p>
        <div className="mx-auto mt-5 max-w-xs rounded-3xl bg-white/80 p-5 shadow-sm">
          <p className="text-sm text-muted">{item.name}: balance now</p>
          <p className="font-display text-4xl font-bold tracking-tight">
            {formatQty(item.quantity)} <span className="text-xl text-muted">{base}</span>
          </p>
          <div className="mt-2 flex justify-center"><StatusBadge status={item.status as StockStatus} /></div>
        </div>
        {lastTxn && (
          <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row" data-testid="receipt-actions">
            <ReceiptActions txnId={lastTxn.id} txnNo={lastTxn.txn_no} canEmail={app.can("mail.send")} />
          </div>
        )}
        <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
          <Button onClick={() => resetForNext(true)}><RefreshCcw className="size-4" /> {verb} more {item.name}</Button>
          <Button variant="secondary" onClick={() => resetForNext(false)}>Choose another item</Button>
          {!embedded && <Link href={`/items/${item.id}`} className={buttonClass("ghost")}>View item</Link>}
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------- edit / confirm
  return (
    <form onSubmit={review} noValidate>
      {/* Ledger slip: the balance before and after this movement */}
      <div className="overflow-hidden rounded-3xl bg-white/80 shadow-sm ring-1 ring-white">
        <div className="flex items-start justify-between gap-3 border-b border-white/80 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate font-semibold">{item.name}</p>
            <p className="text-xs text-muted">{item.sku}{item.category_name ? ` · ${item.category_name}` : ""}</p>
          </div>
          {step === "edit" && (
            <button type="button" onClick={() => { setItemId(null); setStep("edit"); }} className="shrink-0 text-sm font-semibold text-burgundy hover:underline">
              Change item
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 items-center divide-x divide-white/80 px-4 py-4">
          <div>
            <p className="text-xs text-muted">Available now</p>
            <p className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
              {formatQty(item.quantity)}<span className="ml-1 text-base font-semibold text-muted">{base}</span>
            </p>
          </div>
          <div className="pl-4 text-right">
            <p className="text-xs text-muted">After this {mode === "in" ? "receipt" : "issue"}</p>
            <p className={clsx("font-display text-3xl font-bold tracking-tight sm:text-4xl", exceeds ? "text-bad" : after ? "text-burgundy" : "text-line")}>
              {after && !exceeds ? formatQty(after) : "-"}<span className="ml-1 text-base font-semibold text-muted">{base}</span>
            </p>
          </div>
        </div>
        {baseQty && unit && !unit.is_base && (
          <p className="border-t border-white/80 px-4 py-2 text-xs text-muted">
            {formatQty(qty)} {unit.symbol} = {formatQty(baseQty)} {base} (1 {unit.symbol} = {formatQty(unit.factor)} {base})
          </p>
        )}
      </div>

      {step === "confirm" ? (
        <div className="mt-5">
          <div className="rounded-3xl bg-rose p-5 ring-1 ring-burgundy/15">
            <p className="font-semibold">
              {verb} {formatQty(qty)} {unit?.symbol} of {item.name}
              {mode === "out" ? ` for ${reasonLabel(reason).toLowerCase()}` : ""}
              {mode === "out" && workerId ? ` taken by ${workers.find((w) => String(w.id) === workerId)?.name ?? ""}` : ""}
              {mode === "out" && recipient ? ` to ${recipient}` : ""}?
            </p>
            {dateTouched && occurredAt && occurredAt.slice(0, 10) < nowLocalInput().slice(0, 10) && (
              <p className="mt-3 rounded-xl bg-burgundy px-3 py-2 text-sm font-semibold text-paper" data-testid="backdate-note">
                Recording for {new Date(occurredAt).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}. It will show in that day&apos;s report.
              </p>
            )}
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              {mode === "in" ? (
                <>
                  <dt className="text-muted">Cost per {unit?.symbol}</dt><dd className="text-right">{formatUnitCost(cost || 0, sym)}</dd>
                  <dt className="text-muted">Supplier / source</dt><dd className="text-right">{suppliers.find((s) => String(s.id) === supplierId)?.name ?? (supplierName || "-")}</dd>
                  <dt className="text-muted">Received</dt><dd className="text-right">{dateTouched && occurredAt ? new Date(occurredAt).toLocaleString() : "Now"}</dd>
                </>
              ) : (
                <>
                  {dateTouched && occurredAt && <><dt className="text-muted">Taken out</dt><dd className="text-right">{new Date(occurredAt).toLocaleString()}</dd></>}
                  <dt className="col-span-2 text-xs text-muted">Valued at weighted-average cost: {formatUnitCost(item.avg_cost, sym)} / {base}.</dt>
                </>
              )}
              <dt className="font-semibold">Total value</dt>
              <dd className="text-right font-semibold">{lineValue !== null ? formatMoney(lineValue, sym) : "-"}</dd>
            </dl>
          </div>
          {error && <p role="alert" className="mt-3 rounded-2xl bg-bad-bg px-3 py-2 text-sm text-bad">{error}</p>}
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" size="lg" onClick={() => setStep("edit")} disabled={busy}>Back</Button>
            <Button type="button" variant={mode === "out" ? "accent" : "primary"} size="lg" onClick={submit} loading={busy} data-testid="confirm-stock">
              <Icon className="size-5" /> Confirm {mode === "in" ? "stock in" : "stock out"}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="mt-5 grid grid-cols-[1fr_auto] gap-3">
            <Field label={mode === "in" ? "Quantity received" : "Quantity to issue"} htmlFor="qty" required
              error={touched && (!qtyValid || fractionBlocked) ? (fractionBlocked ? `${unit?.name} must be a whole number.` : "Enter a quantity greater than zero.") : null}>
              <Input
                id="qty" inputMode="decimal" autoComplete="off" autoFocus value={qty}
                onChange={(e) => setQty(e.target.value.replace(/[^\d.,]/g, ""))}
                placeholder="0"
                className={clsx("h-12 text-lg font-semibold", exceeds && "border-bad focus:border-bad focus:ring-bad/15")}
              />
            </Field>
            <Field label="Unit" htmlFor="unit" required>
              <Select id="unit" value={unitId ?? ""} onChange={(e) => changeUnit(Number(e.target.value))} className="h-12 min-w-24 font-semibold">
                {units.map((u) => (
                  <option key={u.unit_id} value={u.unit_id}>{u.symbol}</option>
                ))}
              </Select>
            </Field>
          </div>
          {exceeds && (
            <p role="alert" className="mt-2 rounded-2xl bg-bad-bg px-3 py-2 text-sm font-medium text-bad">
              Not enough stock. Only {formatQty(item.quantity)} {base} available.
            </p>
          )}

          {mode === "in" ? (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label={`Cost per ${unit?.symbol ?? "unit"} (${sym})`} htmlFor="cost" required
                hint={lineValue !== null ? `Line total ${formatMoney(lineValue, sym)}` : "Use 0 if the stock was free."}
                error={touched && !costValid ? "Enter a valid amount." : null}>
                <Input id="cost" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value.replace(/[^\d.,]/g, ""))} placeholder="0.00" />
              </Field>
              <WhenPicker label="Date & time received" value={occurredAt} touched={dateTouched} canBackdate={canBackdate}
                onChange={(v, t) => { setOccurredAt(v); setDateTouched(t); }} />
              <Field label="Supplier" htmlFor="supplier">
                <Select id="supplier" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                  <option value="">Other / not listed</option>
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
              </Field>
              {!supplierId && (
                <Field label="Source" htmlFor="source" hint="e.g. Market purchase, Transfer from branch">
                  <Input id="source" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} />
                </Field>
              )}
            </div>
          ) : (
            <div className="mt-4">
              <p className="mb-2 text-sm font-medium">Reason <span className="text-burgundy">*</span></p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Reason">
                {STOCK_OUT_REASONS.map((r) => (
                  <button
                    key={r.value} type="button" role="radio" aria-checked={reason === r.value}
                    onClick={() => setReason(r.value)}
                    className={clsx(
                      "h-11 rounded-xl border text-sm font-semibold transition-colors",
                      reason === r.value ? "border-burgundy bg-burgundy text-paper shadow-[0_8px_18px_-12px_rgb(82_8_16/0.8)]" : "border-burgundy/15 bg-paper text-ink hover:border-burgundy/40 hover:text-burgundy",
                    )}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              {touched && !reason && <p className="mt-1.5 text-sm text-bad">Choose a reason.</p>}
              <div className="mt-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Taken by (worker)" htmlFor="worker"
                    hint={workers.length ? "Who collected the items" : app.can("workers.manage") ? <>No workers yet. <a href="/workers" className="font-semibold text-burgundy underline">add workers</a></> : "No workers added yet"}>
                    <Select id="worker" value={workerId} onChange={(e) => setWorkerId(e.target.value)}>
                      <option value="">Not recorded</option>
                      {workers.map((w) => <option key={w.id} value={w.id}>{w.name}{w.department ? ` (${w.department})` : ""}</option>)}
                    </Select>
                  </Field>
                  <Field label="Destination" htmlFor="recipient" hint="e.g. Kitchen, Branch 2, customer name">
                    <Input id="recipient" value={recipient} onChange={(e) => setRecipient(e.target.value)} />
                  </Field>
                  {canBackdate && (
                    <WhenPicker label="When was it taken out?" value={occurredAt} touched={dateTouched} canBackdate
                      onChange={(v, t) => { setOccurredAt(v); setDateTouched(t); }} />
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Reference" htmlFor="ref" hint={mode === "in" ? "Invoice or waybill number" : "Requisition or receipt number"}>
              <Input id="ref" value={reference} onChange={(e) => setReference(e.target.value)} />
            </Field>
            <Field label="Note" htmlFor="notes" required={mode === "out" && reason === "other"}
              error={touched && mode === "out" && reason === "other" && !notes.trim() ? "Explain the reason." : null}>
              <Textarea id="notes" rows={1} className="min-h-11" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </div>

          {error && <p role="alert" className="mt-4 rounded-2xl bg-bad-bg px-3 py-2 text-sm text-bad">{error}</p>}
          {touched && problems.length > 0 && !error && (
            <p className="mt-4 text-sm text-bad">{problems[0]}</p>
          )}

          <div className="mt-6 flex justify-end">
            <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={!!exceeds}>
              <Icon className="size-5" /> Review {mode === "in" ? "stock in" : "stock out"}
            </Button>
          </div>
        </>
      )}
    </form>
  );
}

function trimCost(v: string) {
  const n = Number(v);
  return n.toFixed(4).replace(/\.?0+$/, "");
}

/**
 * When the stock moved. Everyone can pick a time earlier today; owners (or people given "Record for an
 * earlier date") also get Yesterday and any earlier day, so a missed day can be filled in and balance.
 */
function WhenPicker({ label, value, touched, canBackdate, onChange }: {
  label: string; value: string; touched: boolean; canBackdate: boolean; onChange: (v: string, touched: boolean) => void;
}) {
  const now = nowLocalInput();
  const today = now.slice(0, 10);
  const yesterdayAt = (() => {
    const d = new Date(); d.setDate(d.getDate() - 1); d.setSeconds(0, 0);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  })();
  const isYesterday = touched && value.slice(0, 10) === yesterdayAt.slice(0, 10);
  const chip = (on: boolean) => `h-9 rounded-xl px-3 text-sm font-semibold ring-1 transition ${on ? "bg-burgundy text-paper ring-burgundy" : "bg-paper text-burgundy ring-burgundy/20 hover:bg-burgundy/5"}`;
  return (
    <Field label={label} htmlFor="when" required
      hint={canBackdate ? "Missed a day? Pick Yesterday or the date it happened. It goes into that day's report." : "Today only. Ask an owner to record an earlier day."}>
      {canBackdate && (
        <div className="mb-2 flex flex-wrap gap-1.5" role="group" aria-label="When">
          <button type="button" className={chip(!touched)} onClick={() => onChange(now, false)}>Now</button>
          <button type="button" className={chip(isYesterday)} onClick={() => onChange(yesterdayAt, true)}>Yesterday</button>
        </div>
      )}
      <Input id="when" type="datetime-local" value={value} max={now} min={canBackdate ? undefined : `${today}T00:00`}
        onChange={(e) => onChange(e.target.value, true)} />
    </Field>
  );
}
