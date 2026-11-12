import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "./db";
import { back } from "./flash";
import { can, type Permission } from "./roles";
import { readSessionUserId } from "./session";

export const currentUser = cache(async () => {
  const id = await readSessionUserId();
  if (!id) return null;
  const user = await db.user.findUnique({ where: { id }, include: { business: true } });
  // A login turned off by an owner or admin stops working straight away.
  return user?.active ? user : null;
});

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof currentUser>>>;

export async function requireUser() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * A signed-in member of a buyer business (hotel, restaurant, caterer...).
 * Pass a permission to also check their role; people without it are sent home with a message.
 */
export async function requireBuyer(permission?: Permission) {
  const user = await requireUser();
  if (!user.business || user.business.type !== "BUYER") redirect("/");
  if (permission && !can(user, permission)) {
    back("/dashboard", "error", "Your role doesn't include that. Ask an owner or manager if you need it.");
  }
  return { user, business: user.business };
}

/** A signed-in member of a supplier business. */
export async function requireSupplier() {
  const user = await requireUser();
  if (!user.business || user.business.type !== "SUPPLIER") redirect("/");
  return { user, business: user.business };
}

/** Emails listed in ADMIN_EMAILS get the platform admin pages. */
export function isAdminEmail(email: string) {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase());
}

export async function requireAdmin() {
  const user = await requireUser();
  if (!user.isPlatformAdmin) redirect("/");
  return user;
}

/** Owners and managers can approve large orders. */
export function canApprove(user: { role: string }) {
  return can(user, "approve");
}

export { can } from "./roles";
