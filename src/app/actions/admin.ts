"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth";
import { isRole, roleLabel } from "@/lib/roles";
import { db } from "@/lib/db";
import { back, num, str } from "@/lib/flash";
import { logPriceChange } from "@/lib/consistency";
import { phoneLogin } from "@/lib/rules";
import { applyPriceLines, criteriaFromForm, saveRateCard } from "@/lib/supplier-data";

export async function adminCreateSupplier(fd: FormData) {
  const admin = await requireAdmin();
  const path = "/admin/suppliers/new";
  const businessName = str(fd, "businessName");
  const name = str(fd, "name");
  const phone = str(fd, "phone");
  const area = str(fd, "area");
  const address = str(fd, "address");
  const password = str(fd, "password");
  const categoryIds = fd.getAll("categories").filter((v): v is string => typeof v === "string");
  const email = (str(fd, "email") || phoneLogin(phone)).toLowerCase();

  if (!businessName || !name || !phone || !address || !area) back(path, "error", "Fill in the business name, contact person, phone, area and address.");
  if (categoryIds.length === 0) back(path, "error", "Pick at least one category they supply.");
  if (password.length < 8) back(path, "error", "Set a temporary password of at least 8 characters.");
  if (await db.user.findUnique({ where: { email } })) {
    back(path, "error", str(fd, "email") ? `Someone already signs in with ${email}. Use another email.` : "That phone number already has a login. Enter an email for this supplier instead.");
  }

  const user = await db.user.create({
    data: {
      name,
      email,
      phone,
      role: "OWNER",
      passwordHash: await bcrypt.hash(password, 10),
      business: {
        create: {
          name: businessName,
          type: "SUPPLIER",
          phone,
          address,
          area,
          cacNumber: str(fd, "cacNumber") || null,
          verification: "VERIFIED",
          bankName: str(fd, "bankName") || null,
          bankAccountNumber: str(fd, "bankAccountNumber") || null,
          bankAccountName: str(fd, "bankAccountName") || null,
          deliveryFee: Math.max(0, Math.round(num(fd, "deliveryFee") || 0)),
          ...criteriaFromForm(fd),
          categories: { connect: categoryIds.map((id) => ({ id })) },
        },
      },
    },
  });
  const { added, errors } = await applyPriceLines(user.businessId!, str(fd, "priceList"), { updateExisting: false, source: "ADMIN" });
  await audit(admin, "admin.supplier_added", `${admin.name} added supplier ${businessName} (login ${email}, ${added} price items)`, { businessId: user.businessId, targetType: "Business", targetId: user.businessId! });
  const msg = [
    `${businessName} added and verified. They can sign in with ${email} and the temporary password you set.`,
    added ? `${added} price-list item${added > 1 ? "s" : ""} added.` : "",
    errors.length ? `Couldn't read ${errors.length} price line${errors.length > 1 ? "s" : ""}: “${errors.slice(0, 2).join("”, “")}”. Add them below as Item, unit, price.` : "",
  ].filter(Boolean).join(" ");
  redirect(`/admin/suppliers/${user.businessId}?${errors.length ? "error" : "ok"}=${encodeURIComponent(msg)}`);
}

async function adminSupplier(fd: FormData) {
  const admin = await requireAdmin();
  const id = str(fd, "supplierId");
  const s = await db.business.findFirst({ where: { id, type: "SUPPLIER" } });
  if (!s) back("/admin", "error", "That supplier wasn't found.");
  return { admin, s, path: `/admin/suppliers/${id}` };
}

export async function adminAddPriceItems(fd: FormData) {
  const { admin, s, path } = await adminSupplier(fd);
  const { added, errors } = await applyPriceLines(s.id, str(fd, "priceList"), { updateExisting: false, source: "ADMIN" });
  if (added) await audit(admin, "admin.prices_added", `${admin.name} added ${added} price-list item${added > 1 ? "s" : ""} for ${s.name}`, { businessId: s.id, targetType: "Business", targetId: s.id });
  if (errors.length) back(path, "error", `${added} added. Couldn't read: “${errors.slice(0, 3).join("”, “")}”. Write each line as Item, unit, price.`);
  back(path, "ok", added ? `${added} item${added > 1 ? "s" : ""} added to the price list.` : "Nothing new to add: those items are already listed.");
}

