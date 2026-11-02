"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Plus, Trash2, RefreshCcw } from "@/components/hand-icons";
import { StockOutIcon } from "@/components/icons";
import { ItemPicker, type PickerItem } from "./item-picker";
import { Button, Field, Input, Select, Spinner, StatusBadge, buttonClass } from "./ui/primitives";
import { useToast } from "./ui/toast";
import { useApp } from "./app-context";
import { WhenPicker, nowLocalInput } from "./stock-move-form";
import { SuccessCheck } from "./motion";
import { api, newRequestId } from "@/lib/client";
import { add, cmp, isValidQty, mulFactor } from "@/lib/decimal";
import { STOCK_OUT_REASONS, formatMoney, formatQty, reasonLabel, type StockStatus } from "@/lib/format";

const MAX_LINES = 20;

type UnitOpt = { unit_id: number; symbol: string; name: string; factor: string; is_base: boolean; allow_decimal: boolean };
type LineItem = PickerItem & { avg_cost: string; unit_id: number; archived_at: string | null; allow_fraction: boolean };
type Line = {
  key: string;
  item: LineItem | null;
  units: UnitOpt[];
  loading: boolean;
  qty: string;
  unitId: number | null;
  reason: string;
  notes: string;
  requestId: string;
};
type Worker = { id: number; name: string; department: string | null };
type Saved = { id: string; name: string; quantity: string; unit_symbol: string; status: StockStatus };

const blankLine = (reason = ""): Line => ({
  key: newRequestId(), item: null, units: [], loading: false, qty: "", unitId: null, reason, notes: "", requestId: newRequestId(),
});

/**
 * One worker takes out several items at once: pick the worker, then add up to 20 lines, each with its own item,
 * quantity, unit and reason. Everything is saved together, so either all lines are recorded or none.
 */
