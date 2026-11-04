"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { StorageLocation } from "@prisma/client";
import { canApprove, requireBuyer } from "@/lib/auth";
import { db } from "@/lib/db";
import { back, num, str } from "@/lib/flash";
import { parseDateInput, poNo, rfqNo } from "@/lib/format";
import { notify } from "@/lib/notify";
import { addDays, needsApproval, orderTotal, round3, startOfDay, takeFromBatches } from "@/lib/rules";

const LOCATIONS: StorageLocation[] = ["DRY_STORE", "COLD_ROOM", "FREEZER", "OTHER"];

/* ---------------- requests ---------------- */

export async function createRequest(fd: FormData) {
  const { user, business } = await requireBuyer();
  const title = str(fd, "title");
  const categoryId = str(fd, "categoryId");
  const neededBy = str(fd, "neededBy");
  const quoteDeadline = str(fd, "quoteDeadline");
  const deliveryAddress = str(fd, "deliveryAddress") || business.address;
  const audience = str(fd, "audience") === "SHORTLIST" ? "SHORTLIST" : "ALL_VERIFIED";
  const shortlist = fd.getAll("shortlist").filter((v): v is string => typeof v === "string");
  const products = fd.getAll("product").map(String);
  const quantities = fd.getAll("quantity").map((v) => Number(String(v).replace(/,/g, "")));
  const units = fd.getAll("unit").map(String);

  const lines = products
    .map((p, i) => ({ product: p.trim(), quantity: quantities[i], unit: (units[i] ?? "").trim() }))
    .filter((l) => l.product);

  const fail = (m: string) => back("/requests/new", "error", m);
  if (!title) fail("Give the request a name, such as “Weekend vegetables”.");
  if (!categoryId) fail("Choose a category so the right suppliers see it.");
  if (!neededBy) fail("Say when you need the goods.");
  if (lines.length === 0) fail("Add at least one item.");
  if (lines.some((l) => !(l.quantity > 0) || !l.unit)) fail("Every item needs a quantity above 0 and a unit.");
  if (audience === "SHORTLIST" && shortlist.length === 0) fail("Pick at least one supplier for your shortlist.");

  const needed = parseDateInput(neededBy);
  const deadline = quoteDeadline ? parseDateInput(quoteDeadline) : addDays(new Date(), 1);
  if (startOfDay(needed) < startOfDay(new Date())) fail("The date needed can't be in the past.");

  const req = await db.request.create({
    data: {
      title,
      buyerId: business.id,
      categoryId,
      deliveryAddress,
      neededBy: needed,
      quoteDeadline: deadline,
      audience,
      notes: str(fd, "notes") || null,
      createdById: user.id,
      lines: { create: lines.map((l, i) => ({ ...l, position: i })) },
      invites: audience === "SHORTLIST" ? { create: shortlist.map((supplierId) => ({ supplierId })) } : undefined,
    },
  });

  const suppliers =
    audience === "SHORTLIST"
      ? shortlist
      : (
          await db.business.findMany({
            where: { type: "SUPPLIER", verification: "VERIFIED", categories: { some: { id: categoryId } } },
            select: { id: true },
          })
        ).map((s) => s.id);
  await Promise.all(suppliers.map((s) => notify(s, `New request ${rfqNo(req.number)} from ${business.name}: ${title}`)));

  redirect(`/requests/${req.id}?ok=${encodeURIComponent(`Request sent to ${suppliers.length} supplier${suppliers.length === 1 ? "" : "s"}.`)}`);
}

export async function cancelRequest(fd: FormData) {
  const { business } = await requireBuyer();
  const id = str(fd, "requestId");
  const req = await db.request.findFirst({ where: { id, buyerId: business.id, status: "OPEN" } });
  if (!req) back(`/requests/${id}`, "error", "This request can no longer be cancelled.");
  await db.request.update({ where: { id }, data: { status: "CANCELLED" } });
  redirect(`/requests/${id}?ok=Request+cancelled.`);
}

