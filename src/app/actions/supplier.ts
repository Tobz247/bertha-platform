"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, requireSupplier } from "@/lib/auth";
import { db } from "@/lib/db";
import { back, num, str } from "@/lib/flash";
import { parseDateInput, poNo, rfqNo } from "@/lib/format";
import { notify } from "@/lib/notify";
import { visibleToSupplier } from "@/lib/requests";

/* ---------------- quotes ---------------- */

export async function submitQuote(fd: FormData) {
  const { business } = await requireSupplier();
  const requestId = str(fd, "requestId");
  const path = `/supplier/requests/${requestId}`;
  if (business.verification !== "VERIFIED") back(path, "error", "Your account is still being checked. You can quote once it's verified.");

  const categoryIds = (await db.category.findMany({ where: { suppliers: { some: { id: business.id } } }, select: { id: true } })).map((c) => c.id);
  const req = await db.request.findFirst({
    where: { id: requestId, ...visibleToSupplier(business.id, categoryIds) },
    include: { lines: true },
  });
  if (!req || req.status !== "OPEN") back(path, "error", "This request is no longer taking quotes.");

  const priced = req.lines
    .map((l) => ({ requestLineId: l.id, unitPrice: Math.round(num(fd, `price_${l.id}`)) }))
    .filter((l) => l.unitPrice > 0);
  if (priced.length === 0) back(path, "error", "Price at least one item.");
  const deliveryDate = str(fd, "deliveryDate");
  const validUntil = str(fd, "validUntil");
  if (!deliveryDate || !validUntil) back(path, "error", "Add a delivery date and how long the quote is valid.");
  const fee = Math.max(0, Math.round(num(fd, "deliveryFee") || 0));

  const existing = await db.quote.findUnique({ where: { requestId_supplierId: { requestId, supplierId: business.id } } });
  if (existing && existing.status !== "SUBMITTED" && existing.status !== "WITHDRAWN") back(path, "error", "This quote has already been decided.");

  const data = {
    deliveryFee: fee,
    deliveryDate: parseDateInput(deliveryDate),
    validUntil: parseDateInput(validUntil),
    notes: str(fd, "notes") || null,
    status: "SUBMITTED" as const,
  };
  if (existing) {
    await db.$transaction([
      db.quoteLine.deleteMany({ where: { quoteId: existing.id } }),
      db.quote.update({ where: { id: existing.id }, data: { ...data, lines: { create: priced } } }),
    ]);
  } else {
    await db.quote.create({ data: { ...data, requestId, supplierId: business.id, lines: { create: priced } } });
  }
  await notify(req.buyerId, `${business.name} sent a quote for ${rfqNo(req.number)}`);
  revalidatePath("/supplier");
  back(path, "ok", existing ? "Quote updated." : "Quote sent. The buyer will see it next to the others.");
}

export async function withdrawQuote(fd: FormData) {
  const { business } = await requireSupplier();
  const requestId = str(fd, "requestId");
  const q = await db.quote.findUnique({ where: { requestId_supplierId: { requestId, supplierId: business.id } } });
  if (!q || q.status !== "SUBMITTED") back(`/supplier/requests/${requestId}`, "error", "There's no open quote to withdraw.");
  await db.quote.update({ where: { id: q.id }, data: { status: "WITHDRAWN" } });
  back(`/supplier/requests/${requestId}`, "ok", "Quote withdrawn.");
}

/* ---------------- orders ---------------- */

async function ownOrder(id: string) {
  const { user, business } = await requireSupplier();
  const order = await db.purchaseOrder.findFirst({ where: { id, supplierId: business.id }, include: { lines: true, invoice: true } });
  if (!order) back("/supplier/orders", "error", "That order wasn't found.");
  return { user, business, order };
}

