"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Play } from "lucide-react";
import { Button, Select } from "./ui/primitives";
import { useToast } from "./ui/toast";
import { api } from "@/lib/client";

export function GenerateNow() {
  const [preset, setPreset] = useState("today");
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const router = useRouter();
  const go = async () => {
    setBusy(true);
    try {
      const d = await api<{ results: { format: string; ok: boolean; error: string | null }[] }>("/api/reports/generate", {
        method: "POST", json: { preset, kind: "full", formats: ["pdf", "xlsx", "csv"] },
      });
      const failed = d.results.filter((r) => !r.ok);
      if (failed.length) toast.error("Some formats failed", failed.map((f) => `${f.format}: ${f.error}`).join("; "));
      else toast.success("Report generated", "PDF, Excel and CSV files are ready below.");
      router.refresh();
    } catch (e) {
      toast.error("Couldn't generate the report", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex gap-2">
      <Select aria-label="Report period" value={preset} onChange={(e) => setPreset(e.target.value)} className="h-10 w-36">
        <option value="today">Today</option>
        <option value="yesterday">Yesterday</option>
        <option value="this_week">This week</option>
        <option value="last_week">Last week</option>
        <option value="this_month">This month</option>
        <option value="last_month">Last month</option>
      </Select>
      <Button onClick={go} loading={busy}><Play className="size-4" /> Generate now</Button>
    </div>
  );
}