export async function awardQuote(fd: FormData) {
  const { user, business } = await requireBuyer();
  const requestId = str(fd, "requestId");
  const quoteId = str(fd, "quoteId");
  const terms = Math.max(0, Math.round(num(fd, "paymentTermsDays") || 0));
  const path = `/requests/${requestId}`;

  const req = await db.request.findFirst({
    where: { id: requestId, buyerId: business.id },
    include: { lines: true, quotes: { include: { lines: true, supplier: true } } },
  });
  if (!req || req.status !== "OPEN") back(path, "error", "This request has already been awarded or closed.");
  const quote = req.quotes.find((q) => q.id === quoteId && q.status === "SUBMITTED");
  if (!quote) back(path, "error", "Choose one of the quotes first.");

  const priceByLine = new Map(quote.lines.map((l) => [l.requestLineId, l.unitPrice]));
  const lines = req.lines
    .filter((l) => priceByLine.has(l.id))
    .sort((a, b) => a.position - b.position)
    .map((l, i) => ({ product: l.product, unit: l.unit, quantity: l.quantity, unitPrice: priceByLine.get(l.id)!, position: i }));
  const total = orderTotal(lines, quote.deliveryFee);
  const approval = needsApproval(total, business.approvalLimit);

  const order = await db.$transaction(async (tx) => {
    const o = await tx.purchaseOrder.create({
      data: {
        buyerId: business.id,
        supplierId: quote.supplierId,
        requestId: req.id,
        quoteId: quote.id,
        status: approval ? "AWAITING_APPROVAL" : "AWAITING_SUPPLIER",
        paymentTermsDays: terms,
        deliveryFee: quote.deliveryFee,
        deliveryDate: quote.deliveryDate,
        deliveryAddress: req.deliveryAddress,
        createdById: user.id,
        lines: { create: lines },
        events: {
          create: [
            { actorId: user.id, message: `Order raised from ${rfqNo(req.number)}` },
            ...(approval ? [{ actorId: user.id, message: "Sent for manager approval (over the approval limit)" }] : []),
          ],
        },
      },
    });
    await tx.quote.update({ where: { id: quote.id }, data: { status: "AWARDED" } });
    await tx.quote.updateMany({ where: { requestId: req.id, id: { not: quote.id }, status: "SUBMITTED" }, data: { status: "NOT_SELECTED" } });
    await tx.request.update({ where: { id: req.id }, data: { status: "AWARDED" } });
    return o;
  });

  if (!approval) await notify(quote.supplierId, `New order ${poNo(order.number)} from ${business.name}`);
  revalidatePath("/", "layout");
  redirect(
    `/orders/${order.id}?ok=${encodeURIComponent(
      approval ? "Order sent to a manager for approval." : `Order sent to ${quote.supplier.name}.`,
    )}`,
  );
}

/* ---------------- orders ---------------- */

async function ownOrder(id: string) {
  const { user, business } = await requireBuyer();
  const order = await db.purchaseOrder.findFirst({ where: { id, buyerId: business.id }, include: { lines: true } });
  if (!order) back("/orders", "error", "That order wasn't found.");
  return { user, business, order };
}

export async function decideApproval(fd: FormData) {
  const id = str(fd, "orderId");
  const { user, order } = await ownOrder(id);
  const path = str(fd, "returnTo") || `/orders/${id}`;
  if (!canApprove(user)) back(path, "error", "Only an owner or manager can approve orders.");
  if (order.status !== "AWAITING_APPROVAL") back(path, "error", "This order isn't waiting for approval.");
  const approve = str(fd, "decision") === "approve";
  const note = str(fd, "note") || null;
  await db.purchaseOrder.update({
    where: { id },
    data: {
      status: approve ? "AWAITING_SUPPLIER" : "NOT_APPROVED",
      approvedById: user.id,
      approvedAt: new Date(),
      decisionNote: note,
      events: { create: { actorId: user.id, message: approve ? "Approved" : `Not approved${note ? `: ${note}` : ""}` } },
    },
  });
  if (approve) await notify(order.supplierId, `New order ${poNo(order.number)}`);
  revalidatePath("/", "layout");
  back(path, "ok", approve ? "Approved and sent to the supplier." : "Order not approved. The person who raised it can see your note.");
}

