"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { StorageLocation } from "@prisma/client";
import { audit } from "@/lib/audit";
import { can, requireBuyer } from "@/lib/auth";
import { db } from "@/lib/db";
import { back, num, str } from "@/lib/flash";
import { parseDateInput, poNo, rfqNo } from "@/lib/format";
import { areaOnHand, takeFromAreas, type Area } from "@/lib/kitchen-rules";
import { notify } from "@/lib/notify";
import { isRole, roleChangeProblem, roleLabel, type Permission } from "@/lib/roles";
import { addDays, dishUsage, needsApproval, orderTotal, portionResult, round3, startOfDay } from "@/lib/rules";

const LOCATIONS: StorageLocation[] = ["DRY_STORE", "COLD_ROOM", "FREEZER", "OTHER"];

/* ---------------- requests ---------------- */

export async function createRequest(fd: FormData) {
  const { user, business } = await requireBuyer("requests");
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
  const kitchenRequestId = str(fd, "kitchenRequestId") || null;

  const fail = (m: string) => back(kitchenRequestId ? `/requests/new?kitchen=${kitchenRequestId}` : "/requests/new", "error", m);
  if (kitchenRequestId && !(await db.kitchenRequest.findFirst({ where: { id: kitchenRequestId, buyerId: business.id, status: "APPROVED" } }))) {
    fail("That kitchen request isn't approved, so it can't be sent to suppliers.");
  }
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
      kitchenRequestId,
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
  const { business } = await requireBuyer("requests");
  const id = str(fd, "requestId");
  const req = await db.request.findFirst({ where: { id, buyerId: business.id, status: "OPEN" } });
  if (!req) back(`/requests/${id}`, "error", "This request can no longer be cancelled.");
  await db.request.update({ where: { id }, data: { status: "CANCELLED" } });
  redirect(`/requests/${id}?ok=Request+cancelled.`);
}

export async function awardQuote(fd: FormData) {
  const { user, business } = await requireBuyer("requests");
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

  await audit(user, "order.placed", `${user.name} ordered ${poNo(order.number)} (₦${total.toLocaleString("en-NG")}) from ${quote.supplier.name} for ${business.name}${approval ? ", sent for approval" : ""}`, { targetType: "PurchaseOrder", targetId: order.id });
  if (!approval) await notify(quote.supplierId, `New order ${poNo(order.number)} from ${business.name}`);
  revalidatePath("/", "layout");
  redirect(
    `/orders/${order.id}?ok=${encodeURIComponent(
      approval ? "Order sent to a manager for approval." : `Order sent to ${quote.supplier.name}.`,
    )}`,
  );
}

/* ---------------- orders ---------------- */

async function ownOrder(id: string, permission: Permission) {
  const { user, business } = await requireBuyer(permission);
  const order = await db.purchaseOrder.findFirst({ where: { id, buyerId: business.id }, include: { lines: true } });
  if (!order) back("/orders", "error", "That order wasn't found.");
  return { user, business, order };
}

export async function decideApproval(fd: FormData) {
  const id = str(fd, "orderId");
  const { user, business, order } = await ownOrder(id, "approve");
  const path = str(fd, "returnTo") || `/orders/${id}`;
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
  await audit(user, approve ? "order.approved" : "order.not_approved", `${user.name} ${approve ? "approved" : "did not approve"} ${poNo(order.number)} at ${business.name}${note ? `: ${note}` : ""}`, { targetType: "PurchaseOrder", targetId: id });
  if (approve) await notify(order.supplierId, `New order ${poNo(order.number)}`);
  revalidatePath("/", "layout");
  back(path, "ok", approve ? "Approved and sent to the supplier." : "Order not approved. The person who raised it can see your note.");
}

export async function cancelOrder(fd: FormData) {
  const id = str(fd, "orderId");
  const { user, business, order } = await ownOrder(id, "order");
  if (!["AWAITING_APPROVAL", "AWAITING_SUPPLIER", "CONFIRMED"].includes(order.status)) {
    back(`/orders/${id}`, "error", "An order can't be cancelled once it has been dispatched.");
  }
  await db.purchaseOrder.update({
    where: { id },
    data: { status: "CANCELLED", events: { create: { actorId: user.id, message: "Cancelled by buyer" } } },
  });
  await audit(user, "order.cancelled", `${user.name} cancelled ${poNo(order.number)} at ${business.name}`, { targetType: "PurchaseOrder", targetId: id });
  await notify(order.supplierId, `Order ${poNo(order.number)} was cancelled by the buyer`);
  back(`/orders/${id}`, "ok", "Order cancelled.");
}

