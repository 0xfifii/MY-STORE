/**
 * ÌṢÚRA icon set: hand-drawn, single-weight line icons in the same pen style as the
 * mascot (round ends, slightly loose curves). Drop-in names so screens read naturally.
 */
type P = { className?: string; strokeWidth?: number; "aria-hidden"?: boolean };

/** A hand-cut tinted shape printed slightly off-register behind every drawing. */
const BLOB = "M13.6 4.9c3.1.3 6 2.6 6.4 5.9.4 3.5-1.6 7.3-5.1 8.4-3.3 1.1-7.4.6-9.4-2.2-1.8-2.6-1.5-6.5.6-9 1.7-2.1 4.9-3.4 7.5-3.1z";

function I({ className, strokeWidth = 1.9, children, ...rest }: P & { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      className={className} aria-hidden={rest["aria-hidden"] ?? true} focusable="false">
      <path d={BLOB} fill="currentColor" stroke="none" opacity="0.16" transform="translate(1.4 1.2)" />
      {children}
    </svg>
  );
}

// ---- navigation
export const LayoutDashboard = (p: P) => (
  <I {...p}><path d="M4.2 5.1c0-.6.4-1 1-1h4.6c.6 0 1 .5 1 1.1l-.1 5.6c0 .6-.4.9-1 .9H5.1c-.5 0-.9-.4-.9-1z" /><path d="M13.3 4.3h5.5c.6 0 1 .4 1 1v2.6c0 .6-.4 1-1 1h-5.4c-.5 0-.9-.4-.9-1V5.2c0-.5.3-.9.8-.9z" /><path d="M13.4 11.7l5.4.1c.6 0 1 .4 1 1l-.1 5.9c0 .6-.4 1-1 1h-5.3c-.6 0-1-.5-1-1.1V12.6c0-.5.4-.9 1-.9z" /><path d="M5.1 14.4h4.7c.6 0 1 .4 1 1v3.3c0 .6-.5 1.1-1.1 1.1H5.2c-.6 0-1-.5-1-1.1v-3.4c0-.5.4-.9.9-.9z" /></I>
);
export const Boxes = (p: P) => (
  <I {...p}><path d="M3.8 9.6 12 5.3l8.2 4.2-8.1 4.4z" /><path d="M3.8 9.6v7.6l8.3 3.6 8.1-3.8V9.5" /><path d="M12.1 13.9v6.8" /><path d="m7.9 7.4 8.3 4.3" /></I>
);
export const Package = Boxes;
export const History = (p: P) => (
  <I {...p}><path d="M4.4 12.3a7.7 7.7 0 1 0 2.4-5.6" /><path d="M4.1 4.6v3.6h3.7" /><path d="M12.1 8.2v4.3l2.9 1.8" /></I>
);
export const AlertTriangle = (p: P) => (
  <I {...p}><path d="M10.4 4.6c.8-1.3 2.4-1.3 3.2 0l6.8 11.8c.7 1.3-.1 2.8-1.6 2.8H5.2c-1.5 0-2.3-1.6-1.6-2.8z" /><path d="M12 9.4v4" /><path d="M12 16.5h.01" /></I>
);
export const FileBarChart = (p: P) => (
  <I {...p}><path d="M6.2 3.6h7.7l4.3 4.5v11.1c0 .7-.5 1.2-1.2 1.2H6.3c-.7 0-1.2-.5-1.2-1.2V4.8c0-.7.4-1.2 1.1-1.2z" /><path d="M13.7 3.8v4.5h4.4" /><path d="M8.8 17v-3.2M12 17v-5.4M15.2 17v-2" /></I>
);
export const ArchiveRestore = (p: P) => (
  <I {...p}><path d="M3.6 5.4c0-.6.4-1 1-1h14.8c.6 0 1 .4 1 1v2.3c0 .5-.4.9-1 .9H4.6c-.6 0-1-.4-1-.9z" /><path d="M5.2 8.7v9.8c0 .7.5 1.2 1.2 1.2h11.2c.7 0 1.2-.5 1.2-1.2V8.6" /><path d="M12 17.2v-5.4M9.6 14l2.4-2.4 2.5 2.4" /></I>
);
export const Archive = (p: P) => (
  <I {...p}><path d="M3.6 5.4c0-.6.4-1 1-1h14.8c.6 0 1 .4 1 1v2.3c0 .5-.4.9-1 .9H4.6c-.6 0-1-.4-1-.9z" /><path d="M5.2 8.7v9.8c0 .7.5 1.2 1.2 1.2h11.2c.7 0 1.2-.5 1.2-1.2V8.6" /><path d="M10 12.4h4.1" /></I>
);
export const ChartPie = (p: P) => (
  <I {...p}><path d="M11.2 4.3a7.9 7.9 0 1 0 8.5 8.6h-8.4z" /><path d="M14.1 3.9a6.6 6.6 0 0 1 6 6.1h-6z" /></I>
);
export const Mail = (p: P) => (
  <I {...p}><path d="M4.3 6h15.5c.5 0 .9.4.9.9v10.3c0 .6-.4 1-1 1H4.3c-.6 0-1-.4-1-1V7c0-.6.4-1 1-1z" /><path d="m3.7 6.8 8.3 6.1 8.4-6.1" /></I>
);
export const Tags = (p: P) => (
  <I {...p}><path d="M3.9 4.9c0-.6.4-1 1-1h6.2l8.6 8.6c.4.4.4 1 0 1.4l-5.8 5.8c-.4.4-1 .4-1.4 0L3.9 11z" /><path d="M8.2 8.3h.01" /></I>
);
export const Truck = (p: P) => (
  <I {...p}><path d="M3.4 6.4h10.4v10H3.4z" /><path d="M13.8 9.6h3.8l3 3.3v3.5h-6.8" /><circle cx="7.2" cy="17.6" r="1.7" /><circle cx="16.9" cy="17.6" r="1.7" /></I>
);
export const HardHat = (p: P) => (
  <I {...p}><path d="M4.4 16.1a7.6 7.6 0 0 1 15.2 0" /><path d="M3.3 16.4h17.4c.4 0 .6.3.6.6v1.1c0 .4-.3.7-.7.7H3.4c-.4 0-.7-.3-.7-.7v-1.1c0-.3.2-.6.6-.6z" /><path d="M10.1 8.8V5.6c0-.4.3-.7.7-.7h2.4c.4 0 .7.3.7.7v3.2" /></I>
);
export const Ruler = (p: P) => (
  <I {...p}><path d="m3.8 15.6 11.8-11.8c.4-.4 1-.4 1.4 0l3.2 3.2c.4.4.4 1 0 1.4L8.4 20.2c-.4.4-1 .4-1.4 0l-3.2-3.2c-.4-.4-.4-1 0-1.4z" /><path d="m7.6 12 1.8 1.8M10.4 9.2l1.2 1.2M13.2 6.4l1.8 1.8" /></I>
);
export const Users = (p: P) => (
  <I {...p}><circle cx="9.2" cy="8.4" r="3.3" /><path d="M3.4 19.4c.4-3 2.8-5.1 5.8-5.1s5.4 2.1 5.8 5.1" /><path d="M15.6 5.4a3 3 0 0 1 0 5.9M17.6 14.6c1.7.6 2.9 2.4 3.1 4.6" /></I>
);
export const Settings = (p: P) => (
  <I {...p}><circle cx="12" cy="12" r="3" /><path d="M12 3.4v2.2M12 18.4v2.2M20.6 12h-2.2M5.6 12H3.4M18.1 5.9l-1.6 1.6M7.5 16.5l-1.6 1.6M18.1 18.1l-1.6-1.6M7.5 7.5 5.9 5.9" /></I>
);
export const LogOut = (p: P) => (
  <I {...p}><path d="M9.4 4.3H6c-.9 0-1.6.7-1.6 1.6v12.2c0 .9.7 1.6 1.6 1.6h3.4" /><path d="M15.6 16.4 20 12l-4.4-4.4" /><path d="M19.8 12H9.6" /></I>
);
export const Menu = (p: P) => (
  <I {...p}><path d="M4.3 7.1c5.2-.3 10.3-.2 15.4 0M4.3 12.1c5.1.2 10.2.1 15.4-.1M4.3 17.1c5.2-.2 10.3-.1 15.4.1" /></I>
);
export const X = (p: P) => (
  <I {...p}><path d="M6.3 6.2 17.8 17.9M17.7 6.1 6.2 17.8" /></I>
);
export const ClipboardCheck = (p: P) => (
  <I {...p}><path d="M8.6 4.6H6.4c-.7 0-1.2.5-1.2 1.2v13.4c0 .7.5 1.2 1.2 1.2h11.2c.7 0 1.2-.5 1.2-1.2V5.8c0-.7-.5-1.2-1.2-1.2h-2.2" /><path d="M9.3 3.4h5.4c.4 0 .7.3.7.7v1.4c0 .4-.3.7-.7.7H9.3c-.4 0-.7-.3-.7-.7V4.1c0-.4.3-.7.7-.7z" /><path d="m8.8 13.4 2.2 2.2 4.4-4.6" /></I>
);

