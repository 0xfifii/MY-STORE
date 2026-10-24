"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "@/components/hand-icons";
import { Cowry } from "./logo";
import { Spinner } from "./ui/primitives";
import { useToast } from "./ui/toast";

/** Shrinks a photo to at most `max` pixels on its longest side and returns a JPEG. */
export async function shrinkPhoto(file: File, max = 900): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error("That file isn't a photo we can read."));
      i.src = url;
    });
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("Couldn't prepare the photo."))), "image/jpeg", 0.82));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function uploadPhoto(itemId: string, file: File) {
  const blob = await shrinkPhoto(file);
  const res = await fetch(`/api/items/${itemId}/photo`, { method: "PUT", headers: { "content-type": "image/jpeg" }, body: blob });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Couldn't upload the photo.");
}

/** Placeholder art when an item has no photo: a black tile with a white cowry and the item's initials. */
export function PhotoPlaceholder({ name, className = "" }: { name: string; className?: string }) {
  // "Rice (50kg bag)" -> "R", "Table water 75cl" -> "TW": letters only, ignoring sizes in brackets.
  const initials = name.replace(/\(.*?\)/g, " ").replace(/[^\p{L} ]/gu, " ").split(/\s+/).filter((w) => w.length > 1).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  return (
    <div className={`relative flex items-center justify-center overflow-hidden bg-[#111111] text-white ${className}`}>
      <div aria-hidden className="absolute -right-10 -top-10 size-40 rounded-full border border-white/10" />
      <div aria-hidden className="absolute -bottom-14 -left-8 size-44 rounded-full border border-white/10" />
      <Cowry tone="white" className="absolute right-3 top-3 size-8 opacity-90" />
      <span className="text-[44px] font-bold tracking-[-0.04em]">{initials || "?"}</span>
    </div>
  );
}

/** Photo tile on the item page: click to add or change, with a remove button. */
export function ItemPhotoEditor({ itemId, name, hasPhoto, v, editable }: { itemId: string; name: string; hasPhoto: boolean; v: string; editable: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const toast = useToast();
  const pick = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    try {
      await uploadPhoto(itemId, f);
      toast.success("Photo saved", `${name} now shows this photo on its card.`);
      router.refresh();
    } catch (e) { toast.error("Couldn't save the photo", (e as Error).message); } finally { setBusy(false); if (input.current) input.current.value = ""; }
  };
  const remove = async () => {
    setBusy(true);
    try {
      await fetch(`/api/items/${itemId}/photo`, { method: "DELETE" });
      router.refresh();
    } finally { setBusy(false); }
  };
  return (
    <div className="group relative aspect-[4/3] w-full overflow-hidden rounded-[22px]" data-testid="item-photo">
      {hasPhoto
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={`/api/items/${itemId}/photo?v=${v}`} alt={name} className="size-full object-cover grayscale transition duration-500 group-hover:scale-[1.03] group-hover:grayscale-0" />
        : <PhotoPlaceholder name={name} className="size-full" />}
      {editable && (
        <>
          <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
          <div className="absolute inset-x-3 bottom-3 flex gap-2">
            <button type="button" onClick={() => input.current?.click()} disabled={busy}
              className="flex h-10 items-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-[#111111] shadow-lg transition hover:scale-[1.03] active:scale-95">
              {busy ? <Spinner className="size-4" /> : null}{hasPhoto ? "Change photo" : "Add a photo"}
            </button>
            {hasPhoto && (
              <button type="button" onClick={remove} disabled={busy} aria-label="Remove photo"
                className="flex size-10 items-center justify-center rounded-xl bg-white/90 text-[#111111] shadow-lg transition hover:bg-white active:scale-95">
                <Trash2 className="size-4" />
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