export async function cancelOrder(fd: FormData) {
  const id = str(fd, "orderId");
  const { user, order } = await ownOrder(id);
  if (!["AWAITING_APPROVAL", "AWAITING_SUPPLIER", "CONFIRMED"].includes(order.status)) {
    back(`/orders/${id}`, "error", "An order can't be cancelled once it has been dispatched.");
  }
  await db.purchaseOrder.update({
    where: { id },
    data: { status: "CANCELLED", events: { create: { actorId: user.id, message: "Cancelled by buyer" } } },
  });
  await notify(order.supplierId, `Order ${poNo(order.number)} was cancelled by the buyer`);
  back(`/orders/${id}`, "ok", "Order cancelled.");
}

export async function receiveOrder(fd: FormData) {
  const id = str(fd, "orderId");
  const { user, business, order } = await ownOrder(id);
  const path = `/orders/${id}`;
  if (!["CONFIRMED", "DISPATCHED"].includes(order.status)) back(path, "error", "You can record goods once the supplier has confirmed the order.");

  const counts = order.lines.map((l) => {
    const rec = num(fd, `rec_${l.id}`);
    const exp = str(fd, `exp_${l.id}`);
    const loc = str(fd, `loc_${l.id}`) as StorageLocation;
    return {
      line: l,
      rec: Number.isFinite(rec) ? rec : l.quantity,
      issue: str(fd, `issue_${l.id}`) || null,
      expiresAt: exp ? parseDateInput(exp) : null,
      location: LOCATIONS.includes(loc) ? loc : "DRY_STORE",
    };
  });
  if (counts.some((c) => c.rec < 0)) back(`${path}?receive=1`, "error", "Received quantities can't be negative.");

  await db.$transaction(async (tx) => {
    for (const c of counts) {
      await tx.orderLine.update({
        where: { id: c.line.id },
        data: { receivedQty: c.rec, issue: c.issue === "No problem" ? null : c.issue },
      });
      if (c.rec <= 0) continue;
      const item = await tx.stockItem.upsert({
        where: { buyerId_name_unit: { buyerId: business.id, name: c.line.product, unit: c.line.unit } },
        update: { lastUnitPrice: c.line.unitPrice },
        create: {
          buyerId: business.id,
          name: c.line.product,
          unit: c.line.unit,
          location: c.location,
          lastUnitPrice: c.line.unitPrice,
          reorderQty: c.line.quantity,
        },
      });
      await tx.stockBatch.create({ data: { itemId: item.id, quantity: c.rec, expiresAt: c.expiresAt } });
      await tx.stockMovement.create({
        data: { itemId: item.id, type: "RECEIVED", quantity: c.rec, userId: user.id, orderId: order.id },
      });
    }
    const short = counts.filter((c) => c.rec < c.line.quantity).length;
    await tx.purchaseOrder.update({
      where: { id },
      data: {
        status: "RECEIVED",
        receivedAt: new Date(),
        events: {
          create: {
            actorId: user.id,
            message: short ? `Goods received, ${short} item${short > 1 ? "s" : ""} short or with problems` : "Goods received in full",
          },
        },
      },
    });
  });
  await notify(order.supplierId, `${business.name} confirmed delivery of ${poNo(order.number)}`);
  revalidatePath("/", "layout");
  back(path, "ok", "Goods recorded and stock updated.");
}

