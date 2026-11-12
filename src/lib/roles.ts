// Who can do what. Pure functions (no database), so they are easy to test and to import anywhere.
//
// To protect a new page or action, add a permission to `Permission` and list the roles in `GRANTS`,
// then call `requireBuyer("your_permission")` (pages and server actions) or `can(user, "...")` (to hide buttons).

export type Role = "OWNER" | "MANAGER" | "STAFF" | "PROCUREMENT" | "KITCHEN" | "STOREKEEPER" | "ACCOUNTS";

export type Permission =
  | "requests" // send requests for quotes, compare and award quotes
  | "order" // order from supplier price lists, cancel orders
  | "approve" // approve or reject orders above the approval limit
  | "receive" // record goods received against an order
  | "pay" // record payments, check invoices
  | "rate" // rate a supplier after delivery
  | "stock" // add stock items, adjust counts, record waste, cut portions
  | "recipes" // edit recipes, record dishes sold (takes stock out)
  | "kitchen_request" // ask the store / procurement for items (kitchen requisitions)
  | "review_kitchen_request" // review kitchen requisitions and turn them into supplier requests
  | "team" // business settings, add people, change roles
  | "view_orders"
  | "view_stock";

const ALL_BUYER: Role[] = ["OWNER", "MANAGER", "STAFF", "PROCUREMENT", "KITCHEN", "STOREKEEPER", "ACCOUNTS"];

const GRANTS: Record<Permission, Role[]> = {
  requests: ["OWNER", "MANAGER", "STAFF", "PROCUREMENT"],
  order: ["OWNER", "MANAGER", "STAFF", "PROCUREMENT"],
  approve: ["OWNER", "MANAGER"],
  receive: ["OWNER", "MANAGER", "STAFF", "STOREKEEPER"],
  pay: ["OWNER", "MANAGER", "STAFF", "ACCOUNTS"],
  rate: ["OWNER", "MANAGER", "STAFF", "PROCUREMENT", "STOREKEEPER"],
  stock: ["OWNER", "MANAGER", "STAFF", "STOREKEEPER"],
  recipes: ["OWNER", "MANAGER", "STAFF", "KITCHEN"],
  kitchen_request: ["OWNER", "MANAGER", "STAFF", "KITCHEN"],
  review_kitchen_request: ["OWNER", "MANAGER", "STAFF", "PROCUREMENT"],
  team: ["OWNER", "MANAGER"],
  view_orders: ["OWNER", "MANAGER", "STAFF", "PROCUREMENT", "STOREKEEPER", "ACCOUNTS"],
  view_stock: ALL_BUYER,
};

export function can(user: { role: string } | null | undefined, permission: Permission): boolean {
  if (!user) return false;
  return (GRANTS[permission] as string[]).includes(user.role);
}

/** Roles a buyer business (hotel, restaurant) can give its people, in the order shown on forms. */
export const BUYER_ROLES: { role: Role; label: string; does: string }[] = [
  { role: "OWNER", label: "Owner", does: "Everything, including team and settings" },
  { role: "MANAGER", label: "Manager", does: "Everything, approves large orders, manages the team" },
  { role: "PROCUREMENT", label: "Procurement", does: "Requests for quotes, orders, reviews kitchen requests" },
  { role: "KITCHEN", label: "Kitchen", does: "Asks for items, recipes and dishes sold" },
  { role: "STOREKEEPER", label: "Store keeper", does: "Receives deliveries, stock counts, portioning" },
  { role: "ACCOUNTS", label: "Accounts", does: "Goods received notes, invoices and payments" },
  { role: "STAFF", label: "General staff", does: "Day-to-day buying, stock and deliveries (no approvals)" },
];

export function roleLabel(role: string): string {
  return BUYER_ROLES.find((r) => r.role === role)?.label ?? role;
}

export function isRole(value: string): value is Role {
  return BUYER_ROLES.some((r) => r.role === value);
}

/**
 * Can `actor` give `target` the role `next` (or turn them off)?
 * Returns the reason it isn't allowed, or null when it is.
 */
export function roleChangeProblem(args: {
  actor: { id: string; role: string };
  target: { id: string; role: string; active: boolean };
  next: { role: string; active: boolean };
  activeOwners: number; // active owners in the business right now, including the target
}): string | null {
  const { actor, target, next, activeOwners } = args;
  if (!can(actor, "team")) return "Only an owner or manager can change the team.";
  if (!isRole(next.role)) return "Pick a role from the list.";
  if (actor.id === target.id) return "You can't change your own role or turn off your own login. Ask another owner.";
  const touchesOwner = target.role === "OWNER" || next.role === "OWNER";
  if (touchesOwner && actor.role !== "OWNER") return "Only an owner can make someone an owner or change an owner.";
  const losesOwner = target.role === "OWNER" && target.active && (next.role !== "OWNER" || !next.active);
  if (losesOwner && activeOwners <= 1) return "The business needs at least one active owner.";
  return null;
}