// ---- actions
export const Plus = (p: P) => (<I {...p}><path d="M12 5.2v13.6M5.2 12.1h13.6" /></I>);
export const Pencil = (p: P) => (
  <I {...p}><path d="M15.4 4.9c.8-.8 2.1-.8 2.9 0l.8.8c.8.8.8 2.1 0 2.9L8.8 18.9l-4.2 1 1-4.2z" /><path d="m13.8 6.6 3.6 3.6" /></I>
);
export const Trash2 = (p: P) => (
  <I {...p}><path d="M4.4 6.6h15.2" /><path d="M9.2 6.4V4.9c0-.5.4-.9.9-.9h3.8c.5 0 .9.4.9.9v1.5" /><path d="m6.1 6.8.9 12.2c.1.7.6 1.2 1.3 1.2h7.4c.7 0 1.2-.5 1.3-1.2l.9-12.2" /><path d="M10.1 10.6v5.6M13.9 10.6v5.6" /></I>
);
export const Download = (p: P) => (
  <I {...p}><path d="M12 4.2v10.6" /><path d="m7.6 10.6 4.4 4.4 4.4-4.4" /><path d="M4.4 15.9v2.5c0 .8.6 1.4 1.4 1.4h12.4c.8 0 1.4-.6 1.4-1.4v-2.5" /></I>
);
export const ArrowDownToLine = Download;
export const Send = (p: P) => (
  <I {...p}><path d="M20.3 3.8 3.8 10.5c-.6.2-.6 1.1 0 1.3l6.1 2.3 2.4 6.2c.2.6 1.1.6 1.3 0z" /><path d="m9.9 14.1 5.1-5.2" /></I>
);
export const Search = (p: P) => (
  <I {...p}><path d="M10.9 4.1a6.8 6.8 0 1 1-.1 13.6 6.8 6.8 0 0 1 .1-13.6z" /><path d="m16 16.1 4.1 4" /></I>
);
export const Save = (p: P) => (
  <I {...p}><path d="M5.4 4.2h10.4l3.9 3.9v10.6c0 .6-.5 1.1-1.1 1.1H5.4c-.6 0-1.1-.5-1.1-1.1V5.3c0-.6.5-1.1 1.1-1.1z" /><path d="M8.2 4.4v4.1h6.4V4.4" /><path d="M7.6 19.6v-5.1c0-.4.3-.7.7-.7h7.4c.4 0 .7.3.7.7v5.1" /></I>
);
export const Paperclip = (p: P) => (
  <I {...p}><path d="m17.8 11.6-6.3 6.5a4.1 4.1 0 0 1-5.8-5.8l6.9-7a2.7 2.7 0 0 1 3.9 3.9l-6.8 6.9a1.4 1.4 0 0 1-2-2l6.2-6.3" /></I>
);
export const Undo2 = (p: P) => (
  <I {...p}><path d="M8.6 14.3 4.2 9.9l4.4-4.4" /><path d="M4.4 9.9h9.4a5.6 5.6 0 0 1 0 11.2h-2.4" /></I>
);
export const RefreshCcw = (p: P) => (
  <I {...p}><path d="M19.4 11.6a7.4 7.4 0 0 0-13-4.6L4.3 9.2" /><path d="M4.2 4.9v4.3h4.3" /><path d="M4.6 12.5a7.4 7.4 0 0 0 13 4.6l2.1-2.2" /><path d="M19.8 19.2v-4.3h-4.3" /></I>
);
export const Play = (p: P) => (<I {...p}><path d="M7.4 5.1c0-.8.9-1.3 1.6-.8l9.5 6.8c.6.4.6 1.3 0 1.7L9 19.6c-.7.5-1.6 0-1.6-.8z" /></I>);
export const Check = (p: P) => (<I {...p}><path d="m5 12.6 4.4 4.3L19.1 7" /></I>);
export const CheckCircle2 = (p: P) => (<I {...p}><path d="M12 3.6a8.4 8.4 0 1 1-.1 16.8A8.4 8.4 0 0 1 12 3.6z" /><path d="m8.3 12.3 2.6 2.6 5-5.3" /></I>);
export const Clock = (p: P) => (<I {...p}><path d="M12 3.7a8.3 8.3 0 1 1-.1 16.6A8.3 8.3 0 0 1 12 3.7z" /><path d="M12 7.6v4.6l3 1.9" /></I>);
export const Bell = (p: P) => (
  <I {...p}><path d="M6.2 16.6c.9-1 1.3-2 1.3-3.6v-2.4a4.6 4.6 0 0 1 9.1-.1V13c0 1.6.4 2.6 1.3 3.6.3.4 0 .9-.4.9H6.6c-.5 0-.7-.5-.4-.9z" /><path d="M10.1 19.9a2.1 2.1 0 0 0 3.9 0" /><path d="M12 3.3v1.4" /></I>
);
export const KeyRound = (p: P) => (
  <I {...p}><circle cx="15.3" cy="8.7" r="4.6" /><path d="M11.9 11.9 4.3 19.6v1.1h2.6l.7-.8v-1.8h1.8l.7-.7v-1.7h1.8l1.8-1.8" /><path d="M16.4 7.6h.01" /></I>
);
export const AtSign = (p: P) => (
  <I {...p}><circle cx="12" cy="12" r="3.6" /><path d="M15.6 8.7v4.4c0 1.4 1 2.3 2.2 2.3s2.3-1 2.3-2.9a8.1 8.1 0 1 0-3.2 6.4" /></I>
);
export const ShieldCheck = (p: P) => (
  <I {...p}><path d="M12 3.4 5 6.1v5.3c0 4.3 3 7.7 7 9.2 4-1.5 7-4.9 7-9.2V6.1z" /><path d="m8.9 12.1 2.2 2.2 4-4.2" /></I>
);
export const UserCheck = (p: P) => (
  <I {...p}><circle cx="9.3" cy="8.2" r="3.4" /><path d="M3.4 19.4c.4-3 2.9-5.2 5.9-5.2 1.6 0 3 .6 4.1 1.6" /><path d="m15.2 17 1.9 1.9 3.6-3.8" /></I>
);
export const UserX = (p: P) => (
  <I {...p}><circle cx="9.3" cy="8.2" r="3.4" /><path d="M3.4 19.4c.4-3 2.9-5.2 5.9-5.2 1.6 0 3 .6 4.1 1.6" /><path d="m15.9 14.9 4.3 4.3M20.2 14.9l-4.3 4.3" /></I>
);
export const FileText = (p: P) => (
  <I {...p}><path d="M6.2 3.6h7.7l4.3 4.5v11.1c0 .7-.5 1.2-1.2 1.2H6.3c-.7 0-1.2-.5-1.2-1.2V4.8c0-.7.4-1.2 1.1-1.2z" /><path d="M13.7 3.8v4.5h4.4" /><path d="M8.6 12.6h6.8M8.6 16h4.6" /></I>
);
export const FileSpreadsheet = (p: P) => (
  <I {...p}><path d="M6.2 3.6h7.7l4.3 4.5v11.1c0 .7-.5 1.2-1.2 1.2H6.3c-.7 0-1.2-.5-1.2-1.2V4.8c0-.7.4-1.2 1.1-1.2z" /><path d="M13.7 3.8v4.5h4.4" /><path d="M8.3 12h7.4v5.4H8.3zM8.3 14.7h7.4M12 12v5.4" /></I>
);
export const Sheet = FileSpreadsheet;
export const BadgePercent = (p: P) => (
  <I {...p}><path d="M12 3.4c1 0 1.4 1.1 2.4 1.4s2-.4 2.8.2.6 1.8 1.1 2.7 1.7 1.1 1.9 2.1-.8 1.6-.8 2.6.8 1.6.6 2.6-1.4 1.2-1.9 2.1-.3 2.1-1.1 2.7-1.9-.1-2.8.2S13 20.6 12 20.6s-1.4-1.1-2.4-1.4-2 .4-2.8-.2-.6-1.8-1.1-2.7-1.7-1.1-1.9-2.1.8-1.6.8-2.6-.8-1.6-.6-2.6 1.4-1.2 1.9-2.1.3-2.1 1.1-2.7 1.9.1 2.8-.2S11 3.4 12 3.4z" /><path d="m9.4 14.6 5.2-5.2M9.6 9.6h.01M14.4 14.4h.01" /></I>
);
export const TrendingUp = (p: P) => (<I {...p}><path d="m3.6 17.2 5.6-5.7 3.6 3.4 7.4-7.6" /><path d="M15.2 7.2h5v5" /></I>);
export const TrendingDown = (p: P) => (<I {...p}><path d="m3.6 7.1 5.6 5.7 3.6-3.4 7.4 7.6" /><path d="M15.2 16.9h5v-5" /></I>);

/** Spinner (keeps the name used across the app). */
export const Loader2 = ({ className }: P) => (
  <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
    <path d="M12 4a8 8 0 1 1-7.6 5.6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
  </svg>
);
