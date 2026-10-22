"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, Plus, Trash2 } from "@/components/hand-icons";
import { Button, Field, Input, Select, Textarea, buttonClass } from "./ui/primitives";
import { Modal } from "./ui/dialog";
import { useToast } from "./ui/toast";
import { useApp } from "./app-context";
import { api, newRequestId } from "@/lib/client";
import { formatMoney, formatQty } from "@/lib/format";

type Opt = { id: number; name: string };
type UnitOpt = { id: number; name: string; symbol: string; allow_decimal: boolean };

export type ItemFormValues = {
  id?: string;
  name: string;
  sku: string;
  category_id: string;
  description: string;
  unit_id: string;
  allow_fraction: boolean;
  min_stock_level: string;
  default_supplier_id: string;
  notes: string;
  /** Price per base unit. */
  price?: string;
};

export function ItemForm({
  mode, initial, categories: initCats, units: initUnits, suppliers, unitLocked, thenStockIn, stock,
}: {
  /** Edit mode: what is in stock now, so a price change can show its effect. */
  stock?: { quantity: string; stock_value: string };
  mode: "create" | "edit";
  initial: ItemFormValues;
  categories: Opt[];
  units: UnitOpt[];
  suppliers: Opt[];
  unitLocked?: boolean;
  thenStockIn?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const app = useApp();
  const [v, setV] = useState(initial);
  const [categories, setCategories] = useState(initCats);
  const [units, setUnits] = useState(initUnits);
  const [openingQty, setOpeningQty] = useState("");
  const [openingCost, setOpeningCost] = useState(initial.price ?? "");
  const [priceReason, setPriceReason] = useState("");
  const [unitFactor, setUnitFactor] = useState("1");
  const canPrice = app.can("price.edit");
  const [conversions, setConversions] = useState<{ unit_id: string; factor: string }[]>([]);
  const [similar, setSimilar] = useState<{ id: string; name: string; sku: string; archived: boolean }[]>([]);
  const [skuTaken, setSkuTaken] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [requestId] = useState(newRequestId);
  const [quick, setQuick] = useState<null | "category" | "unit">(null);

  const set = <K extends keyof ItemFormValues>(k: K, val: ItemFormValues[K]) => setV((p) => ({ ...p, [k]: val }));
  const baseUnit = units.find((u) => String(u.id) === v.unit_id);

  // Live duplicate check while typing name / code.
  useEffect(() => {
    const t = setTimeout(async () => {
      if (v.name.trim().length < 2 && !v.sku.trim()) { setSimilar([]); setSkuTaken(false); return; }
      try {
        const d = await api<{ similar: typeof similar; skuTaken: boolean }>(
          `/api/items/check?name=${encodeURIComponent(v.name)}&sku=${encodeURIComponent(v.sku)}${v.id ? `&exclude=${v.id}` : ""}`,
        );
        setSimilar(d.similar);
        setSkuTaken(d.skuTaken);
      } catch { /* non-blocking */ }
    }, 300);
    return () => clearTimeout(t);
  }, [v.name, v.sku, v.id]);

  const openingValue = useMemo(() => {
    const q = Number(openingQty || 0), c = Number(openingCost || 0);
    return q > 0 ? q * c : 0;
  }, [openingQty, openingCost]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!v.name.trim()) e.name = "Item name is required.";
    if (mode === "edit" && !v.sku.trim()) e.sku = "Item code is required.";
    if (skuTaken) e.sku = "Another item already uses this code.";
    if (!v.unit_id) e.unit_id = "Choose the unit you count this item in.";
    if (v.min_stock_level && !/^\d+(\.\d{1,6})?$/.test(v.min_stock_level)) e.min_stock_level = "Enter a number.";
    if (openingQty && !/^\d+(\.\d{1,6})?$/.test(openingQty)) e.openingQty = "Enter a number.";
    if (openingQty && Number(openingQty) > 0 && !v.allow_fraction && Number(openingQty) % 1 !== 0) e.openingQty = "This item is counted in whole units only.";
    if (openingCost && !/^\d+(\.\d{1,6})?$/.test(openingCost)) e.openingCost = "Enter an amount, for example 250 or 250.50.";
    if (mode === "edit" && unitLocked && v.unit_id !== initial.unit_id && !(/^\d+(\.\d{1,6})?$/.test(unitFactor) && Number(unitFactor) > 0)) {
      e.unitFactor = "Enter how many of the new unit make one of the old unit.";
    }
    conversions.forEach((c, i) => {
      if (!c.unit_id) e[`conv${i}`] = "Choose a unit.";
      else if (!/^\d+(\.\d{1,6})?$/.test(c.factor) || Number(c.factor) <= 0) e[`conv${i}`] = "Enter how many base units it holds.";
    });
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setFormError(null);
    if (!validate()) return;
    setBusy(true);
    const payload = {
      name: v.name, sku: v.sku || null, category_id: v.category_id || null, description: v.description,
      unit_id: Number(v.unit_id), allow_fraction: v.allow_fraction, min_stock_level: v.min_stock_level || "0",
      default_supplier_id: v.default_supplier_id || null, notes: v.notes,
    };
    try {
      if (mode === "create") {
        const res = await api<{ id: string }>("/api/items", {
          method: "POST",
          json: {
            ...payload, opening_quantity: openingQty || "0", opening_unit_cost: openingCost || "0",
            conversions: conversions.map((c) => ({ unit_id: Number(c.unit_id), factor: c.factor })), request_id: requestId,
          },
        });
        toast.success("Item added", `${v.name} is now in your inventory.`);
        router.push(thenStockIn ? `/stock-in?item=${res.id}` : `/items/${res.id}`);
      } else {
        const priceChanged = openingCost !== "" && Number(openingCost) !== Number(initial.price ?? "");
        await api(`/api/items/${v.id}`, {
          method: "PATCH",
          json: {
            ...payload, sku: v.sku, ...(priceChanged ? { price: openingCost, price_reason: priceReason || null } : {}),
            ...(unitLocked && v.unit_id !== initial.unit_id ? { unit_factor: unitFactor } : {}),
          },
        });
        toast.success("Changes saved");
        router.push(`/items/${v.id}`);
      }
      router.refresh();
    } catch (e) {
      setFormError((e as Error).message);
      setBusy(false);
    }
  };

  const exactDuplicate = similar.find((s) => s.name.trim().toLowerCase() === v.name.trim().toLowerCase());

  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      <section className="glass rounded-[var(--radius-card)] p-4 sm:p-6">
        <h2 className="font-semibold">Item details</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Item name" htmlFor="name" required error={errors.name} className="sm:col-span-2">
            <Input id="name" value={v.name} onChange={(e) => set("name", e.target.value)} autoFocus={mode === "create"} placeholder="e.g. Rice (long grain)" />
          </Field>
          {similar.length > 0 && (
            <div className="rounded-md border border-warn/30 bg-warn-bg p-3 text-sm text-warn sm:col-span-2" role="status">
              <p className="flex items-center gap-2 font-semibold">
                <AlertTriangle className="size-4" />
                {exactDuplicate ? "An item with this name already exists." : "Similar items already exist. Make sure this isn't a duplicate."}
              </p>
              <ul className="mt-1.5 space-y-0.5">
                {similar.map((s) => (
                  <li key={s.id}>
                    <Link href={`/items/${s.id}`} target="_blank" className="underline">{s.name}</Link> ({s.sku}){s.archived ? " (archived)" : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <Field label="Item code (SKU)" htmlFor="sku" required={mode === "edit"} error={errors.sku ?? (skuTaken ? "Another item already uses this code." : null)}
            hint={mode === "create" ? "Leave blank to generate one automatically (ITM-00001)." : undefined}>
            <Input id="sku" value={v.sku} onChange={(e) => set("sku", e.target.value.toUpperCase())} placeholder={mode === "create" ? "Auto" : ""} />
          </Field>
          <Field label="Category" htmlFor="category">
            <div className="flex gap-2">
              <Select id="category" value={v.category_id} onChange={(e) => set("category_id", e.target.value)}>
                <option value="">None</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
              {app.can("catalog.write") && (
                <Button type="button" variant="secondary" className="h-11 shrink-0 px-3" onClick={() => setQuick("category")} aria-label="New category">
                  <Plus className="size-4" />
                </Button>
              )}
            </div>
          </Field>
          <Field label="Description" htmlFor="desc" className="sm:col-span-2">
            <Textarea id="desc" value={v.description} onChange={(e) => set("description", e.target.value)} />
          </Field>
        </div>
      </section>

      <section className="glass rounded-[var(--radius-card)] p-4 sm:p-6">
        <h2 className="font-semibold">Measurement and stock control</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Measurement unit" htmlFor="unit" required error={errors.unit_id}
            hint={unitLocked ? "Stock has been recorded in this unit. If you change it, we convert the history for you." : "Balances are kept in this unit."}>
            <div className="flex gap-2">
              <Select id="unit" value={v.unit_id} onChange={(e) => { set("unit_id", e.target.value); setUnitFactor("1"); }}>
                <option value="">Choose unit…</option>
                {units.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.symbol})</option>)}
              </Select>
              {app.can("catalog.write") && (
                <Button type="button" variant="secondary" className="h-11 shrink-0 px-3" onClick={() => setQuick("unit")} aria-label="New custom unit">
                  <Plus className="size-4" />
                </Button>
              )}
            </div>
          </Field>
          {mode === "edit" && unitLocked && v.unit_id !== initial.unit_id && (
            <UnitChangeBox
              from={units.find((u) => String(u.id) === initial.unit_id)} to={baseUnit}
              factor={unitFactor} setFactor={setUnitFactor} error={errors.unitFactor} stock={stock}
              minLevel={initial.min_stock_level}
            />
          )}
          <Field label={`Minimum stock level${baseUnit ? ` (${baseUnit.symbol})` : ""}`} htmlFor="min" required error={errors.min_stock_level}
            hint="You'll get a low-stock warning at or below this amount.">
            <Input id="min" inputMode="decimal" value={v.min_stock_level} onChange={(e) => set("min_stock_level", e.target.value.replace(/[^\d.]/g, ""))} />
          </Field>
          <label className="flex items-start gap-3 rounded-md border border-line p-3 sm:col-span-2">
            <input type="checkbox" className="mt-0.5 size-5 accent-burgundy" checked={v.allow_fraction} onChange={(e) => set("allow_fraction", e.target.checked)} />
            <span>
              <span className="block text-sm font-medium">Allow part quantities</span>
              <span className="block text-xs text-muted">e.g. 2.5 bags or 0.75 kg. Turn off for items that are only ever counted whole.</span>
            </span>
          </label>
          <Field label="Usual supplier" htmlFor="supplier">
            <Select id="supplier" value={v.default_supplier_id} onChange={(e) => set("default_supplier_id", e.target.value)}>
              <option value="">None</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          <Field label="Notes" htmlFor="notes">
            <Input id="notes" value={v.notes} onChange={(e) => set("notes", e.target.value)} />
          </Field>
        </div>

        {mode === "create" && (
          <div className="mt-6 border-t border-white/80 pt-5">
            <h3 className="text-sm font-semibold">Other units for this item</h3>
            <p className="mt-0.5 text-xs text-muted">
              Only if you receive or issue it in another unit, e.g. 1 bag = 50 kg. Units are never converted unless you define it here
              {baseUnit ? "" : " (choose the measurement unit first)"}. Standard rules like 1 kg = 1000 g apply automatically.
            </p>
            <div className="mt-3 space-y-2">
              {conversions.map((c, i) => (
                <div key={i}>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="shrink-0">1</span>
                    <Select aria-label="Unit" value={c.unit_id} onChange={(e) => setConversions(conversions.map((x, j) => j === i ? { ...x, unit_id: e.target.value } : x))} className="w-32 sm:w-40">
                      <option value="">unit…</option>
                      {units.filter((u) => String(u.id) !== v.unit_id).map((u) => <option key={u.id} value={u.id}>{u.symbol}</option>)}
                    </Select>
                    <span>=</span>
                    <Input aria-label="Amount of base unit" inputMode="decimal" value={c.factor} className="w-24 sm:w-32"
                      onChange={(e) => setConversions(conversions.map((x, j) => j === i ? { ...x, factor: e.target.value.replace(/[^\d.]/g, "") } : x))} />
                    <span className="shrink-0 text-muted">{baseUnit?.symbol ?? "base"}</span>
                    <button type="button" onClick={() => setConversions(conversions.filter((_, j) => j !== i))} className="rounded p-2 text-muted hover:bg-bad-bg hover:text-bad" aria-label="Remove conversion">
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                  {errors[`conv${i}`] && <p className="mt-1 text-sm text-bad">{errors[`conv${i}`]}</p>}
                </div>
              ))}
            </div>
            <Button type="button" variant="ghost" size="sm" className="mt-2" disabled={!baseUnit} onClick={() => setConversions([...conversions, { unit_id: "", factor: "" }])}>
              <Plus className="size-4" /> Add a unit conversion
            </Button>
          </div>
        )}
      </section>

      {mode === "edit" && (
        <PriceSection
          unit={baseUnit?.symbol ?? "unit"} sym={app.currencySymbol} canPrice={canPrice}
          price={openingCost} setPrice={setOpeningCost} initialPrice={initial.price ?? ""}
          reason={priceReason} setReason={setPriceReason} stock={stock} error={errors.openingCost}
        />
      )}

      {mode === "create" && (
        <section className="glass rounded-[var(--radius-card)] p-4 sm:p-6">
          <h2 className="font-semibold">Price and opening stock</h2>
          <p className="mt-0.5 text-sm text-muted">The price is filled in for you on every Stock In. Any quantity you have on hand now is recorded as the first Stock In, so the history starts correctly.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label={`Quantity on hand${baseUnit ? ` (${baseUnit.symbol})` : ""}`} htmlFor="oq" error={errors.openingQty}>
              <Input id="oq" inputMode="decimal" value={openingQty} placeholder="0" onChange={(e) => setOpeningQty(e.target.value.replace(/[^\d.]/g, ""))} />
            </Field>
            <Field label={`Price per ${baseUnit?.symbol ?? "unit"} (${app.currencySymbol})`} htmlFor="oc" error={errors.openingCost}
              hint={openingValue > 0 ? `Opening value ${formatMoney(openingValue, app.currencySymbol)}` : undefined}>
              <Input id="oc" inputMode="decimal" value={openingCost} placeholder="0.00" onChange={(e) => setOpeningCost(e.target.value.replace(/[^\d.]/g, ""))} />
            </Field>
          </div>
          {Number(openingQty) > 0 && baseUnit && (
            <p className="mt-3 text-sm">Starting balance: <strong>{formatQty(openingQty)} {baseUnit.symbol}</strong></p>
          )}
        </section>
      )}

      {formError && <p role="alert" className="rounded-2xl bg-bad-bg px-4 py-3 text-sm text-bad">{formError}</p>}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Link href={v.id ? `/items/${v.id}` : "/inventory"} className={buttonClass("secondary", "lg")}>Cancel</Link>
        <Button type="submit" size="lg" loading={busy}>
          {mode === "create" ? (thenStockIn ? "Add item and continue to Stock In" : "Add item") : "Save changes"}
        </Button>
      </div>

      <QuickCreate
        kind={quick}
        onClose={() => setQuick(null)}
        onCreated={(row) => {
          if (quick === "category") { setCategories([...categories, row as Opt].sort((a, b) => a.name.localeCompare(b.name))); set("category_id", String(row.id)); }
          if (quick === "unit") { setUnits([...units, row as UnitOpt]); set("unit_id", String(row.id)); }
          setQuick(null);
        }}
      />
    </form>
  );
}

function QuickCreate({ kind, onClose, onCreated }: { kind: null | "category" | "unit"; onClose: () => void; onCreated: (row: { id: number; name: string; symbol?: string; allow_decimal?: boolean }) => void }) {
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { setName(""); setSymbol(""); setErr(null); }, [kind]);
  const save = async () => {
    setBusy(true); setErr(null);
    try {
      if (kind === "category") {
        const d = await api<{ category: { id: number; name: string } }>("/api/categories", { method: "POST", json: { name } });
        onCreated(d.category);
      } else {
        const d = await api<{ unit: { id: number; name: string; symbol: string } }>("/api/units", { method: "POST", json: { name, symbol: symbol || name, allow_decimal: true } });
        onCreated({ ...d.unit, allow_decimal: true });
      }
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Modal open={!!kind} onClose={onClose} title={kind === "category" ? "New category" : "New custom unit"} busy={busy}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} loading={busy} disabled={!name.trim()}>Create {kind}</Button></>}>
      <div className="space-y-4" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (name.trim()) save(); } }}>
        <Field label="Name" htmlFor="qc-name" required>
          <Input id="qc-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === "category" ? "e.g. Beverages" : "e.g. Trays"} />
        </Field>
        {kind === "unit" && (
          <Field label="Short symbol" htmlFor="qc-sym" required hint="Shown next to quantities, e.g. 3 trays">
            <Input id="qc-sym" value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="trays" />
          </Field>
        )}
        {err && <p className="text-sm text-bad">{err}</p>}
      </div>
    </Modal>
  );
}