export async function supplierOrderStep(fd: FormData) {
  const id = str(fd, "orderId");
  const step = str(fd, "step");
  const { user, business, order } = await ownOrder(id);
  const path = `/supplier/orders/${id}`;
  const moves: Record<string, { from: string[]; to: "CONFIRMED" | "DECLINED" | "DISPATCHED"; msg: string }> = {
    accept: { from: ["AWAITING_SUPPLIER"], to: "CONFIRMED", msg: "Confirmed by supplier" },
    decline: { from: ["AWAITING_SUPPLIER"], to: "DECLINED", msg: "Declined by supplier" },
    dispatch: { from: ["CONFIRMED"], to: "DISPATCHED", msg: "Dispatched" },
  };
  const m = moves[step];
  if (!m || !m.from.includes(order.status)) back(path, "error", "That step isn't available for this order now.");
  const note = str(fd, "note");
  await db.purchaseOrder.update({
    where: { id },
    data: {
      status: m.to,
      decisionNote: step === "decline" ? note || null : order.decisionNote,
      events: { create: { actorId: user.id, message: m.msg + (step === "decline" && note ? `: ${note}` : "") } },
    },
  });
  await notify(order.buyerId, `${business.name}: ${poNo(order.number)} ${m.msg.toLowerCase()}`);
  revalidatePath("/supplier", "layout");
  back(path, "ok", step === "accept" ? "Order accepted." : step === "decline" ? "Order declined." : "Marked as dispatched. The buyer has been told.");
}

export async function raiseInvoice(fd: FormData) {
  const id = str(fd, "orderId");
  const { user, order } = await ownOrder(id);
  const path = `/supplier/orders/${id}`;
  if (!["DISPATCHED", "RECEIVED"].includes(order.status)) back(path, "error", "Raise the invoice once the goods are dispatched.");
  const number = str(fd, "number");
  const amount = Math.round(num(fd, "amount"));
  if (!number || !(amount > 0)) back(path, "error", "Enter your invoice number and amount.");
  await db.invoice.upsert({
    where: { orderId: id },
    update: { number, amount, issuedAt: new Date() },
    create: { orderId: id, number, amount },
  });
  await db.orderEvent.create({ data: { orderId: id, actorId: user.id, message: `Invoice ${number} raised for ₦${amount.toLocaleString("en-NG")}` } });
  await notify(order.buyerId, `Invoice ${number} raised for ${poNo(order.number)}`);
  back(path, "ok", "Invoice sent to the buyer.");
}

/* ---------------- profile ---------------- */

export async function updateSupplierProfile(fd: FormData) {
  const { business } = await requireSupplier();
  const categoryIds = fd.getAll("categories").filter((v): v is string => typeof v === "string");
  if (categoryIds.length === 0) back("/supplier/profile", "error", "Pick at least one category.");
  await db.business.update({
    where: { id: business.id },
    data: {
      phone: str(fd, "phone") || business.phone,
      address: str(fd, "address") || business.address,
      area: str(fd, "area") || business.area,
      cacNumber: str(fd, "cacNumber") || null,
      bankName: str(fd, "bankName") || null,
      bankAccountNumber: str(fd, "bankAccountNumber") || null,
      bankAccountName: str(fd, "bankAccountName") || null,
      categories: { set: categoryIds.map((id) => ({ id })) },
    },
  });
  back("/supplier/profile", "ok", "Profile saved.");
}

/* ---------------- platform admin ---------------- */

export async function setVerification(fd: FormData) {
  await requireAdmin();
  const id = str(fd, "businessId");
  const status = str(fd, "status");
  if (!["VERIFIED", "REJECTED", "PENDING"].includes(status)) back("/admin", "error", "Unknown status.");
  const b = await db.business.update({ where: { id }, data: { verification: status as "VERIFIED" | "REJECTED" | "PENDING" } });
  await notify(b.id, status === "VERIFIED" ? "Your Bertha account is verified. You can now send quotes." : "Your Bertha account needs attention. Please contact us.");
  back("/admin", "ok", `${b.name} marked ${status.toLowerCase()}.`);
}

export async function addCategory(fd: FormData) {
  await requireAdmin();
  const name = str(fd, "name");
  const units = str(fd, "units");
  if (!name) back("/admin/categories", "error", "Enter a category name.");
  if (await db.category.findUnique({ where: { name } })) back("/admin/categories", "error", "That category already exists.");
  await db.category.create({ data: { name, units: units || "kg" } });
  back("/admin/categories", "ok", "Category added.");
}
