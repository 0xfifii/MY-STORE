"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Plus, Trash2, RefreshCcw, Send } from "@/components/hand-icons";
import { ItemPicker, type PickerItem } from "./item-picker";
import { Button, Field, Input, Select, Spinner, StatusBadge, buttonClass } from "./ui/primitives";
import { useToast } from "./ui/toast";
import { useApp } from "./app-context";
import { SuccessCheck } from "./motion";
import { WhenPicker, nowLocalInput } from "./stock-move-form";
import { api, newRequestId } from "@/lib/client";
import { add, cmp, isValidQty, mulFactor } from "@/lib/decimal";
import { formatMoney, formatQty, type StockStatus } from "@/lib/format";

const MAX_LINES = 50;

type UnitOpt = { unit_id: number; symbol: string; name: string; factor: string; is_base: boolean; allow_decimal: boolean };
type LineItem = PickerItem & { avg_cost: string; unit_id: number; archived_at: string | null; allow_fraction: boolean };
type Line = { key: string; item: LineItem | null; units: UnitOpt[]; loading: boolean; qty: string; unitId: number | null; removeHere: boolean; requestId: string };
type Target = { id: number; name: string; locked: boolean };
type Match = { item_id: string; match: { id: string; name: string; quantity: string; unit_symbol: string; archived: boolean } | null };
export type TransferRow = {
  id: string; transfer_no: string; from_store: number; to_store: number; from_name: string; to_name: string; created_by_name: string | null;
  notes: string | null; created_at: string; occurred_at?: string;
  lines: { name: string; quantity: string; unit_symbol: string; total_value: string; out_txn: string; in_txn: string; created: boolean; archived: boolean }[];
};
type Saved = { id: string; name: string; quantity: string; unit_symbol: string; status: StockStatus };

const blankLine = (): Line => ({ key: newRequestId(), item: null, units: [], loading: false, qty: "", unitId: null, removeHere: false, requestId: newRequestId() });

/**
 * Send stock to another account: pick the account, add items with how many to send (or "All"), review, confirm.
 * The stock leaves this account and arrives in the other one at the same time.
 */