export async function receiveOrder(fd: FormData) {
  const id = str(fd, "orderId");
  const { user, business, order } = await ownOrder(id, "receive");
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
        receivedById: user.id,
        events: {
          create: {
            actorId: user.id,
            message: short ? `Goods received, ${short} item${short > 1 ? "s" : ""} short or with problems` : "Goods received in full",
          },
        },
      },
    });
  });
  await audit(user, "order.received", `${user.name} recorded goods received for ${poNo(order.number)} at ${business.name}`, { targetType: "PurchaseOrder", targetId: id });
  await notify(order.supplierId, `${business.name} confirmed delivery of ${poNo(order.number)}`);
  revalidatePath("/", "layout");
  back(path, "ok", "Goods recorded and stock updated. The goods received note for accounts is ready (top right).");
}

export async function recordPayment(fd: FormData) {
  const id = str(fd, "orderId");
  const { user, business, order } = await ownOrder(id, "pay");
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
  await audit(user, "payment.recorded", `${user.name} recorded ₦${amount.toLocaleString("en-NG")} ${method === "CASH" ? "cash" : "transfer"} on ${poNo(order.number)} at ${business.name}`, { targetType: "PurchaseOrder", targetId: id });
  await notify(order.supplierId, `Payment recorded on ${poNo(order.number)}`);
  back(path, "ok", "Payment recorded.");
}

export async function rateOrder(fd: FormData) {
  const id = str(fd, "orderId");
  const { business, order } = await ownOrder(id, "rate");
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
  const { user, business } = await requireBuyer("stock");
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
  const { business } = await requireBuyer("stock");
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
  // Store or kitchen. The kitchen records its own use, waste and counts; the store does everything else.
  const area: Area = str(fd, "area") === "KITCHEN" && type !== "ADDED" ? "KITCHEN" : "STORE";
  if (!(can(user, "stock") || (area === "KITCHEN" && can(user, "kitchen_request")))) {
    back(path, "error", "Your role can't change stock here. A store keeper or manager records changes.");
  }
  const item = await db.stockItem.findFirst({ where: { id, buyerId: business.id }, include: { batches: true } });
  if (!item) back("/stock", "error", "That item wasn't found.");
  if (!(q >= 0) || (type !== "COUNT" && q === 0)) back(path, "error", "Enter a quantity above 0.");
  const onHand = round3(item.batches.reduce((s, b) => s + b.quantity, 0));
  const here = areaOnHand(item.batches, area);
  const tag = area === "KITCHEN" ? "Kitchen" : null;
  // Use and waste come out of the chosen area first, then the other one if it runs short.
  const order: Area[] = area === "KITCHEN" ? ["KITCHEN", "STORE"] : ["STORE", "KITCHEN"];

  await db.$transaction(async (tx) => {
    const take = async (amount: number, from: Area[]) => {
      const { updates } = takeFromAreas(item.batches, amount, from);
      for (const u of updates) await tx.stockBatch.update({ where: { id: u.id }, data: { quantity: u.quantity } });
    };
    if (type === "USED" || type === "WASTED") {
      const amount = Math.min(q, onHand);
      await take(amount, order);
      const reason = type === "WASTED" ? str(fd, "reason") || "Spoiled" : null;
      await tx.stockMovement.create({
        data: { itemId: id, type, quantity: -amount, reason: [tag, reason].filter(Boolean).join(": ") || null, userId: user.id },
      });
    } else if (type === "ADDED") {
      const exp = str(fd, "expiresAt");
      await tx.stockBatch.create({ data: { itemId: id, quantity: q, expiresAt: exp ? parseDateInput(exp) : null } });
      await tx.stockMovement.create({ data: { itemId: id, type: "ADDED", quantity: q, reason: str(fd, "reason") || "Bought outside the platform", userId: user.id } });
    } else if (type === "COUNT") {
      // A count is for one area: the store's shelves, or what is in the kitchen.
      const diff = round3(q - here);
      if (diff < 0) await take(-diff, [area]);
      if (diff > 0) await tx.stockBatch.create({ data: { itemId: id, quantity: diff, area } });
      await tx.stockMovement.create({ data: { itemId: id, type: "COUNT_ADJUST", quantity: diff, reason: `${tag ? "Kitchen counted" : "Counted"} ${q}`, userId: user.id } });
    }
  });
  back(path, "ok", "Stock updated.");
}

