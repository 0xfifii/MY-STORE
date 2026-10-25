"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Trash2 } from "@/components/hand-icons";
import { Button, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/client";

type Unit = { id: number; name: string; symbol: string; allow_decimal: boolean };
type Row = { name: string; quantity: string; ok: boolean; note?: string };

/**
 * "MONIN KIWI 6 pcs", "Eva - 18", "Bacardi, 24 pc": the last number on the line is the quantity;
 * a unit word after it is ignored (the unit is chosen once for the whole list).
 */
export function parseLines(text: string, caps: boolean): Row[] {
  return text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((line) => {
    const m = line.match(/^(.*?)[\s,:;=\-–x×]*(\d+(?:\.\d+)?)\s*([A-Za-z.]{0,12})\s*$/);
    if (!m || !m[1].trim()) return { name: caps ? line.toUpperCase() : line, quantity: "", ok: false, note: "No quantity found" };
    const name = m[1].replace(/[\s,:;=\-–]+$/, "").replace(/\s+/g, " ").trim();
    return { name: caps ? name.toUpperCase() : name, quantity: m[2], ok: true };
  });
}

export function BulkAdd({ categories, units, canNewCategory }: { categories: { id: number; name: string }[]; units: Unit[]; canNewCategory: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const pcs = units.find((u) => u.symbol.toLowerCase() === "pcs");
  const [text, setText] = useState("");
  const [caps, setCaps] = useState(true);
  const [unitId, setUnitId] = useState(pcs ? String(pcs.id) : "");
  const [cat, setCat] = useState(categories.length ? String(categories[0].id) : "__new");
  const [newCat, setNewCat] = useState("");
  const [removed, setRemoved] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ created: { id: string; name: string }[]; skipped: { name: string; reason: string }[] } | null>(null);

  const rows = useMemo(() => parseLines(text, caps), [text, caps]);
  const kept = rows.filter((r, i) => r.ok && !removed.has(i));
  const unit = units.find((u) => String(u.id) === unitId);
  const total = kept.reduce((a, r) => a + Number(r.quantity), 0);

  const save = async () => {
    setBusy(true);
    try {
      const r = await api<NonNullable<typeof result>>("/api/items/bulk", {
        method: "POST",
        json: {
          unit_id: Number(unitId),
          ...(cat === "__new" ? { category_name: newCat.trim() } : { category_id: Number(cat) }),
          rows: kept.map((x) => ({ name: x.name, quantity: x.quantity })),
        },
      });
      setResult(r);
      toast.success(`${r.created.length} item${r.created.length === 1 ? "" : "s"} added`, r.skipped.length ? `${r.skipped.length} skipped. See the list below.` : undefined);
      router.refresh();
    } catch (e) { toast.error("Couldn't add the items", (e as Error).message); } finally { setBusy(false); }
  };

  if (result) {
    return (
      <section className="rounded-[28px] bg-white p-6 ring-1 ring-black/5" data-testid="bulk-result">
        <h2 className="text-[19px] font-bold">{result.created.length} item{result.created.length === 1 ? "" : "s"} added</h2>
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {result.created.map((c) => <li key={c.id}><Link href={`/items/${c.id}`} className="inline-block rounded-lg bg-black/5 px-2.5 py-1 text-sm font-semibold hover:bg-black/10">{c.name}</Link></li>)}
        </ul>
        {result.skipped.length > 0 && (
          <div className="mt-5">
            <h3 className="font-semibold">Skipped</h3>
            <ul className="mt-2 space-y-1 text-sm">{result.skipped.map((s) => <li key={s.name}><strong>{s.name}</strong>: {s.reason}</li>)}</ul>
          </div>
        )}
        <p className="mt-5 text-sm text-[#111111]/60">Prices are 0 for now. Set each one later with the ₦ button on the item&apos;s card or on its edit page.</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button onClick={() => router.push("/inventory")}>Go to Inventory</Button>
          <Button variant="secondary" onClick={() => { setResult(null); setText(""); setRemoved(new Set()); }}>Add another list</Button>
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[28px] bg-white p-6 ring-1 ring-black/5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category for all of them" htmlFor="b-cat" required>
            <Select id="b-cat" value={cat} onChange={(e) => setCat(e.target.value)}>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              {canNewCategory && <option value="__new">+ New category…</option>}
            </Select>
          </Field>
          {cat === "__new" ? (
            <Field label="New category name" htmlFor="b-newcat" required>
              <Input id="b-newcat" value={newCat} onChange={(e) => setNewCat(caps ? e.target.value.toUpperCase() : e.target.value)} placeholder="e.g. DRINKS" />
            </Field>
          ) : <div className="hidden sm:block" />}
          <Field label="Unit for all of them" htmlFor="b-unit" required>
            <Select id="b-unit" value={unitId} onChange={(e) => setUnitId(e.target.value)}>
              <option value="">Choose unit…</option>
              {units.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.symbol})</option>)}
            </Select>
          </Field>
          <label className="flex items-center gap-2 self-end pb-3 text-sm font-medium">
            <input type="checkbox" className="size-5 accent-black" checked={caps} onChange={(e) => setCaps(e.target.checked)} /> Names in CAPITAL LETTERS
          </label>
        </div>
        <Field label="Your list" htmlFor="b-list" required className="mt-4" hint="One item per line, quantity at the end, e.g. MONIN KIWI 6 pcs">
          <Textarea id="b-list" rows={10} value={text} onChange={(e) => { setText(e.target.value); setRemoved(new Set()); }}
            placeholder={"monin kiwi 6 pcs\neva 18 pcs\nbacardi 24 pcs"} className="font-mono text-[14px]" />
        </Field>
      </section>

      {rows.length > 0 && (
        <section className="rounded-[28px] bg-white p-6 ring-1 ring-black/5" data-testid="bulk-preview">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-semibold">Preview · {kept.length} item{kept.length === 1 ? "" : "s"}{unit ? ` · ${total} ${unit.symbol}` : ""}</h2>
            <p className="text-xs text-[#111111]/50">Opening stock is recorded now; prices start at 0.</p>
          </div>
          <ul className="mt-3 divide-y divide-black/5">
            {rows.map((r, i) => (
              <li key={i} className={`flex items-center justify-between gap-3 py-2 ${removed.has(i) ? "opacity-40 line-through" : ""}`}>
                <span className="min-w-0 truncate font-semibold">{r.name}</span>
                <span className="flex shrink-0 items-center gap-3">
                  {r.ok ? <span className="tabular-nums">{r.quantity} {unit?.symbol ?? ""}</span> : <span className="text-sm text-bad">{r.note}</span>}
                  {r.ok && (
                    <button type="button" aria-label={`Leave out ${r.name}`} onClick={() => setRemoved((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; })}
                      className="rounded-lg p-1.5 text-[#111111]/40 hover:bg-black/5 hover:text-[#111111]"><Trash2 className="size-4" /></button>
                  )}
                </span>
              </li>
            ))}
          </ul>
          <Button size="lg" className="mt-5 w-full sm:w-auto" loading={busy} onClick={save}
            disabled={!kept.length || !unitId || (cat === "__new" && !newCat.trim())}>
            Add {kept.length} item{kept.length === 1 ? "" : "s"}
          </Button>
        </section>
      )}
    </div>
  );
}