export function TransferForm({ targets, onSent }: { targets: Target[]; onSent?: (t: TransferRow) => void }) {
  const app = useApp();
  const toast = useToast();
  const router = useRouter();
  const sym = app.currencySymbol;

  const [toStore, setToStore] = useState(targets.length === 1 ? String(targets[0].id) : "");
  const [notes, setNotes] = useState("");
  const canBackdate = app.can("stock.backdate");
  const [occurredAt, setOccurredAt] = useState(nowLocalInput);
  const [dateTouched, setDateTouched] = useState(false);
  const when = dateTouched && occurredAt ? new Date(occurredAt) : null;
  const whenText = when ? when.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : null;
  const [lines, setLines] = useState<Line[]>(() => [blankLine()]);
  const [step, setStep] = useState<"edit" | "confirm" | "done">("edit");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; line?: number } | null>(null);
  const [preview, setPreview] = useState<Match[] | null>(null);
  const [requestId, setRequestId] = useState(newRequestId);
  const [saved, setSaved] = useState<{ transfer: TransferRow; items: Saved[] } | null>(null);

  useEffect(() => { setPreview(null); }, [toStore]);

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
  const addLine = () => setLines((ls) => (ls.length >= MAX_LINES ? ls : [...ls, blankLine()]));
  const removeLine = (key: string) => setLines((ls) => (ls.length === 1 ? [blankLine()] : ls.filter((l) => l.key !== key)));
  const sendAll = (l: Line) => l.item && patch(l.key, { qty: formatQty(l.item.quantity).replace(/,/g, ""), unitId: l.item.unit_id });

  // ------------------------------------------------------------ checks
  const filled = lines.filter((l) => l.item);
  const baseQty = (l: Line) => {
    const u = l.units.find((x) => x.unit_id === l.unitId);
    return isValidQty(l.qty) && u ? mulFactor(l.qty.replace(/,/g, ""), u.factor) : null;
  };
  const asked = new Map<string, string>();
  for (const l of filled) { const q = baseQty(l); if (q) asked.set(l.item!.id, add(asked.get(l.item!.id) ?? "0", q)); }
  const isAll = (l: Line) => !!l.item && cmp(asked.get(l.item.id) ?? "0", l.item.quantity) === 0;
  const lineProblem = (l: Line): string | null => {
    if (!l.item) return null;
    if (l.item.archived_at) return "This item is archived.";
    if (cmp(l.item.quantity, "0") <= 0) return "None in stock to send.";
    const u = l.units.find((x) => x.unit_id === l.unitId);
    if (!isValidQty(l.qty)) return "Enter how many to send, or tap All.";
    if (u && !u.allow_decimal && Number(l.qty) % 1 !== 0) return `${u.name} must be a whole number.`;
    const q = baseQty(l);
    if (q && !l.item.allow_fraction && q.includes(".")) return `Counted in whole ${l.item.unit_symbol} only.`;
    const total = asked.get(l.item.id);
    if (total && cmp(total, l.item.quantity) > 0) return `Only ${formatQty(l.item.quantity)} ${l.item.unit_symbol} available.`;
    if (l.removeHere && !isAll(l)) return "To remove it from this account, send all of it.";
    return null;
  };
  const problems: string[] = [];
  if (!toStore) problems.push("Choose the account to send to.");
  if (!filled.length) problems.push("Add at least one item.");
  if (when && when.getTime() > Date.now() + 5 * 60000) problems.push("The date can't be in the future.");
  filled.forEach((l, i) => { const p = lineProblem(l); if (p) problems.push(`Line ${i + 1}, ${l.item!.name}: ${p}`); });

  const lineValue = (l: Line) => { const q = baseQty(l); return q && l.item ? Number(q) * Number(l.item.avg_cost) : 0; };
  const totalValue = filled.reduce((a, l) => a + lineValue(l), 0);
  const target = targets.find((t) => String(t.id) === toStore);

  const review = async () => {
    setTouched(true);
    setError(null);
    if (problems.length) return;
    setLines((ls) => ls.filter((l) => l.item));
    setBusy(true);
    try {
      const p = await api<{ items: Match[] }>("/api/transfers/preview", { method: "POST", json: { to_store: Number(toStore), item_ids: [...new Set(filled.map((l) => l.item!.id))] } });
      setPreview(p.items);
      setStep("confirm");
    } catch (e) {
      setError({ message: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ transfer: TransferRow; items: Saved[] }>("/api/transfers", {
        method: "POST",
        json: {
          to_store: Number(toStore), notes, request_id: requestId, occurred_at: when ? when.toISOString() : null,
          lines: filled.map((l) => ({ item_id: l.item!.id, quantity: l.qty.replace(/,/g, ""), unit_id: l.unitId, request_id: l.requestId, remove_here: l.removeHere })),
        },
      });
      setSaved(res);
      setStep("done");
      onSent?.(res.transfer);
      toast.success("Transfer done", `${res.transfer.lines.length} item${res.transfer.lines.length === 1 ? "" : "s"} sent to ${res.transfer.to_name}.`);
      router.refresh();
    } catch (e) {
      const err = e as Error & { data?: { line?: number } };
      setError({ message: err.message, line: err.data?.line });
      setStep("edit");
      setRequestId(newRequestId());
      for (const l of filled) pickItem(l.key, l.item!);
    } finally {
      setBusy(false);
    }
  };

  const startOver = () => {
    setLines([blankLine()]); setNotes(""); setOccurredAt(nowLocalInput()); setDateTouched(false); setTouched(false); setError(null); setSaved(null); setPreview(null);
    setRequestId(newRequestId()); setStep("edit");
  };

  if (!targets.length) {
    return (
      <div className="rounded-2xl bg-black/[0.03] p-5 text-sm">
        <p className="font-semibold">There&apos;s no other account to send to yet.</p>
        <p className="mt-1 text-muted">{app.user.is_platform_admin
          ? "Add another business on the ÌṢÚRA admin page first."
          : "Ask the ÌṢÚRA admin to link this account to the one you want to send stock to."}</p>
      </div>
    );
  }

  // ------------------------------------------------------------ done
  if (step === "done" && saved) {
    const byId = new Map(saved.items.map((i) => [i.id, i]));
    return (
      <div data-testid="transfer-done">
        <SuccessCheck className="mb-3 size-14" />
        <p className="font-display text-xl font-bold">Sent to {saved.transfer.to_name}</p>
        <p className="mt-1 text-sm text-muted">{saved.transfer.transfer_no} · taken out of this account and added to {saved.transfer.to_name}{whenText ? `, dated ${whenText}` : ""}.</p>
        <ul className="mt-4 divide-y divide-black/5 overflow-hidden rounded-2xl bg-paper ring-1 ring-black/5">
          {saved.transfer.lines.map((t, i) => {
            const it = byId.get(filled[i]?.item?.id ?? "");
            return (
              <li key={t.out_txn} className="pop-in flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{t.name} <span className="font-normal text-muted">× {formatQty(t.quantity)} {t.unit_symbol}</span></p>
                  <p className="text-xs text-muted">{t.out_txn} out · {t.in_txn} in{t.created ? " · new item there" : ""}{t.archived ? " · removed here" : ""}</p>
                </div>
                {it && !t.archived && (
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
          <Button onClick={startOver}><RefreshCcw className="size-4" /> Send more</Button>
          <Link href="/transactions" className={buttonClass("secondary")}>View transactions</Link>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------ confirm
  if (step === "confirm") {
    const m = new Map((preview ?? []).map((p) => [p.item_id, p.match]));
    return (
      <div>
        <div className="rounded-3xl bg-rose p-5 ring-1 ring-burgundy/15">
          <p className="font-semibold">Send {filled.length} item{filled.length === 1 ? "" : "s"} to {target?.name}?</p>
          <p className="mt-1 text-sm text-muted">They&apos;re taken out of this account and added to {target?.name}{whenText ? `, dated ${whenText}` : " now"}.</p>
          <ol className="mt-3 divide-y divide-black/5 rounded-2xl bg-white/80 text-sm">
            {filled.map((l, i) => {
              const there = m.get(l.item!.id);
              return (
                <li key={l.key} className="grid grid-cols-[1.5rem_1fr_auto] gap-2 px-3 py-2">
                  <span className="text-muted">{i + 1}</span>
                  <span className="min-w-0">
                    <b className="block truncate">{l.item!.name}</b>
                    <span className="text-xs text-muted">
                      {there ? `Adds to ${there.name} there (has ${formatQty(there.quantity)} ${there.unit_symbol})` : `New item in ${target?.name}`}
                      {l.removeHere ? " · removed from this account" : ""}
                    </span>
                  </span>
                  <span className="text-right font-semibold">{formatQty(l.qty)} {l.units.find((u) => u.unit_id === l.unitId)?.symbol}</span>
                </li>
              );
            })}
          </ol>
          <p className="mt-3 flex justify-between text-sm font-semibold"><span>Total value (average cost)</span><span>{formatMoney(totalValue, sym)}</span></p>
        </div>
        {error && <p role="alert" className="mt-3 rounded-2xl bg-bad-bg px-3 py-2 text-sm text-bad">{error.message}</p>}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" size="lg" onClick={() => setStep("edit")} disabled={busy}>Back</Button>
          <Button variant="accent" size="lg" onClick={submit} loading={busy} data-testid="confirm-transfer">
            <Send className="size-5" /> Confirm transfer
          </Button>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------ edit
  return (
    <div>
      <Field label="Send to" htmlFor="to-store" required error={touched && !toStore ? "Choose the account to send to." : null}>
        <Select id="to-store" value={toStore} onChange={(e) => setToStore(e.target.value)} className="h-12 font-semibold">
          <option value="">Choose an account</option>
          {targets.map((t) => <option key={t.id} value={t.id}>{t.name}{t.locked ? " (paused)" : ""}</option>)}
        </Select>
      </Field>

      <div className="mt-5 space-y-3">
        {lines.map((l, i) => {
          const problem = touched ? lineProblem(l) : null;
          const failed = error?.line !== undefined && filled[error.line]?.key === l.key;
          return (
            <div key={l.key} data-testid="transfer-line"
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
                <ItemPicker compact autoFocus={i > 0} onSelect={(it) => pickItem(l.key, it)} placeholder="Search the item to send" />
              ) : (
                <>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{l.item.name}</p>
                      <p className="text-xs text-muted">Available: {formatQty(l.item.quantity)} {l.item.unit_symbol}</p>
                    </div>
                    <button type="button" onClick={() => patch(l.key, { item: null, units: [], qty: "", unitId: null, removeHere: false })}
                      className="shrink-0 text-sm font-semibold text-burgundy hover:underline">Change</button>
                  </div>
                  <div className="mt-3 grid grid-cols-[1fr_auto_auto] gap-2">
                    <Input inputMode="decimal" autoComplete="off" autoFocus placeholder="How many" aria-label={`Quantity of ${l.item.name} to send`}
                      value={l.qty} onChange={(e) => patch(l.key, { qty: e.target.value.replace(/[^\d.,]/g, "") })} className="h-11 font-semibold" />
                    <Select aria-label="Unit" value={l.unitId ?? ""} onChange={(e) => patch(l.key, { unitId: Number(e.target.value) })} className="h-11 min-w-20 font-semibold">
                      {l.units.map((u) => <option key={u.unit_id} value={u.unit_id}>{u.symbol}</option>)}
                    </Select>
                    <Button type="button" variant="secondary" className="h-11" onClick={() => sendAll(l)} data-testid="send-all">All</Button>
                  </div>
                  {isAll(l) && (
                    <label className="mt-2 flex items-start gap-2 text-sm">
                      <input type="checkbox" className="mt-0.5 size-4 accent-burgundy" checked={l.removeHere}
                        onChange={(e) => patch(l.key, { removeHere: e.target.checked })} data-testid="remove-here" />
                      <span>Remove this item from this account after sending <span className="text-muted">(it&apos;s archived here, with its history kept)</span></span>
                    </label>
                  )}
                  {problem && <p className="mt-2 text-sm text-bad">{problem}</p>}
                </>
              )}
            </div>
          );
        })}
      </div>

      <button type="button" onClick={addLine} disabled={lines.length >= MAX_LINES}
        className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-black/15 text-sm font-semibold text-ink transition hover:border-black/40 disabled:opacity-40">
        <Plus className="size-4" /> {lines.length >= MAX_LINES ? `Maximum of ${MAX_LINES} items reached` : `Add another item (${lines.length}/${MAX_LINES})`}
      </button>

      {canBackdate && (
        <div className="mt-5">
          <WhenPicker label="When was it transferred?" value={occurredAt} touched={dateTouched} canBackdate
            onChange={(v, t) => { setOccurredAt(v); setDateTouched(t); }} />
        </div>
      )}

      <Field label="Note" htmlFor="transfer-note" hint="Optional, e.g. why it's being moved" className="mt-5">
        <Input id="transfer-note" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>

      {error && <p role="alert" className="mt-4 rounded-2xl bg-bad-bg px-3 py-2 text-sm text-bad">{error.message}</p>}
      {touched && problems.length > 0 && !error && <p className="mt-4 text-sm text-bad">{problems[0]}</p>}

      <div className="mt-6 flex items-center justify-between gap-3">
        <span className="text-sm text-muted">{filled.length} item{filled.length === 1 ? "" : "s"}{totalValue > 0 ? ` · ${formatMoney(totalValue, sym)}` : ""}</span>
        <Button size="lg" onClick={review} loading={busy} data-testid="review-transfer"><Send className="size-5" /> Review transfer</Button>
      </div>
    </div>
  );
}

/** Transfers this account sent or received. */
export function TransferHistory({ rows, storeId }: { rows: TransferRow[]; storeId: number }) {
  if (!rows.length) return <p className="text-sm text-muted">No transfers yet.</p>;
  return (
    <ul className="divide-y divide-black/5">
      {rows.map((t) => {
        const out = t.from_store === storeId;
        return (
          <li key={t.id} className="py-3 text-sm" data-testid="transfer-row">
            <div className="flex items-center justify-between gap-3">
              <p className="font-semibold">{out ? `Sent to ${t.to_name}` : `Received from ${t.from_name}`}</p>
              <span className="shrink-0 text-xs text-muted">{t.transfer_no} · {new Date(t.occurred_at ?? t.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
            </div>
            <p className="mt-0.5 text-muted">
              {t.lines.map((l) => `${l.name} × ${formatQty(l.quantity)} ${l.unit_symbol}`).join(", ")}
              {t.created_by_name ? ` · by ${t.created_by_name}` : ""}{t.notes ? ` · ${t.notes}` : ""}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