/* ---------------- settings ---------------- */

export async function updateSettings(fd: FormData) {
  const { user, business } = await requireBuyer("team");
  const raw = str(fd, "approvalLimit");
  const limit = raw === "" ? null : Math.max(0, Math.round(num(fd, "approvalLimit")));
  if (raw !== "" && !Number.isFinite(limit)) back("/settings", "error", "Enter the approval limit in Naira, or leave it blank for no approvals.");
  await db.business.update({
    where: { id: business.id },
    data: { approvalLimit: limit, address: str(fd, "address") || business.address, phone: str(fd, "phone") || business.phone },
  });
  if (limit !== business.approvalLimit) {
    const show = (n: number | null) => (n == null ? "off" : `₦${n.toLocaleString("en-NG")}`);
    await audit(user, "settings.approval_limit", `${user.name} changed ${business.name}'s approval limit from ${show(business.approvalLimit)} to ${show(limit)}`);
  }
  back("/settings", "ok", "Settings saved.");
}

export async function addTeamMember(fd: FormData) {
  const { user, business } = await requireBuyer("team");
  const email = str(fd, "email").toLowerCase();
  const name = str(fd, "name");
  const password = str(fd, "password");
  const role = str(fd, "role");
  if (!name || !email) back("/settings", "error", "Enter a name and email.");
  if (!isRole(role)) back("/settings", "error", "Pick a role.");
  if (role === "OWNER" && user.role !== "OWNER") back("/settings", "error", "Only an owner can add another owner.");
  if (password.length < 8) back("/settings", "error", "Set a temporary password of at least 8 characters.");
  if (await db.user.findUnique({ where: { email } })) back("/settings", "error", "Someone already uses that email.");
  const added = await db.user.create({
    data: { name, email, phone: str(fd, "phone") || null, role, businessId: business.id, passwordHash: await bcrypt.hash(password, 10) },
  });
  await audit(user, "team.added", `${user.name} added ${name} (${email}) to ${business.name} as ${roleLabel(role)}`, { targetType: "User", targetId: added.id });
  back("/settings", "ok", `${name} can now sign in with ${email} as ${roleLabel(role)}.`);
}

/** Change a team member's role, or turn their login off or back on. */
export async function updateTeamMember(fd: FormData) {
  const { user, business } = await requireBuyer("team");
  const target = await db.user.findFirst({ where: { id: str(fd, "userId"), businessId: business.id } });
  if (!target) back("/settings", "error", "That person isn't on your team.");
  const nextRole = str(fd, "role") || target.role;
  const nextActive = str(fd, "active") ? str(fd, "active") === "1" : target.active;
  const activeOwners = await db.user.count({ where: { businessId: business.id, role: "OWNER", active: true } });
  const problem = roleChangeProblem({ actor: user, target, next: { role: nextRole, active: nextActive }, activeOwners });
  if (problem) back("/settings", "error", problem);
  if (nextRole === target.role && nextActive === target.active) back("/settings", "ok", "Nothing changed.");
  await db.user.update({ where: { id: target.id }, data: { role: nextRole as typeof target.role, active: nextActive } });
  const what = [
    nextRole !== target.role ? `changed ${target.name} from ${roleLabel(target.role)} to ${roleLabel(nextRole)}` : "",
    nextActive !== target.active ? `${nextActive ? "turned back on" : "turned off"} ${target.name}'s login` : "",
  ].filter(Boolean).join(" and ");
  await audit(user, nextActive !== target.active ? (nextActive ? "team.reactivated" : "team.deactivated") : "team.role_changed", `${user.name} ${what} at ${business.name}`, {
    targetType: "User",
    targetId: target.id,
  });
  back("/settings", "ok", `Done: ${what}.`);
}

/* ---------------- ordering from a price list ---------------- */

