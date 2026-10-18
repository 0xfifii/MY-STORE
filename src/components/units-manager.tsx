"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button, Field, Input, Panel, Select } from "./ui/primitives";
import { useToast } from "./ui/toast";
import { api } from "@/lib/client";
import { formatQty } from "@/lib/format";

type Unit = { id: number; name: string; symbol: string; allow_decimal: boolean; is_system: boolean; item_count: number };
type Rule = { id: number; from_symbol: string; to_symbol: string; factor: string };

export function UnitsManager({ units, rules, canAdd, canRules }: { units: Unit[]; rules: Rule[]; canAdd: boolean; canRules: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [whole, setWhole] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rule, setRule] = useState({ from: "", to: "", factor: "" });

  const addUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/api/units", { method: "POST", json: { name, symbol: symbol || name, allow_decimal: !whole } });
      toast.success("Unit added", `${name} can now be chosen for items.`);
      setName(""); setSymbol(""); setWhole(false);
      router.refresh();
    } catch (err) { toast.error("Couldn't add unit", (err as Error).message); } finally { setBusy(false); }
  };
  const addRule = async () => {
    try {
      await api("/api/unit-conversions", { method: "POST", json: { from_unit_id: Number(rule.from), to_unit_id: Number(rule.to), factor: rule.factor } });
      toast.success("Conversion rule saved");
      setRule({ from: "", to: "", factor: "" });
      router.refresh();
    } catch (err) { toast.error("Couldn't save rule", (err as Error).message); }
  };
  const removeRule = async (id: number) => {
    try { await api(`/api/unit-conversions/${id}`, { method: "DELETE" }); router.refresh(); }
    catch (err) { toast.error("Couldn't remove rule", (err as Error).message); }
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <Panel title="Measurement units" bodyClass="">
        <ul className="divide-y divide-line">
          {units.map((u) => (
            <li key={u.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm sm:px-5">
              <span><strong>{u.name}</strong> <span className="text-muted">({u.symbol})</span></span>
              <span className="text-xs text-muted">
                {u.is_system ? "Standard" : "Custom"}{!u.allow_decimal ? " · whole numbers" : ""} · {u.item_count} item{u.item_count === 1 ? "" : "s"}
              </span>
            </li>
          ))}
        </ul>
        {canAdd && (
          <form onSubmit={addUnit} className="grid gap-3 border-t border-line p-4 sm:grid-cols-[1fr_8rem_auto] sm:items-end sm:p-5">
            <Field label="New unit name" htmlFor="u-name" required><Input id="u-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Trays" /></Field>
            <Field label="Symbol" htmlFor="u-sym" required><Input id="u-sym" value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="trays" /></Field>
            <Button type="submit" loading={busy} disabled={!name.trim()} className="h-11"><Plus className="size-4" /> Add unit</Button>
            <label className="flex items-center gap-2 text-sm sm:col-span-3">
              <input type="checkbox" className="accent-burgundy" checked={whole} onChange={(e) => setWhole(e.target.checked)} /> Whole numbers only for this unit
            </label>
          </form>
        )}
      </Panel>

      <Panel title="Standard conversion rules">
        <p className="text-sm text-muted">
          Used for any item whose unit is on one side of the rule. Units are never mixed otherwise — a bag only converts to kg when you set
          that on the item itself (e.g. Rice: 1 bag = 50 kg).
        </p>
        <ul className="mt-3 divide-y divide-line rounded-md border border-line">
          {rules.map((r) => (
            <li key={r.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <span>1 {r.from_symbol} = <strong>{formatQty(r.factor)} {r.to_symbol}</strong></span>
              {canRules && (
                <button onClick={() => removeRule(r.id)} className="rounded p-1 text-muted hover:text-bad" aria-label={`Remove ${r.from_symbol} to ${r.to_symbol}`}>
                  <Trash2 className="size-4" />
                </button>
              )}
            </li>
          ))}
          {!rules.length && <li className="px-3 py-3 text-sm text-muted">No rules.</li>}
        </ul>
        {canRules && (
          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
            <span>1</span>
            <Select aria-label="From unit" value={rule.from} onChange={(e) => setRule({ ...rule, from: e.target.value })} className="h-10 w-24">
              <option value="">unit</option>{units.map((u) => <option key={u.id} value={u.id}>{u.symbol}</option>)}
            </Select>
            <span>=</span>
            <Input aria-label="Factor" inputMode="decimal" value={rule.factor} onChange={(e) => setRule({ ...rule, factor: e.target.value.replace(/[^\d.]/g, "") })} className="h-10 w-24" />
            <Select aria-label="To unit" value={rule.to} onChange={(e) => setRule({ ...rule, to: e.target.value })} className="h-10 w-24">
              <option value="">unit</option>{units.map((u) => <option key={u.id} value={u.id}>{u.symbol}</option>)}
            </Select>
            <Button size="sm" variant="secondary" onClick={addRule} disabled={!rule.from || !rule.to || !(Number(rule.factor) > 0)}>Add rule</Button>
          </div>
        )}
      </Panel>
    </div>
  );
}
