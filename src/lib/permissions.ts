export type Role = "owner" | "staff" | "viewer";

export type Action =
  | "view"
  | "stock.in"            // record stock received
  | "stock.out"           // record stock issued
  | "stock.move"          // either stock in or stock out (derived)
  | "item.write"          // add / edit items
  | "item.archive"
  | "item.delete"         // permanently delete items and their history
  | "catalog.write"       // categories, suppliers, custom units
  | "workers.manage"      // add / edit the workers list
  | "conversion.global"   // global unit conversion rules
  | "txn.reverse"
  | "report.generate"
  | "audit.view"          // usage analysis & audit log
  | "settings.write"
  | "users.manage"
  | "mail.send"           // send emails, receipts and reports from the app
  | "stock.count"         // record physical stock counts
  | "count.approve";      // approve / reject counts (posts the shortage or excess)

/** Permissions an owner can switch on or off per user (owners always have everything). */
export const TOGGLEABLE: { action: Exclude<Action, "view" | "stock.move" | "settings.write" | "users.manage" | "conversion.global">; label: string; hint: string }[] = [
  { action: "stock.in", label: "Record Stock In", hint: "Receive stock into the store" },
  { action: "stock.out", label: "Record Stock Out", hint: "Issue or remove stock from the store" },
  { action: "item.write", label: "Add and edit items", hint: "Register new items and change item details" },
  { action: "catalog.write", label: "Manage categories, suppliers and units", hint: "" },
  { action: "workers.manage", label: "Manage the workers list", hint: "Add or edit names of workers who take items" },
  { action: "report.generate", label: "Save reports to Report History", hint: "Viewing and downloading reports is always allowed" },
  { action: "audit.view", label: "See usage analysis and audit log", hint: "Who took what, when, and every change made" },
  { action: "txn.reverse", label: "Reverse wrong transactions", hint: "Corrections are recorded with a reason" },
  { action: "item.archive", label: "Archive items, categories and suppliers", hint: "" },
  { action: "item.delete", label: "Delete items permanently", hint: "Removes the item and all its stock history" },
  { action: "mail.send", label: "Send emails", hint: "Email messages, receipts and reports to people" },
  { action: "stock.count", label: "Record stock counts", hint: "Enter what was physically counted on the shelf" },
  { action: "count.approve", label: "Approve stock counts", hint: "Posts shortages and excesses to the stock balance" },
];

export const ROLE_DEFAULTS: Record<Role, Action[]> = {
  owner: [
    "view", "stock.in", "stock.out", "item.write", "item.archive", "item.delete", "catalog.write", "workers.manage", "conversion.global",
    "txn.reverse", "report.generate", "audit.view", "settings.write", "users.manage", "mail.send", "stock.count", "count.approve",
  ],
  staff: ["view", "stock.in", "stock.out", "item.write", "catalog.write", "workers.manage", "report.generate", "mail.send", "stock.count"],
  viewer: ["view"],
};

export type Subject = Role | { role: Role; permissions?: string[] | null } | null | undefined;

/** Effective permissions: owners get everything; others get their custom list or their role defaults. */
export function permissionsOf(subject: Subject): Action[] {
  if (!subject) return [];
  const role = typeof subject === "string" ? subject : subject.role;
  if (role === "owner") return ROLE_DEFAULTS.owner;
  const custom = typeof subject === "string" ? null : subject.permissions;
  const allowed = new Set<string>(TOGGLEABLE.map((t) => t.action));
  const list = custom ? (custom.filter((a) => allowed.has(a)) as Action[]) : ROLE_DEFAULTS[role] ?? [];
  return Array.from(new Set<Action>(["view", ...list]));
}

export function can(subject: Subject, action: Action): boolean {
  const perms = permissionsOf(subject);
  if (action === "stock.move") return perms.includes("stock.in") || perms.includes("stock.out");
  return perms.includes(action);
}

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner / Admin",
  staff: "Staff",
  viewer: "Viewer / Manager (read-only)",
};
