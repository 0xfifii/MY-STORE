"use client";

import { useState } from "react";
import { Panel } from "@/components/ui/primitives";
import { TransferForm, TransferHistory, type TransferRow } from "@/components/transfer-form";

export function TransferPage({ targets, initial, storeId }: { targets: { id: number; name: string; locked: boolean }[]; initial: TransferRow[]; storeId: number }) {
  const [rows, setRows] = useState(initial);
  return (
    <div className="space-y-5">
      <Panel><TransferForm targets={targets} onSent={(t) => setRows((r) => [t, ...r.filter((x) => x.id !== t.id)])} /></Panel>
      <Panel title="Recent transfers"><TransferHistory rows={rows} storeId={storeId} /></Panel>
    </div>
  );
}