export function StockOutBatchForm() {
  const app = useApp();
  const canBackdate = app.can("stock.backdate");
  const toast = useToast();
  const router = useRouter();
  const sym = app.currencySymbol;

  const [workers, setWorkers] = useState<Worker[]>([]);
  const [workerId, setWorkerId] = useState("");
  const [recipient, setRecipient] = useState("");
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
    api<{ workers: Worker[] }>("/api/workers").then((d) => setWorkers(d.workers)).catch(() => {});
  }, []);

  const patch = (key: string, p: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...p } : l)));

  const pickItem = async (key: string, it: PickerItem) => {
    patch(key, { loading: true });
    setError(null);
    try {
      const d = await api<{ item: LineItem; units: UnitOpt[] }>(`/api/items/${it.id}`);
      patch(key, { item: d.item, units: d.units, unitId: d.item.unit_id, loading: false });
    } catch (e) {
      toast.error("Couldn't load that item", (e as Error).message);
      patch(key, { loading: false });
    }
  };

  const addLine = () => setLines((ls) => (ls.length >= MAX_LINES ? ls : [...ls, blankLine(ls[ls.length - 1]?.reason ?? "")]));
  const removeLine = (key: string) => setLines((ls) => (ls.length === 1 ? [blankLine()] : ls.filter((l) => l.key !== key)));
  const setAllReasons = (reason: string) => setLines((ls) => ls.map((l) => ({ ...l, reason })));

  // ------------------------------------------------------------ checks
  const filled = lines.filter((l) => l.item);
  const baseQty = (l: Line) => {
    const u = l.units.find((x) => x.unit_id === l.unitId);
    return isValidQty(l.qty) && u ? mulFactor(l.qty.replace(/,/g, ""), u.factor) : null;
  };
  // Total asked per item (the same item can appear on more than one line).
  const asked = new Map<string, string>();
  for (const l of filled) {
    const q = baseQty(l);
    if (q) asked.set(l.item!.id, add(asked.get(l.item!.id) ?? "0", q));
  }
  const lineProblem = (l: Line): string | null => {
    if (!l.item) return null;
    if (l.item.archived_at) return "This item is archived.";
    const u = l.units.find((x) => x.unit_id === l.unitId);
    if (!isValidQty(l.qty)) return "Enter a quantity.";
    if (u && !u.allow_decimal && Number(l.qty) % 1 !== 0) return `${u.name} must be a whole number.`;
    const q = baseQty(l);
    if (q && !l.item.allow_fraction && q.includes(".")) return `Counted in whole ${l.item.unit_symbol} only.`;
    const total = asked.get(l.item.id);
    if (total && cmp(total, l.item.quantity) > 0) return `Only ${formatQty(l.item.quantity)} ${l.item.unit_symbol} available.`;
    if (!l.reason) return "Choose a reason.";
    if (l.reason === "other" && !l.notes.trim()) return "Add a note for 'Other'.";
    return null;
  };
  const problems: string[] = [];
  if (!workerId) problems.push("Choose the worker taking the items.");
  if (!filled.length) problems.push("Add at least one item.");
  filled.forEach((l, i) => { const p = lineProblem(l); if (p) problems.push(`Line ${i + 1}, ${l.item!.name}: ${p}`); });
  if (dateTouched && occurredAt && new Date(occurredAt).getTime() > Date.now() + 5 * 60000) problems.push("The date can't be in the future.");

  const lineValue = (l: Line) => { const q = baseQty(l); return q && l.item ? Number(q) * Number(l.item.avg_cost) : 0; };
  const totalValue = filled.reduce((a, l) => a + lineValue(l), 0);
  const worker = workers.find((w) => String(w.id) === workerId);

  const review = () => {
    setTouched(true);
    setError(null);
    if (problems.length) return;
    // Drop empty lines before reviewing.
    setLines((ls) => ls.filter((l) => l.item));
    setStep("confirm");
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ txns: { txn_no: string; item_id: string }[]; items: Saved[] }>("/api/stock/out/batch", {
        method: "POST",
        json: {
          worker_id: workerId || null, recipient, reference,
          occurred_at: dateTouched && occurredAt ? new Date(occurredAt).toISOString() : null,
          lines: filled.map((l) => ({ item_id: l.item!.id, quantity: l.qty, unit_id: l.unitId, reason: l.reason, notes: l.notes, request_id: l.requestId })),
        },
      });
      setSaved(res);
      setStep("done");
      toast.success("Stock out recorded", `${res.txns.length} item${res.txns.length === 1 ? "" : "s"} taken out by ${worker?.name ?? "the worker"}.`);
      router.refresh();
    } catch (e) {
      const err = e as Error & { data?: { line?: number } };
      setError({ message: err.message, line: err.data?.line });
      setStep("edit");
      // Refresh balances: someone else may have just issued stock.
      for (const l of filled) pickItem(l.key, l.item!);
    } finally {
      setBusy(false);
    }
  };

  const startOver = () => {
    setLines([blankLine()]); setWorkerId(""); setRecipient(""); setReference("");
    setOccurredAt(nowLocalInput()); setDateTouched(false); setTouched(false); setError(null); setSaved(null); setStep("edit");
  };

  // ------------------------------------------------------------ done
  if (step === "done" && saved) {
    const byId = new Map(saved.items.map((i) => [i.id, i]));
    return (
      <div data-testid="batch-done">
        <SuccessCheck className="mb-3 size-14" />
        <p className="font-display text-xl font-bold">Stock out recorded</p>
        <p className="mt-1 text-sm text-muted">{saved.txns.length} item{saved.txns.length === 1 ? "" : "s"} taken out by {worker?.name}.</p>
        <ul className="mt-4 divide-y divide-black/5 overflow-hidden rounded-2xl bg-white ring-1 ring-black/5">
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
                    <span className="text-muted">Left: <b className="text-ink">{formatQty(it.quantity)} {it.unit_symbol}</b></span>
                    <StatusBadge status={it.status} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <Button onClick={startOver}><RefreshCcw className="size-4" /> Record another worker</Button>
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
          <p className="font-semibold">Take out {filled.length} item{filled.length === 1 ? "" : "s"} for {worker?.name}?</p>
          {(recipient || reference || dateTouched) && (
            <p className="mt-1 text-sm text-muted">
              {[recipient && `To ${recipient}`, reference && `Ref ${reference}`, dateTouched && occurredAt && new Date(occurredAt).toLocaleString()].filter(Boolean).join(" · ")}
            </p>
          )}
          <ol className="mt-3 divide-y divide-black/5 rounded-2xl bg-white/80 text-sm">
            {filled.map((l, i) => (
              <li key={l.key} className="grid grid-cols-[1.5rem_1fr_auto] gap-2 px-3 py-2">
                <span className="text-muted">{i + 1}</span>
                <span className="min-w-0">
                  <b className="block truncate">{l.item!.name}</b>
                  <span className="text-xs text-muted">{reasonLabel(l.reason)}{l.notes ? ` · ${l.notes}` : ""}</span>
                </span>
                <span className="text-right font-semibold">{formatQty(l.qty)} {l.units.find((u) => u.unit_id === l.unitId)?.symbol}</span>
              </li>
            ))}
          </ol>
          <p className="mt-3 flex justify-between text-sm font-semibold"><span>Total value (average cost)</span><span>{formatMoney(totalValue, sym)}</span></p>
        </div>
        {error && <p role="alert" className="mt-3 rounded-2xl bg-bad-bg px-3 py-2 text-sm text-bad">{error.message}</p>}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" size="lg" onClick={() => setStep("edit")} disabled={busy}>Back</Button>
          <Button variant="accent" size="lg" onClick={submit} loading={busy} data-testid="confirm-batch">
            <StockOutIcon className="size-5" /> Confirm stock out
          </Button>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------ edit
  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Worker taking the items" htmlFor="worker" required
          error={touched && !workerId ? "Choose the worker." : null}
          hint={workers.length ? undefined : app.can("workers.manage") ? <>No workers yet. <a href="/workers" className="font-semibold text-burgundy underline">Add workers</a></> : "No workers added yet"}>
          <Select id="worker" value={workerId} onChange={(e) => setWorkerId(e.target.value)} className="h-12 font-semibold">
            <option value="">Choose a worker</option>
            {workers.map((w) => <option key={w.id} value={w.id}>{w.name}{w.department ? ` (${w.department})` : ""}</option>)}
          </Select>
        </Field>
        <Field label="Same reason for every line" htmlFor="all-reason">
          <Select id="all-reason" value="" onChange={(e) => e.target.value && setAllReasons(e.target.value)} className="h-12">
            <option value="">Set all lines to…</option>
            {STOCK_OUT_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </Select>
        </Field>
      </div>

      <div className="mt-5 space-y-3">
        {lines.map((l, i) => {
          const problem = touched ? lineProblem(l) : null;
          const failed = error?.line !== undefined && filled[error.line]?.key === l.key;
          return (
            <div key={l.key} data-testid="batch-line"
              className={clsx("pop-in rounded-2xl bg-white p-3 ring-1 transition", problem || failed ? "ring-bad/50" : "ring-black/5")}>
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
                <ItemPicker compact autoFocus={i > 0} onSelect={(it) => pickItem(l.key, it)} placeholder="Search the item taken out" />
              ) : (
                <>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{l.item.name}</p>
                      <p className="text-xs text-muted">Available: {formatQty(l.item.quantity)} {l.item.unit_symbol}</p>
                    </div>
                    <button type="button" onClick={() => patch(l.key, { item: null, units: [], qty: "", unitId: null })}
                      className="shrink-0 text-sm font-semibold text-burgundy hover:underline">Change</button>
                  </div>
                  <div className="mt-3 grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[1fr_auto_1.4fr]">
                    <Input inputMode="decimal" autoComplete="off" autoFocus placeholder="Qty" aria-label={`Quantity for ${l.item.name}`}
                      value={l.qty} onChange={(e) => patch(l.key, { qty: e.target.value.replace(/[^\d.,]/g, "") })}
                      className="h-11 font-semibold" />
                    <Select aria-label="Unit" value={l.unitId ?? ""} onChange={(e) => patch(l.key, { unitId: Number(e.target.value) })} className="h-11 min-w-20 font-semibold">
                      {l.units.map((u) => <option key={u.unit_id} value={u.unit_id}>{u.symbol}</option>)}
                    </Select>
                    <Select aria-label={`Reason for ${l.item.name}`} value={l.reason} onChange={(e) => patch(l.key, { reason: e.target.value })}
                      className="col-span-2 h-11 sm:col-span-1">
                      <option value="">Reason…</option>
                      {STOCK_OUT_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </Select>
                  </div>
                  {(l.reason === "other" || l.notes) && (
                    <Input className="mt-2 h-10" placeholder={l.reason === "other" ? "Explain the reason (required)" : "Note"}
                      value={l.notes} onChange={(e) => patch(l.key, { notes: e.target.value })} />
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
        <Field label="Destination" htmlFor="recipient" hint="e.g. Kitchen, Bar, Branch 2">
          <Input id="recipient" value={recipient} onChange={(e) => setRecipient(e.target.value)} />
        </Field>
        <Field label="Reference" htmlFor="ref" hint="Requisition or receipt number">
          <Input id="ref" value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>
        {canBackdate && (
          <WhenPicker label="When were they taken out?" value={occurredAt} touched={dateTouched} canBackdate
            onChange={(v, t) => { setOccurredAt(v); setDateTouched(t); }} />
        )}
      </div>

      {error && <p role="alert" className="mt-4 rounded-2xl bg-bad-bg px-3 py-2 text-sm text-bad">{error.message}</p>}
      {touched && problems.length > 0 && !error && <p className="mt-4 text-sm text-bad">{problems[0]}</p>}

      <div className="mt-6 flex items-center justify-between gap-3">
        <span className="text-sm text-muted">{filled.length} item{filled.length === 1 ? "" : "s"}{totalValue > 0 ? ` · ${formatMoney(totalValue, sym)}` : ""}</span>
        <Button size="lg" onClick={review} data-testid="review-batch">
          <StockOutIcon className="size-5" /> Review stock out
        </Button>
      </div>
    </div>
  );
}
