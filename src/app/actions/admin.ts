"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { back, num, str } from "@/lib/flash";
import { parsePriceLines, phoneLogin } from "@/lib/rules";

/** Add price-list items for a supplier, skipping any it already lists. Returns how many were added. */
async function addPriceItems(supplierId: string, text: string) {
  const { items, errors } = parsePriceLines(text);
  const cats = await db.category.findMany({ where: { suppliers: { some: { id: supplierId } } }, select: { id: true } });
  let added = 0;
  for (const i of items) {
    const exists = await db.catalogItem.findUnique({ where: { supplierId_name_unit: { supplierId, name: i.name, unit: i.unit } } });
    if (exists) continue;
    await db.catalogItem.create({ data: { supplierId, name: i.name, unit: i.unit, price: i.price, categoryId: cats.length === 1 ? cats[0].id : null } });
    added++;
  }
  return { added, errors };
}

export async function adminCreateSupplier(fd: FormData) {
  await requireAdmin();
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
          categories: { connect: categoryIds.map((id) => ({ id })) },
        },
      },
    },
  });
  const { added, errors } = await addPriceItems(user.businessId!, str(fd, "priceList"));
  const msg = [
    `${businessName} added and verified. They can sign in with ${email} and the temporary password you set.`,
    added ? `${added} price-list item${added > 1 ? "s" : ""} added.` : "",
    errors.length ? `Couldn't read ${errors.length} price line${errors.length > 1 ? "s" : ""}: “${errors.slice(0, 2).join("”, “")}”. Add them below as Item, unit, price.` : "",
  ].filter(Boolean).join(" ");
  redirect(`/admin/suppliers/${user.businessId}?${errors.length ? "error" : "ok"}=${encodeURIComponent(msg)}`);
}

async function adminSupplier(fd: FormData) {
  await requireAdmin();
  const id = str(fd, "supplierId");
  const s = await db.business.findFirst({ where: { id, type: "SUPPLIER" } });
  if (!s) back("/admin", "error", "That supplier wasn't found.");
  return { s, path: `/admin/suppliers/${id}` };
}

export async function adminAddPriceItems(fd: FormData) {
  const { s, path } = await adminSupplier(fd);
  const { added, errors } = await addPriceItems(s.id, str(fd, "priceList"));
  if (errors.length) back(path, "error", `${added} added. Couldn't read: “${errors.slice(0, 3).join("”, “")}”. Write each line as Item, unit, price.`);
  back(path, "ok", added ? `${added} item${added > 1 ? "s" : ""} added to the price list.` : "Nothing new to add: those items are already listed.");
}

export async function adminUpdatePriceItem(fd: FormData) {
  const { s, path } = await adminSupplier(fd);
  const item = await db.catalogItem.findFirst({ where: { id: str(fd, "itemId"), supplierId: s.id } });
  if (!item) back(path, "error", "That item wasn't found.");
  if (str(fd, "remove") === "1") {
    await db.catalogItem.delete({ where: { id: item.id } });
    back(path, "ok", `${item.name} removed.`);
  }
  const price = Math.round(num(fd, "price"));
  if (!(price > 0)) back(path, "error", "Enter a price in Naira.");
  await db.catalogItem.update({ where: { id: item.id }, data: { price, available: str(fd, "available") === "on" } });
  back(path, "ok", `${item.name} updated.`);
}

export async function adminResetPassword(fd: FormData) {
  const { s, path } = await adminSupplier(fd);
  const password = str(fd, "password");
  if (password.length < 8) back(path, "error", "Use at least 8 characters.");
  const owner = await db.user.findFirst({ where: { businessId: s.id }, orderBy: { createdAt: "asc" } });
  if (!owner) back(path, "error", "This supplier has no login.");
  await db.user.update({ where: { id: owner.id }, data: { passwordHash: await bcrypt.hash(password, 10) } });
  back(path, "ok", `New password set for ${owner.email}. Give it to ${owner.name} directly.`);
}
