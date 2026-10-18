export type Role = "owner" | "staff" | "viewer";

export type Action =
  | "view"
  | "stock.move"          // stock in / stock out
  | "item.write"          // add / edit items
  | "item.archive"
  | "catalog.write"       // categories, suppliers, custom units
  | "conversion.global"   // global unit conversion rules
  | "txn.reverse"
  | "report.generate"
  | "settings.write"
  | "users.manage"
  | "audit.view";

const MATRIX: Record<Role, Action[]> = {
  owner: [
    "view", "stock.move", "item.write", "item.archive", "catalog.write", "conversion.global",
    "txn.reverse", "report.generate", "settings.write", "users.manage", "audit.view",
  ],
  staff: ["view", "stock.move", "item.write", "catalog.write", "report.generate"],
  viewer: ["view"],
};

export function can(role: Role | undefined | null, action: Action): boolean {
  if (!role) return false;
  return MATRIX[role]?.includes(action) ?? false;
}

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner / Admin",
  staff: "Staff",
  viewer: "Viewer / Manager (read-only)",
};
