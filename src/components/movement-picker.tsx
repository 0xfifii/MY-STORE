"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { Download } from "@/components/hand-icons";


const short = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const localToday = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };

/**
 * Stock movement report for any day, month or date range you pick (as well as the one-tap buttons).
 * Each choice downloads the movement PDF (or Excel) for that period.
 */
export function MovementPicker({ kind = "movement" }: { kind?: "movement" | "full" }) {
  const link = (q: string, format = "pdf") => `/api/reports/export?format=${format}&kind=${kind}&${q}`;
  const what = kind === "full" ? "Full report" : "Movement";
  const [today, setToday] = useState("");
  const [mode, setMode] = useState<"day" | "month" | "range">("day");
  const [day, setDay] = useState("");
  const [month, setMonth] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  useEffect(() => {
    const t = localToday();
    setToday(t);
    const y = new Date(t + "T12:00:00Z"); y.setUTCDate(y.getUTCDate() - 1);
    setDay(y.toISOString().slice(0, 10));
    setMonth(t.slice(0, 7));
    setFrom(t.slice(0, 8) + "01"); setTo(t);
  }, []);

  const query = mode === "day" ? (day ? `from=${day}&to=${day}` : "")
    : mode === "month" ? (month ? `preset=month&month=${month}&period_type=month` : "")
    : (from && to && from <= to ? `from=${from}&to=${to}` : "");
  const label = mode === "day" && day
    ? new Date(day + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
    : mode === "month" && month ? new Date(month + "-01T12:00:00Z").toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })
    : from && to ? `${short(from)} – ${short(to)} ${to.slice(0, 4)}` : "";
  const tab = (on: boolean) => clsx("flex-1 rounded-xl px-3 py-1.5 text-sm font-semibold transition", on ? "bg-[#111111] text-white shadow" : "text-[#111111]/60 hover:text-[#111111]");
  const input = "h-12 w-full rounded-2xl border border-black/10 bg-paper px-3 text-[15px] font-semibold text-[#111111] focus:border-[#111111] focus:outline-none";

  return (
    <div className="mt-5 rounded-2xl bg-canvas/70 p-3 ring-1 ring-black/[0.05]" data-testid={`${kind}-picker`}>
      <p className="mb-2 px-1 text-sm font-semibold">Another day or period</p>
      <div className="mb-3 flex gap-1 rounded-2xl bg-paper p-1 ring-1 ring-black/5" role="tablist">
        <button type="button" role="tab" aria-selected={mode === "day"} className={tab(mode === "day")} onClick={() => setMode("day")}>A day</button>
        <button type="button" role="tab" aria-selected={mode === "month"} className={tab(mode === "month")} onClick={() => setMode("month")}>A month</button>
        <button type="button" role="tab" aria-selected={mode === "range"} className={tab(mode === "range")} onClick={() => setMode("range")}>From – to</button>
      </div>

      {mode === "day" && (
        <label className="block">
          <span className="sr-only">Day</span>
          <input type="date" value={day} max={today || undefined} onChange={(e) => setDay(e.target.value)} className={input} aria-label="Day" />
        </label>
      )}
      {mode === "month" && (
        <input type="month" value={month} max={today.slice(0, 7) || undefined} onChange={(e) => setMonth(e.target.value)} className={input} aria-label="Month" />
      )}
      {mode === "range" && (
        <div className="grid grid-cols-2 gap-2">
          <input type="date" value={from} max={to || today || undefined} onChange={(e) => setFrom(e.target.value)} className={input} aria-label="From" />
          <input type="date" value={to} min={from || undefined} max={today || undefined} onChange={(e) => setTo(e.target.value)} className={input} aria-label="To" />
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <a href={query ? link(query) : undefined} aria-disabled={!query} data-testid={`${kind}-pdf`}
          className={clsx("group flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[#111111] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#2b2b2b] active:scale-[.98]", !query && "pointer-events-none opacity-40")}>
          <Download className="size-4 transition group-hover:translate-y-0.5" /> {what} PDF{label ? ` · ${label}` : ""}
        </a>
        <a href={query ? link(query, "xlsx") : undefined} aria-disabled={!query}
          className={clsx("flex items-center justify-center rounded-2xl bg-paper px-4 text-sm font-semibold ring-1 ring-black/10 transition hover:ring-black/30", !query && "pointer-events-none opacity-40")}>
          Excel
        </a>
      </div>
    </div>
  );
}