/** Edit form: the item's price. With stock on hand, a new price re-prices it (recorded as a price change). */
function PriceSection({ unit, sym, canPrice, price, setPrice, initialPrice, reason, setReason, stock, error }: {
  unit: string; sym: string; canPrice: boolean; price: string; setPrice: (v: string) => void; initialPrice: string;
  reason: string; setReason: (v: string) => void; stock?: { quantity: string; stock_value: string }; error?: string;
}) {
  const qty = Number(stock?.quantity ?? 0);
  const changed = price !== "" && Number(price) !== Number(initialPrice);
  const newWorth = changed ? Math.round(qty * Number(price) * 100) / 100 : null;
  const oldWorth = Number(stock?.stock_value ?? 0);
  return (
    <section className="glass rounded-[var(--radius-card)] p-4 sm:p-6" data-testid="price-section">
      <h2 className="font-semibold">Price</h2>
      <p className="mt-0.5 text-sm text-muted">
        {qty > 0
          ? `Changing it re-prices the ${formatQty(stock!.quantity)} ${unit} in stock and is saved in the item's history.`
          : "Nothing is in stock, so this is the price filled in on the next Stock In."}
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label={`Price per ${unit} (${sym})`} htmlFor="price" error={error}
          hint={!canPrice ? "You don't have permission to change prices." : initialPrice ? `Now ${formatMoney(Number(initialPrice), sym)} per ${unit}` : "No price yet"}>
          <Input id="price" inputMode="decimal" value={price} placeholder="0.00" disabled={!canPrice}
            onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ""))} />
        </Field>
        {changed && qty > 0 && (
          <Field label="Why did it change?" htmlFor="price-why" hint="For example: supplier increased prices">
            <Input id="price-why" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
          </Field>
        )}
      </div>
      {changed && qty > 0 && newWorth !== null && (
        <p className="mt-3 rounded-2xl bg-burgundy/[0.05] px-4 py-3 text-sm ring-1 ring-burgundy/10">
          Stock worth: <span className="text-muted line-through">{formatMoney(oldWorth, sym)}</span> → <strong>{formatMoney(newWorth, sym)}</strong>
          <span className={`ml-2 font-semibold ${newWorth > oldWorth ? "text-burgundy" : "text-ok"}`}>
            {newWorth > oldWorth ? "+" : "−"}{formatMoney(Math.abs(newWorth - oldWorth), sym)}
          </span>
        </p>
      )}
    </section>
  );
}

