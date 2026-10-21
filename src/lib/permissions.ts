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
  | "count.approve"       // approve / reject counts (posts the shortage or excess)
  | "activity.view"       // see what everyone does in the app, with notifications
  | "page.transactions"   // open the Transactions page
  | "page.low_stock"      // open the Low Stock page
  | "page.reports"        // open Reports (and download them)
  | "page.report_history" // open Report History
  | "page.setup"          // open Categories, Suppliers, Workers and Units
  | "price.edit";         // change the price of stock on hand

/** Permissions an owner can switch on or off per user (owners always have everything). */
export type Toggle = {
  action: Exclude<Action, "view" | "stock.move" | "settings.write" | "users.manage" | "conversion.global">;
  label: string; hint: string;
  /** "page" = a sidebar page they can open; "action" = something they can do. */
  group: "page" | "action";
};
export const TOGGLEABLE: Toggle[] = [
  // Sidebar pages
  { group: "page", action: "page.transactions", label: "Transactions", hint: "Every stock movement with receipts" },
  { group: "page", action: "page.low_stock", label: "Low Stock", hint: "Items running low or out" },
  { group: "page", action: "stock.count", label: "Stock Count", hint: "Enter what was physically counted on the shelf" },
  { group: "page", action: "page.reports", label: "Reports", hint: "View and download stock reports" },
  { group: "page", action: "page.report_history", label: "Report History", hint: "Saved and emailed reports" },
  { group: "page", action: "audit.view", label: "Audit & Analytics", hint: "Spending, usage, prices and the change log" },
  { group: "page", action: "activity.view", label: "Activity (everyone)", hint: "See what every user does, with notifications. Without it they only see their own." },
  { group: "page", action: "mail.send", label: "Send Email", hint: "Email messages, receipts and reports to people" },
  { group: "page", action: "page.setup", label: "Categories, Suppliers, Workers and Units", hint: "The setup lists" },
  // What they can do
  { group: "action", action: "stock.in", label: "Record Stock In", hint: "Receive stock into the store" },
  { group: "action", action: "stock.out", label: "Record Stock Out", hint: "Issue or remove stock from the store" },
  { group: "action", action: "price.edit", label: "Change prices", hint: "Re-price stock on hand when prices change. Every change is recorded." },
  { group: "action", action: "item.write", label: "Add and edit items", hint: "Register new items and change item details" },
  { group: "action", action: "catalog.write", label: "Manage categories, suppliers and units", hint: "" },
  { group: "action", action: "workers.manage", label: "Manage the workers list", hint: "Add or edit names of workers who take items" },
  { group: "action", action: "report.generate", label: "Save reports to Report History", hint: "" },
  { group: "action", action: "txn.reverse", label: "Reverse wrong transactions", hint: "Corrections are recorded with a reason" },
  { group: "action", action: "item.archive", label: "Archive items, categories and suppliers", hint: "" },
  { group: "action", action: "item.delete", label: "Delete items permanently", hint: "Removes the item and all its stock history" },
  { group: "action", action: "count.approve", label: "Approve stock counts", hint: "Posts shortages and excesses to the stock balance" },
];

const PAGES: Action[] = ["page.transactions", "page.low_stock", "page.reports", "page.report_history", "page.setup"];

export const ROLE_DEFAULTS: Record<Role, Action[]> = {
  owner: [
    "view", "stock.in", "stock.out", "item.write", "item.archive", "item.delete", "catalog.write", "workers.manage", "conversion.global",
    "txn.reverse", "report.generate", "audit.view", "settings.write", "users.manage", "mail.send", "stock.count", "count.approve",
    "activity.view", "price.edit", ...PAGES,
  ],
  staff: ["view", "stock.in", "stock.out", "item.write", "catalog.write", "workers.manage", "report.generate", "mail.send", "stock.count", ...PAGES],
  viewer: ["view", ...PAGES],
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