export async function adminUpdatePriceItem(fd: FormData) {
  const { admin, s, path } = await adminSupplier(fd);
  const item = await db.catalogItem.findFirst({ where: { id: str(fd, "itemId"), supplierId: s.id } });
  if (!item) back(path, "error", "That item wasn't found.");
  if (str(fd, "remove") === "1") {
    await db.catalogItem.delete({ where: { id: item.id } });
    await audit(admin, "admin.price_removed", `${admin.name} removed ${item.name} (${item.unit}) from ${s.name}'s price list`, { businessId: s.id, targetType: "CatalogItem", targetId: item.id });
    back(path, "ok", `${item.name} removed.`);
  }
  const price = Math.round(num(fd, "price"));
  if (!(price > 0)) back(path, "error", "Enter a price in Naira.");
  const available = str(fd, "available") === "on";
  await db.catalogItem.update({ where: { id: item.id }, data: { price, available } });
  await logPriceChange({ supplierId: s.id, itemId: item.id, name: item.name, unit: item.unit, oldPrice: item.price, newPrice: price, source: "ADMIN" });
  if (price !== item.price || available !== item.available) {
    const changes = [price !== item.price ? `price ₦${item.price.toLocaleString("en-NG")} → ₦${price.toLocaleString("en-NG")}` : "", available !== item.available ? (available ? "now available" : "marked unavailable") : ""].filter(Boolean).join(", ");
    await audit(admin, "admin.price_changed", `${admin.name} changed ${s.name}'s ${item.name} (${item.unit}): ${changes}`, { businessId: s.id, targetType: "CatalogItem", targetId: item.id });
  }
  back(path, "ok", `${item.name} updated.`);
}

export async function adminResetPassword(fd: FormData) {
  const { admin, s, path } = await adminSupplier(fd);
  const password = str(fd, "password");
  if (password.length < 8) back(path, "error", "Use at least 8 characters.");
  const owner = await db.user.findFirst({ where: { businessId: s.id }, orderBy: { createdAt: "asc" } });
  if (!owner) back(path, "error", "This supplier has no login.");
  await db.user.update({ where: { id: owner.id }, data: { passwordHash: await bcrypt.hash(password, 10) } });
  await audit(admin, "admin.password_reset", `${admin.name} set a new password for ${owner.name} (${owner.email}) at ${s.name}`, { businessId: s.id, targetType: "User", targetId: owner.id });
  back(path, "ok", `New password set for ${owner.email}. Give it to ${owner.name} directly.`);
}

/** Platform admin changes any person's role, or turns their login off or on. */
export async function adminUpdateUser(fd: FormData) {
  const admin = await requireAdmin();
  const path = "/admin/users";
  const target = await db.user.findUnique({ where: { id: str(fd, "userId") }, include: { business: true } });
  if (!target) back(path, "error", "That person wasn't found.");
  if (target.id === admin.id) back(path, "error", "You can't change your own login here.");
  const role = str(fd, "role") || target.role;
  const active = str(fd, "active") ? str(fd, "active") === "1" : target.active;
  if (!isRole(role)) back(path, "error", "Pick a role from the list.");
  if (target.business?.type === "SUPPLIER" && !["OWNER", "MANAGER", "STAFF"].includes(role)) {
    back(path, "error", "Supplier staff can only be Owner, Manager or General staff.");
  }
  if (role === target.role && active === target.active) back(path, "ok", "Nothing changed.");
  await db.user.update({ where: { id: target.id }, data: { role, active } });
  const what = [
    role !== target.role ? `changed ${target.name} from ${roleLabel(target.role)} to ${roleLabel(role)}` : "",
    active !== target.active ? `${active ? "turned back on" : "turned off"} ${target.name}'s login` : "",
  ].filter(Boolean).join(" and ");
  await audit(admin, active !== target.active ? (active ? "admin.user_reactivated" : "admin.user_deactivated") : "admin.role_changed", `${admin.name} ${what}${target.business ? ` at ${target.business.name}` : ""}`, {
    businessId: target.businessId,
    targetType: "User",
    targetId: target.id,
  });
  back(path, "ok", `Done: ${what}.`);
}

export async function adminUpdateCriteria(fd: FormData) {
  const { admin, s, path } = await adminSupplier(fd);
  await db.business.update({ where: { id: s.id }, data: { cacNumber: str(fd, "cacNumber") || null, ...criteriaFromForm(fd) } });
  await audit(admin, "admin.supplier_details", `${admin.name} updated ${s.name}'s supplier details`, { businessId: s.id, targetType: "Business", targetId: s.id });
  back(path, "ok", "Supplier details saved.");
}

export async function adminUploadRateCard(fd: FormData) {
  const { admin, s, path } = await adminSupplier(fd);
  const r = await saveRateCard(fd, s.id, `${admin.name} (Bertha)`);
  if (r.ok) await audit(admin, "admin.rate_card_uploaded", `${admin.name} uploaded a rate card for ${s.name}. ${r.ok}`, { businessId: s.id, targetType: "Business", targetId: s.id });
  if ("error" in r && r.error) back(path, "error", r.error);
  back(path, "ok", r.ok!);
}

export async function adminDeleteRateCard(fd: FormData) {
  const { admin, s, path } = await adminSupplier(fd);
  const card = await db.rateCard.findFirst({ where: { id: str(fd, "rateCardId"), supplierId: s.id }, select: { fileName: true } });
  if (card) await audit(admin, "admin.rate_card_removed", `${admin.name} removed rate card ${card.fileName} from ${s.name}`, { businessId: s.id, targetType: "Business", targetId: s.id });
  await db.rateCard.deleteMany({ where: { id: str(fd, "rateCardId"), supplierId: s.id } });
  back(path, "ok", "Rate card removed.");
}