export async function placePriceListOrder(fd: FormData) {
  const { user, business } = await requireBuyer("order");
  const supplierId = str(fd, "supplierId");
  const path = `/suppliers/${supplierId}`;
  const supplier = await db.business.findFirst({
    where: { id: supplierId, type: "SUPPLIER", verification: "VERIFIED" },
    include: { catalogue: { where: { available: true } } },
  });
  if (!supplier) back("/suppliers", "error", "That supplier isn't taking orders on Bertha.");

  const lines = supplier.catalogue
    .map((c) => ({ c, quantity: num(fd, `q_${c.id}`) }))
    .filter((x) => x.quantity > 0);
  if (lines.length === 0) back(path, "error", "Enter a quantity for at least one item.");
  const under = lines.find((x) => x.c.minQty > 0 && x.quantity < x.c.minQty);
  if (under) back(path, "error", `${supplier.name} sells ${under.c.name} in at least ${under.c.minQty} ${under.c.unit}.`);
  const deliveryDate = str(fd, "deliveryDate");
  if (!deliveryDate) back(path, "error", "Choose a delivery date.");
  const when = parseDateInput(deliveryDate);
  if (startOfDay(when) < startOfDay(new Date())) back(path, "error", "The delivery date can't be in the past.");

  const orderLines = lines.map((x, i) => ({ product: x.c.name, unit: x.c.unit, quantity: x.quantity, unitPrice: x.c.price, position: i }));
  const goods = orderTotal(orderLines);
  if (supplier.minOrderValue && goods < supplier.minOrderValue) {
    back(path, "error", `The smallest order ${supplier.name} takes is ₦${supplier.minOrderValue.toLocaleString("en-NG")}. This one comes to ₦${goods.toLocaleString("en-NG")}.`);
  }
  const total = goods + supplier.deliveryFee;
  const approval = needsApproval(total, business.approvalLimit);
  const terms = Math.max(0, Math.round(num(fd, "paymentTermsDays") || 0));
  const note = str(fd, "note");

  const order = await db.purchaseOrder.create({
    data: {
      buyerId: business.id,
      supplierId: supplier.id,
      source: "PRICE_LIST",
      status: approval ? "AWAITING_APPROVAL" : "AWAITING_SUPPLIER",
      paymentTermsDays: terms,
      deliveryFee: supplier.deliveryFee,
      deliveryDate: when,
      deliveryAddress: str(fd, "deliveryAddress") || business.address,
      createdById: user.id,
      lines: { create: orderLines },
      events: {
        create: [
          { actorId: user.id, message: `Ordered from ${supplier.name}'s price list${note ? `. Note: ${note}` : ""}` },
          ...(approval ? [{ actorId: user.id, message: "Sent for manager approval (over the approval limit)" }] : []),
        ],
      },
    },
  });
  await audit(user, "order.placed", `${user.name} ordered ${poNo(order.number)} (₦${total.toLocaleString("en-NG")}) from ${supplier.name}'s price list for ${business.name}${approval ? ", sent for approval" : ""}`, { targetType: "PurchaseOrder", targetId: order.id });
  if (!approval) await notify(supplier.id, `New order ${poNo(order.number)} from ${business.name}`);
  revalidatePath("/", "layout");
  redirect(`/orders/${order.id}?ok=${encodeURIComponent(approval ? "Order sent to a manager for approval." : `Order sent to ${supplier.name}.`)}`);
}

/* ---------------- recipes ---------------- */

async function readRecipeForm(fd: FormData, buyerId: string, path: string) {
  const name = str(fd, "name");
  const menuPrice = Math.round(num(fd, "menuPrice"));
  const portions = num(fd, "portions") || 1;
  if (!name) back(path, "error", "Give the dish a name.");
  if (!(menuPrice > 0)) back(path, "error", "Enter the menu price in Naira.");
  if (!(portions > 0)) back(path, "error", "Portions must be above 0.");
  const ids = fd.getAll("itemId").map(String);
  const qtys = fd.getAll("quantity").map((v) => Number(String(v).replace(/,/g, "")));
  const merged = new Map<string, number>();
  ids.forEach((id, i) => {
    if (id && qtys[i] > 0) merged.set(id, round3((merged.get(id) ?? 0) + qtys[i]));
  });
  if (merged.size === 0) back(path, "error", "Add at least one ingredient with an amount.");
  const owned = await db.stockItem.count({ where: { buyerId, id: { in: [...merged.keys()] } } });
  if (owned !== merged.size) back(path, "error", "One of those ingredients wasn't found in your stock.");
  return {
    name,
    menuPrice,
    portions,
    notes: str(fd, "notes") || null,
    ingredients: [...merged].map(([itemId, quantity]) => ({ itemId, quantity })),
  };
}