export async function recordPayment(fd: FormData) {
  const id = str(fd, "orderId");
  const { user, order } = await ownOrder(id);
  const path = `/orders/${id}`;
  if (order.status !== "RECEIVED") back(path, "error", "Record payments once goods have been received.");
  const method = str(fd, "method") === "CASH" ? "CASH" : "TRANSFER";
  const amount = Math.round(num(fd, "amount"));
  const paidAt = str(fd, "paidAt");
  if (!(amount > 0)) back(path, "error", "Enter the amount paid in Naira.");
  await db.payment.create({
    data: {
      orderId: id,
      method,
      amount,
      reference: str(fd, "reference") || null,
      paidAt: paidAt ? parseDateInput(paidAt) : new Date(),
      recordedById: user.id,
    },
  });
  await db.orderEvent.create({
    data: { orderId: id, actorId: user.id, message: `Payment of ₦${amount.toLocaleString("en-NG")} recorded (${method === "CASH" ? "cash" : "transfer"})` },
  });
  await notify(order.supplierId, `Payment recorded on ${poNo(order.number)}`);
  back(path, "ok", "Payment recorded.");
}

export async function rateOrder(fd: FormData) {
  const id = str(fd, "orderId");
  const { business, order } = await ownOrder(id);
  const path = `/orders/${id}`;
  if (order.status !== "RECEIVED") back(path, "error", "Rate the supplier after the goods arrive.");
  const score = (k: string) => Math.min(5, Math.max(1, Math.round(num(fd, k) || 0)));
  await db.rating.upsert({
    where: { orderId: id },
    update: { quality: score("quality"), accuracy: score("accuracy"), timeliness: score("timeliness"), price: score("price"), comment: str(fd, "comment") || null },
    create: {
      orderId: id,
      buyerId: business.id,
      supplierId: order.supplierId,
      quality: score("quality"),
      accuracy: score("accuracy"),
      timeliness: score("timeliness"),
      price: score("price"),
      comment: str(fd, "comment") || null,
    },
  });
  back(path, "ok", "Thanks. Your rating shows on this supplier's future quotes.");
}

/* ---------------- stock ---------------- */

export async function createStockItem(fd: FormData) {
  const { user, business } = await requireBuyer();
  const name = str(fd, "name");
  const unit = str(fd, "unit");
  const loc = str(fd, "location") as StorageLocation;
  const opening = num(fd, "openingQty");
  const exp = str(fd, "expiresAt");
  if (!name || !unit) back("/stock/new", "error", "Give the item a name and a unit.");
  const exists = await db.stockItem.findUnique({ where: { buyerId_name_unit: { buyerId: business.id, name, unit } } });
  if (exists) back("/stock/new", "error", "You already track that item in that unit.");
  const item = await db.stockItem.create({
    data: {
      buyerId: business.id,
      name,
      unit,
      location: LOCATIONS.includes(loc) ? loc : "DRY_STORE",
      reorderLevel: Math.max(0, num(fd, "reorderLevel") || 0),
      reorderQty: Math.max(0, num(fd, "reorderQty") || 0),
    },
  });
  if (opening > 0) {
    await db.stockBatch.create({ data: { itemId: item.id, quantity: opening, expiresAt: exp ? parseDateInput(exp) : null } });
    await db.stockMovement.create({ data: { itemId: item.id, type: "ADDED", quantity: opening, reason: "Opening stock", userId: user.id } });
  }
  redirect(`/stock/${item.id}?ok=Item+added.`);
}

export async function updateStockItem(fd: FormData) {
  const { business } = await requireBuyer();
  const id = str(fd, "itemId");
  const loc = str(fd, "location") as StorageLocation;
  const item = await db.stockItem.findFirst({ where: { id, buyerId: business.id } });
  if (!item) back("/stock", "error", "That item wasn't found.");
  await db.stockItem.update({
    where: { id },
    data: {
      location: LOCATIONS.includes(loc) ? loc : item.location,
      reorderLevel: Math.max(0, num(fd, "reorderLevel") || 0),
      reorderQty: Math.max(0, num(fd, "reorderQty") || 0),
    },
  });
  back(`/stock/${id}`, "ok", "Reorder settings saved.");
}