/** Shown when the unit of an item with history is changed: how the old unit converts into the new one. */
function UnitChangeBox({ from, to, factor, setFactor, error, stock, minLevel }: {
  from?: UnitOpt; to?: UnitOpt; factor: string; setFactor: (v: string) => void; error?: string;
  stock?: { quantity: string; stock_value: string }; minLevel: string;
}) {
  if (!from || !to) return null;
  const f = Number(factor);
  const ok = f > 0;
  const qty = Number(stock?.quantity ?? 0);
  return (
    <div className="rounded-2xl bg-burgundy/[0.05] p-4 ring-1 ring-burgundy/15 sm:col-span-2" data-testid="unit-change">
      <p className="text-sm font-semibold">Changing from {from.name} ({from.symbol}) to {to.name} ({to.symbol})</p>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <span>1 {from.symbol} =</span>
        <Input aria-label={`How many ${to.symbol} make one ${from.symbol}`} inputMode="decimal" value={factor} className="w-28"
          onChange={(e) => setFactor(e.target.value.replace(/[^\d.]/g, ""))} />
        <span>{to.symbol}</span>
      </div>
      {error ? <p className="mt-1.5 text-sm text-bad">{error}</p> : (
        <p className="mt-1.5 text-xs text-muted">Put 1 if it&apos;s the same thing with a new name. For a real conversion, for example 1 bag = 50 kg, put 50.</p>
      )}
      {ok && (
        <ul className="mt-3 space-y-1 text-sm">
          <li>Stock now: <strong>{formatQty(String(qty))} {from.symbol}</strong> → <strong>{formatQty(String(Math.round(qty * f * 1e6) / 1e6))} {to.symbol}</strong></li>
          <li className="text-muted">Minimum level: {formatQty(minLevel || "0")} {from.symbol} → {formatQty(String(Math.round(Number(minLevel || 0) * f * 1e6) / 1e6))} {to.symbol}</li>
          <li className="text-muted">Stock worth stays the same. Past stock movements are converted too, and what people typed stays on record.</li>
          {f !== 1 && <li className="text-muted">You can still record in {from.symbol}: it&apos;s added as a unit conversion.</li>}
        </ul>
      )}
    </div>
  );
}
