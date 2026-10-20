// Custom Stock In / Stock Out icons: an arrow landing in (or lifting out of) an open store tray.
type P = { className?: string; strokeWidth?: number };

export function StockInIcon({ className, strokeWidth = 1.9 }: P) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M13.6 4.9c3.1.3 6 2.6 6.4 5.9.4 3.5-1.6 7.3-5.1 8.4-3.3 1.1-7.4.6-9.4-2.2-1.8-2.6-1.5-6.5.6-9 1.7-2.1 4.9-3.4 7.5-3.1z" fill="currentColor" stroke="none" opacity="0.16" transform="translate(1.4 1.2)" />
      <path d="M12 3v10" />
      <path d="m7.5 8.8 4.5 4.5 4.5-4.5" />
      <path d="M3.5 13.5v3.2A3.3 3.3 0 0 0 6.8 20h10.4a3.3 3.3 0 0 0 3.3-3.3v-3.2" />
      <path d="M3.5 13.5h3.7l1.3 2.2h7l1.3-2.2h3.7" />
    </svg>
  );
}

export function StockOutIcon({ className, strokeWidth = 1.9 }: P) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M13.6 4.9c3.1.3 6 2.6 6.4 5.9.4 3.5-1.6 7.3-5.1 8.4-3.3 1.1-7.4.6-9.4-2.2-1.8-2.6-1.5-6.5.6-9 1.7-2.1 4.9-3.4 7.5-3.1z" fill="currentColor" stroke="none" opacity="0.16" transform="translate(1.4 1.2)" />
      <path d="M12 13.3V3" />
      <path d="m7.5 7.5 4.5-4.5 4.5 4.5" />
      <path d="M3.5 13.5v3.2A3.3 3.3 0 0 0 6.8 20h10.4a3.3 3.3 0 0 0 3.3-3.3v-3.2" />
      <path d="M3.5 13.5h3.7l1.3 2.2h7l1.3-2.2h3.7" />
    </svg>
  );
}

/** Small "download receipt" link for a transaction row. */
export function ReceiptLink({ txnId, txnNo }: { txnId: string; txnNo: string }) {
  return (
    <a href={`/api/transactions/${txnId}/receipt`} download title={`Download receipt ${txnNo}`} aria-label={`Download receipt ${txnNo}`}
      className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold text-muted transition-colors hover:bg-rose hover:text-burgundy">
      <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6" />
      </svg>
      Receipt
    </a>
  );
}