export async function saveRecipe(fd: FormData) {
  const { business } = await requireBuyer("recipes");
  const id = str(fd, "recipeId");
  const path = id ? `/recipes/${id}` : "/recipes/new";
  const r = await readRecipeForm(fd, business.id, path);
  const clash = await db.recipe.findUnique({ where: { buyerId_name: { buyerId: business.id, name: r.name } } });
  if (clash && clash.id !== id) back(path, "error", "You already have a dish with that name.");
  const data = { name: r.name, menuPrice: r.menuPrice, portions: r.portions, notes: r.notes };
  let recipeId = id;
  if (id) {
    const own = await db.recipe.findFirst({ where: { id, buyerId: business.id } });
    if (!own) back("/recipes", "error", "That dish wasn't found.");
    await db.$transaction([
      db.recipeIngredient.deleteMany({ where: { recipeId: id } }),
      db.recipe.update({ where: { id }, data: { ...data, ingredients: { create: r.ingredients } } }),
    ]);
  } else {
    recipeId = (await db.recipe.create({ data: { ...data, buyerId: business.id, ingredients: { create: r.ingredients } } })).id;
  }
  revalidatePath("/recipes");
  redirect(`/recipes/${recipeId}?ok=${encodeURIComponent(id ? "Dish saved." : "Dish added.")}`);
}

export async function deleteRecipe(fd: FormData) {
  const { business } = await requireBuyer("recipes");
  const id = str(fd, "recipeId");
  const own = await db.recipe.findFirst({ where: { id, buyerId: business.id } });
  if (!own) back("/recipes", "error", "That dish wasn't found.");
  await db.recipe.delete({ where: { id } });
  redirect(`/recipes?ok=${encodeURIComponent(`${own.name} removed.`)}`);
}

export async function recordDishSales(fd: FormData) {
  const { user, business } = await requireBuyer("recipes");
  const path = "/recipes";
  const recipes = await db.recipe.findMany({ where: { buyerId: business.id }, include: { ingredients: true } });
  const sold = recipes.map((r) => ({ r, n: Math.round(num(fd, `sold_${r.id}`) || 0) })).filter((x) => x.n > 0);
  if (sold.length === 0) back(path, "error", "Enter how many of at least one dish were sold.");
  const soldOnRaw = str(fd, "soldOn");
  const soldOn = soldOnRaw ? parseDateInput(soldOnRaw) : new Date();

  // Total ingredient usage across all dishes sold, per stock item.
  const need = new Map<string, number>();
  for (const { r, n } of sold) {
    for (const u of dishUsage(r.ingredients, n, r.portions)) need.set(u.itemId, round3((need.get(u.itemId) ?? 0) + u.quantity));
  }
  const items = await db.stockItem.findMany({ where: { id: { in: [...need.keys()] }, buyerId: business.id }, include: { batches: true } });
  const short: string[] = [];
  const label = sold.map(({ r, n }) => `${n} × ${r.name}`).join(", ");

  await db.$transaction(async (tx) => {
    for (const { r, n } of sold) await tx.dishSale.create({ data: { recipeId: r.id, quantity: n, soldOn, userId: user.id } });
    for (const item of items) {
      const want = need.get(item.id)!;
      // Dishes are cooked from what the kitchen was issued; anything beyond that comes from the store.
      const { updates, shortfall } = takeFromAreas(item.batches, want, ["KITCHEN", "STORE"]);
      for (const u of updates) await tx.stockBatch.update({ where: { id: u.id }, data: { quantity: u.quantity } });
      const taken = round3(want - shortfall);
      if (shortfall > 0) short.push(item.name);
      await tx.stockMovement.create({
        data: { itemId: item.id, type: "SOLD", quantity: -taken, reason: `Dishes sold: ${label}`.slice(0, 190), userId: user.id },
      });
    }
  });
  revalidatePath("/stock");
  back(
    path,
    "ok",
    short.length
      ? `Sales saved, but the records show too little ${short.join(", ")} for them. Count those items to put stock right.`
      : `Sales saved. Ingredients for ${label} taken out of stock.`,
  );
}

/* ---------------- portion control ---------------- */

const touched0 = (updates: { id: string }[], id: string) => updates.some((u) => u.id === id);

