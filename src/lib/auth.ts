import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "./db";
import { readSessionUserId } from "./session";

export const currentUser = cache(async () => {
  const id = await readSessionUserId();
  if (!id) return null;
  return db.user.findUnique({ where: { id }, include: { business: true } });
});

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof currentUser>>>;

export async function requireUser() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

/** A signed-in member of a buyer business (hotel, restaurant, caterer...). */
export async function requireBuyer() {
  const user = await requireUser();
  if (!user.business || user.business.type !== "BUYER") redirect("/");
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

/** Owners and managers can approve large orders and change business settings. */
export function canApprove(user: { role: string }) {
  return user.role === "OWNER" || user.role === "MANAGER";
}
