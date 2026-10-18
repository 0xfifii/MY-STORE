"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Pencil, Plus } from "lucide-react";
import { Button, EmptyState, Field, Input, Textarea } from "./ui/primitives";
import { Modal } from "./ui/dialog";
import { useToast } from "./ui/toast";
import { api } from "@/lib/client";

export type FieldDef = { key: string; label: string; required?: boolean; type?: "text" | "email" | "tel" | "textarea" | "checkbox"; hint?: string };
export type Row = { id: number; archived_at: string | null; title: string; subtitle?: string; locked?: boolean; [k: string]: unknown };

/** Generic add / edit / archive list for categories, suppliers and units. */
export function CatalogManager({
  rows, fields, endpoint, noun, canWrite, canArchive, emptyBody,
}: {
  rows: Row[];
  fields: FieldDef[];
  endpoint: string;
  noun: string;
  canWrite: boolean;
  canArchive: boolean;
  emptyBody: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const open = (r: Row | "new") => {
    setEditing(r);
    setError(null);
    setValues(r === "new" ? Object.fromEntries(fields.map((f) => [f.key, f.type === "checkbox" ? true : ""])) : Object.fromEntries(fields.map((f) => [f.key, r[f.key] ?? (f.type === "checkbox" ? false : "")])));
  };
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      if (editing === "new") await api(endpoint, { method: "POST", json: values });
      else if (editing) await api(`${endpoint}/${editing.id}`, { method: "PATCH", json: values });
      toast.success(editing === "new" ? `${noun} added` : "Changes saved");
      setEditing(null);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const toggleArchive = async (r: Row) => {
    try {
      await api(`${endpoint}/${r.id}`, { method: "PATCH", json: { archived: !r.archived_at } });
      toast.success(r.archived_at ? `${noun} restored` : `${noun} archived`);
      router.refresh();
    } catch (e) {
      toast.error("Couldn't update", (e as Error).message);
    }
  };

  const visible = rows.filter((r) => showArchived || !r.archived_at);
  const archivedCount = rows.filter((r) => r.archived_at).length;

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
        <p className="text-sm text-muted">{rows.length - archivedCount} active{archivedCount ? ` · ${archivedCount} archived` : ""}</p>
        <div className="flex items-center gap-3">
          {archivedCount > 0 && (
            <label className="flex items-center gap-2 text-sm text-muted">
              <input type="checkbox" className="accent-burgundy" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived
            </label>
          )}
          {canWrite && <Button size="sm" onClick={() => open("new")}><Plus className="size-4" /> Add {noun.toLowerCase()}</Button>}
        </div>
      </div>
      {visible.length === 0 ? (
        <EmptyState title={`No ${noun.toLowerCase()}s yet`} body={emptyBody} />
      ) : (
        <ul className="divide-y divide-line">
          {visible.map((r) => (
            <li key={r.id} className={`flex items-center gap-3 px-4 py-3 sm:px-5 ${r.archived_at ? "opacity-60" : ""}`}>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{r.title}{r.archived_at ? <span className="ml-2 text-xs font-normal text-muted">archived</span> : null}</p>
                {r.subtitle && <p className="truncate text-xs text-muted">{r.subtitle}</p>}
              </div>
              {canWrite && !r.locked && !r.archived_at && (
                <button onClick={() => open(r)} className="rounded p-2 text-muted hover:bg-rose hover:text-burgundy" aria-label={`Edit ${String(r.name)}`}>
                  <Pencil className="size-4" />
                </button>
              )}
              {canArchive && !r.locked && (
                <button onClick={() => toggleArchive(r)} className="rounded p-2 text-muted hover:bg-rose hover:text-burgundy" aria-label={r.archived_at ? `Restore ${String(r.name)}` : `Archive ${String(r.name)}`}>
                  {r.archived_at ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing === "new" ? `Add ${noun.toLowerCase()}` : `Edit ${noun.toLowerCase()}`} busy={busy}
        footer={<><Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button><Button onClick={save} loading={busy}>{editing === "new" ? `Add ${noun.toLowerCase()}` : "Save changes"}</Button></>}>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save(); }}>
          {fields.map((f) =>
            f.type === "checkbox" ? (
              <label key={f.key} className="flex items-start gap-3 text-sm">
                <input type="checkbox" className="mt-0.5 size-5 accent-burgundy" checked={Boolean(values[f.key])} onChange={(e) => setValues({ ...values, [f.key]: e.target.checked })} />
                <span><span className="font-medium">{f.label}</span>{f.hint && <span className="block text-xs text-muted">{f.hint}</span>}</span>
              </label>
            ) : (
              <Field key={f.key} label={f.label} htmlFor={`f-${f.key}`} required={f.required} hint={f.hint}>
                {f.type === "textarea" ? (
                  <Textarea id={`f-${f.key}`} value={String(values[f.key] ?? "")} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} />
                ) : (
                  <Input id={`f-${f.key}`} type={f.type ?? "text"} value={String(values[f.key] ?? "")} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} />
                )}
              </Field>
            ),
          )}
          {error && <p role="alert" className="text-sm text-bad">{error}</p>}
          <button type="submit" className="hidden" />
        </form>
      </Modal>
    </div>
  );
}