export async function recordMovement(fd: FormData) {
  const { user, business } = await requireBuyer();
  const id = str(fd, "itemId");
  const path = `/stock/${id}`;
  const type = str(fd, "type");
  const q = num(fd, "quantity");
  const item = await db.stockItem.findFirst({ where: { id, buyerId: business.id }, include: { batches: true } });
  if (!item) back("/stock", "error", "That item wasn't found.");
  if (!(q >= 0) || (type !== "COUNT" && q === 0)) back(path, "error", "Enter a quantity above 0.");
  const onHand = round3(item.batches.reduce((s, b) => s + b.quantity, 0));

  await db.$transaction(async (tx) => {
    const take = async (amount: number) => {
      const { updates } = takeFromBatches(item.batches, amount);
      for (const u of updates) await tx.stockBatch.update({ where: { id: u.id }, data: { quantity: u.quantity } });
    };
    if (type === "USED" || type === "WASTED") {
      const amount = Math.min(q, onHand);
      await take(amount);
      await tx.stockMovement.create({
        data: { itemId: id, type, quantity: -amount, reason: type === "WASTED" ? str(fd, "reason") || "Spoiled" : null, userId: user.id },
      });
    } else if (type === "ADDED") {
      const exp = str(fd, "expiresAt");
      await tx.stockBatch.create({ data: { itemId: id, quantity: q, expiresAt: exp ? parseDateInput(exp) : null } });
      await tx.stockMovement.create({ data: { itemId: id, type: "ADDED", quantity: q, reason: str(fd, "reason") || "Bought outside the platform", userId: user.id } });
    } else if (type === "COUNT") {
      const diff = round3(q - onHand);
      if (diff < 0) await take(-diff);
      if (diff > 0) await tx.stockBatch.create({ data: { itemId: id, quantity: diff } });
      await tx.stockMovement.create({ data: { itemId: id, type: "COUNT_ADJUST", quantity: diff, reason: `Counted ${q}`, userId: user.id } });
    }
  });
  back(path, "ok", "Stock updated.");
}

/* ---------------- settings ---------------- */

export async function updateSettings(fd: FormData) {
  const { user, business } = await requireBuyer();
  if (!canApprove(user)) back("/settings", "error", "Only an owner or manager can change settings.");
  const raw = str(fd, "approvalLimit");
  const limit = raw === "" ? null : Math.max(0, Math.round(num(fd, "approvalLimit")));
  if (raw !== "" && !Number.isFinite(limit)) back("/settings", "error", "Enter the approval limit in Naira, or leave it blank for no approvals.");
  await db.business.update({
    where: { id: business.id },
    data: { approvalLimit: limit, address: str(fd, "address") || business.address, phone: str(fd, "phone") || business.phone },
  });
  back("/settings", "ok", "Settings saved.");
}

export async function addTeamMember(fd: FormData) {
  const { user, business } = await requireBuyer();
  if (!canApprove(user)) back("/settings", "error", "Only an owner or manager can add people.");
  const email = str(fd, "email").toLowerCase();
  const name = str(fd, "name");
  const password = str(fd, "password");
  const role = str(fd, "role") === "MANAGER" ? "MANAGER" : "STAFF";
  if (!name || !email) back("/settings", "error", "Enter a name and email.");
  if (password.length < 8) back("/settings", "error", "Set a temporary password of at least 8 characters.");
  if (await db.user.findUnique({ where: { email } })) back("/settings", "error", "Someone already uses that email.");
  await db.user.create({
    data: { name, email, phone: str(fd, "phone") || null, role, businessId: business.id, passwordHash: await bcrypt.hash(password, 10) },
  });
  back("/settings", "ok", `${name} can now sign in with ${email}.`);
}