export async function cutPortions(fd: FormData) {
  const { user, business } = await requireBuyer("stock");
  const id = str(fd, "itemId");
  const path = `/stock/${id}`;
  const from = await db.stockItem.findFirst({ where: { id, buyerId: business.id }, include: { batches: { where: { quantity: { gt: 0 } } } } });
  if (!from) back("/stock", "error", "That item wasn't found.");
  const inputQty = num(fd, "inputQty");
  const pieces = Math.round(num(fd, "pieces"));
  const weightRaw = str(fd, "totalWeight");
  const totalWeight = weightRaw === "" ? null : num(fd, "totalWeight");
  const name = str(fd, "portionName") || `${from.name}, pieces`;
  if (!(inputQty > 0)) back(path, "error", `Enter how much ${from.unit} you cut.`);
  if (!(pieces > 0)) back(path, "error", "Enter how many pieces it made.");
  if (totalWeight != null && !(totalWeight > 0)) back(path, "error", "Enter the weight of the pieces in kg, or leave it blank.");
  const onHand = round3(from.batches.reduce((s, b) => s + b.quantity, 0));
  if (inputQty > onHand) back(path, "error", `Only ${onHand} ${from.unit} is in stock. Record a delivery or a stock count first.`);
  if (name.toLowerCase() === from.name.toLowerCase()) back(path, "error", "Give the pieces a different name from the bulk item.");

  const r = portionResult({ inputQty, inputUnit: from.unit, pieces, totalWeightKg: totalWeight, unitPrice: from.lastUnitPrice });
  // Butchery can happen in the store or the kitchen: cut from the store first, and the pieces
  // stay where most of the bulk came from.
  const { updates } = takeFromAreas(from.batches, inputQty, ["STORE", "KITCHEN"]);
  const fromKitchen = from.batches.filter((b) => b.area === "KITCHEN" && touched0(updates, b.id)).reduce((s, b) => s + b.quantity - updates.find((u) => u.id === b.id)!.quantity, 0);
  const piecesArea: Area = fromKitchen * 2 > inputQty ? "KITCHEN" : "STORE";
  const touched = new Set(updates.map((u) => u.id));
  const expiries = from.batches.filter((b) => touched.has(b.id) && b.expiresAt).map((b) => b.expiresAt!.getTime());
  const expiresAt = expiries.length ? new Date(Math.min(...expiries)) : null;
  const detail = `${inputQty} ${from.unit} cut into ${pieces} pieces${totalWeight ? `, ${totalWeight} kg` : ""}`;

  const toId = await db.$transaction(async (tx) => {
    for (const u of updates) await tx.stockBatch.update({ where: { id: u.id }, data: { quantity: u.quantity } });
    const to = await tx.stockItem.upsert({
      where: { buyerId_name_unit: { buyerId: business.id, name, unit: "piece" } },
      update: from.lastUnitPrice != null ? { lastUnitPrice: r.costPerPiece } : {},
      create: { buyerId: business.id, name, unit: "piece", location: from.location, lastUnitPrice: from.lastUnitPrice != null ? r.costPerPiece : null },
    });
    await tx.stockBatch.create({ data: { itemId: to.id, quantity: pieces, expiresAt, area: piecesArea } });
    await tx.stockMovement.create({ data: { itemId: from.id, type: "PORTIONED", quantity: -inputQty, reason: detail, userId: user.id } });
    await tx.stockMovement.create({ data: { itemId: to.id, type: "PORTIONED", quantity: pieces, reason: `From ${detail}`, userId: user.id } });
    await tx.portionRun.create({
      data: { buyerId: business.id, fromItemId: from.id, toItemId: to.id, inputQty, pieces, totalWeight, cost: r.cost, note: str(fd, "note") || null, userId: user.id },
    });
    return to.id;
  });
  revalidatePath("/stock");
  const extra = [r.avgPieceGrams ? `about ${r.avgPieceGrams} g a piece` : "", r.yieldPct != null ? `${r.yieldPct}% yield` : "", r.costPerPiece ? `₦${r.costPerPiece.toLocaleString("en-NG")} a piece` : ""].filter(Boolean).join(", ");
  redirect(`/stock/${toId}?ok=${encodeURIComponent(`${pieces} pieces added to stock${extra ? ` (${extra})` : ""}.`)}`);
}
