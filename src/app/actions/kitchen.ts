"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import { can, requireBuyer } from "@/lib/auth";
import { db } from "@/lib/db";
import { back, num, str } from "@/lib/flash";
import { parseDateInput, poNo } from "@/lib/format";
import { areaOnHand, itemKey, kitchenNo, issueProgress, movedBatches, remainingOf, takeFromAreas } from "@/lib/kitchen-rules";
import { round3, startOfDay } from "@/lib/rules";

/* ---------------- kitchen raises a request ---------------- */

export async function createKitchenRequest(fd: FormData) {
  const { user, business } = await requireBuyer("kitchen_request");
  const path = "/kitchen/new";
  const department = str(fd, "department") || "Kitchen";
  const neededBy = str(fd, "neededBy");
  const products = fd.getAll("product").map(String);
  const quantities = fd.getAll("quantity").map((v) => Number(String(v).replace(/,/g, "")));
  const units = fd.getAll("unit").map(String);
  const lines = products
    .map((p, i) => ({ product: p.trim(), quantity: quantities[i], unit: (units[i] ?? "").trim() }))
    .filter((l) => l.product);

  if (lines.length === 0) back(path, "error", "Add at least one item.");
  if (lines.some((l) => !(l.quantity > 0) || !l.unit)) back(path, "error", "Every item needs a quantity above 0 and a unit.");
  const needed = neededBy ? parseDateInput(neededBy) : new Date();
  if (startOfDay(needed) < startOfDay(new Date())) back(path, "error", "The date needed can't be in the past.");

  const kr = await db.kitchenRequest.create({
    data: {
      buyerId: business.id,
      department: department.slice(0, 60),
      neededBy: needed,
      note: str(fd, "note") || null,
      raisedById: user.id,
      lines: { create: lines.map((l, i) => ({ ...l, position: i })) },
    },
  });
  revalidatePath("/", "layout");
  redirect(`/kitchen/${kr.id}?ok=${encodeURIComponent(`${kitchenNo(kr.number)} sent to procurement for review.`)}`);
}

async function ownKitchenRequest(id: string) {
  const { user, business } = await requireBuyer();
  const kr = await db.kitchenRequest.findFirst({ where: { id, buyerId: business.id }, include: { lines: { orderBy: { position: "asc" } } } });
  if (!kr) back("/kitchen", "error", "That kitchen request wasn't found.");
  return { user, business, kr };
}

export async function cancelKitchenRequest(fd: FormData) {
  const id = str(fd, "kitchenRequestId");
  const { user, kr } = await ownKitchenRequest(id);
  const path = `/kitchen/${id}`;
  if (kr.status !== "SUBMITTED") back(path, "error", "Only a request still waiting for review can be cancelled.");
  if (kr.raisedById !== user.id && !can(user, "review_kitchen_request")) back(path, "error", "Only the person who raised it, or procurement, can cancel it.");
  await db.kitchenRequest.update({ where: { id }, data: { status: "CANCELLED" } });
  revalidatePath("/", "layout");
  back(path, "ok", "Request cancelled.");
}

/* ---------------- procurement reviews ---------------- */

export async function reviewKitchenRequest(fd: FormData) {
  const id = str(fd, "kitchenRequestId");
  const { user, kr } = await ownKitchenRequest(id);
  const path = `/kitchen/${id}`;
  if (!can(user, "review_kitchen_request")) back(path, "error", "Your role can't review kitchen requests. Ask procurement or a manager.");
  if (kr.status !== "SUBMITTED") back(path, "error", "This request has already been reviewed.");
  const approve = str(fd, "decision") === "approve";
  const note = str(fd, "reviewNote") || null;

  if (!approve) {
    if (!note) back(path, "error", "Say why the request isn't approved, so the kitchen knows.");
    await db.kitchenRequest.update({ where: { id }, data: { status: "REJECTED", reviewedById: user.id, reviewedAt: new Date(), reviewNote: note } });
    await audit(user, "kitchen.not_approved", `${user.name} did not approve ${kitchenNo(kr.number)} (${kr.department}): ${note}`, { targetType: "KitchenRequest", targetId: id });
    revalidatePath("/", "layout");
    back(path, "ok", "Request not approved. The kitchen can see your note.");
  }

  const approved = kr.lines.map((l) => {
    const v = num(fd, `approved_${l.id}`);
    return { id: l.id, approvedQty: Number.isFinite(v) ? Math.max(0, round3(v)) : l.quantity };
  });
  if (approved.every((a) => a.approvedQty === 0)) back(path, "error", "Approve at least one item, or choose “Don't approve”.");
  await db.$transaction([
    ...approved.map((a) => db.kitchenRequestLine.update({ where: { id: a.id }, data: { approvedQty: a.approvedQty } })),
    db.kitchenRequest.update({ where: { id }, data: { status: "APPROVED", reviewedById: user.id, reviewedAt: new Date(), reviewNote: note } }),
  ]);
  await audit(user, "kitchen.approved", `${user.name} approved ${kitchenNo(kr.number)} (${kr.department}, ${approved.filter((a) => a.approvedQty > 0).length} items)`, { targetType: "KitchenRequest", targetId: id });
  revalidatePath("/", "layout");
  back(path, "ok", "Approved. Issue what's in the store, and send the rest to suppliers.");
}

/* ---------------- store issues goods to the kitchen ---------------- */

export async function issueFromStore(fd: FormData) {
  const id = str(fd, "kitchenRequestId");
  const { user, business, kr } = await ownKitchenRequest(id);
  const path = `/kitchen/${id}`;
  if (!can(user, "stock")) back(path, "error", "Only the store (store keeper, manager or owner) can issue goods.");
  if (kr.status !== "APPROVED") back(path, "error", "Goods can be issued once procurement has approved the request.");
  const collectedBy = str(fd, "collectedBy");

  const wanted = kr.lines
    .map((l) => ({ l, q: num(fd, `issue_${l.id}`), itemId: str(fd, `item_${l.id}`) }))
    .filter((x) => x.q > 0);
  if (wanted.length === 0) back(path, "error", "Enter a quantity to issue for at least one item.");
  const over = wanted.find((x) => x.q > remainingOf(x.l) + 1e-9);
  if (over) back(path, "error", `Only ${remainingOf(over.l)} ${over.l.unit} of ${over.l.product} is left to issue on this request.`);

  const items = await db.stockItem.findMany({ where: { buyerId: business.id }, include: { batches: { where: { quantity: { gt: 0 } } } } });
  const byId = new Map(items.map((i) => [i.id, i]));
  const byKey = new Map(items.map((i) => [itemKey(i.name, i.unit), i]));
  const plan = wanted.map((x) => ({ ...x, item: (x.itemId && byId.get(x.itemId)) || byKey.get(itemKey(x.l.product, x.l.unit)) || null }));
  const missing = plan.find((p) => !p.item);
  if (missing) back(path, "error", `${missing.l.product} (${missing.l.unit}) isn't in your stock list. Receive it from a supplier or add it under Stock first.`);
  // Several lines could draw on the same stock item: check the total against what is on hand.
  const need = new Map<string, number>();
  for (const p of plan) need.set(p.item!.id, round3((need.get(p.item!.id) ?? 0) + p.q));
  for (const [itemId, q] of need) {
    const it = byId.get(itemId)!;
    const onHand = areaOnHand(it.batches, "STORE");
    if (q > onHand + 1e-9) back(path, "error", `Only ${onHand} ${it.unit} of ${it.name} is in the store. Issue less, or count the stock first.`);
  }

  const reason = `${kitchenNo(kr.number)} to ${kr.department}${collectedBy ? `, collected by ${collectedBy}` : ""}`.slice(0, 190);
  await db.$transaction(async (tx) => {
    const batches = new Map(items.map((i) => [i.id, i.batches.map((b) => ({ ...b }))]));
    for (const p of plan) {
      const item = p.item!;
      // Goods move from the store to the kitchen: still stock (and still counted as on hand)
      // until the kitchen uses them, sells them in dishes or wastes them.
      const current = batches.get(item.id)!;
      const { updates } = takeFromAreas(current, p.q, ["STORE"]);
      const moved = movedBatches(current, updates);
      for (const u of updates) {
        await tx.stockBatch.update({ where: { id: u.id }, data: { quantity: u.quantity } });
        const b = current.find((x) => x.id === u.id);
        if (b) b.quantity = u.quantity;
      }
      for (const m of moved) await tx.stockBatch.create({ data: { itemId: item.id, area: "KITCHEN", ...m } });
      await tx.stockMovement.create({
        data: { itemId: item.id, type: "ISSUED", quantity: -p.q, reason, userId: user.id, kitchenRequestId: kr.id },
      });
      await tx.kitchenRequestLine.update({ where: { id: p.l.id }, data: { issuedQty: round3(p.l.issuedQty + p.q) } });
    }
    const after = kr.lines.map((l) => {
      const p = plan.find((x) => x.l.id === l.id);
      return p ? { ...l, issuedQty: round3(l.issuedQty + p.q) } : l;
    });
    if (issueProgress(after) === "all") await tx.kitchenRequest.update({ where: { id }, data: { status: "FULFILLED" } });
  });
  await audit(user, "stock.issued", `${user.name} issued ${plan.map((p) => `${p.q} ${p.l.unit} ${p.l.product}`).join(", ")} to ${kr.department} on ${kitchenNo(kr.number)}`.slice(0, 500), { targetType: "KitchenRequest", targetId: id });
  revalidatePath("/", "layout");
  back(path, "ok", `Issued ${plan.length} item${plan.length > 1 ? "s" : ""} to ${kr.department}. They now count as kitchen stock, and come out when dishes sold or kitchen use are recorded.`);
}

export async function closeKitchenRequest(fd: FormData) {
  const id = str(fd, "kitchenRequestId");
  const { user, kr } = await ownKitchenRequest(id);
  const path = `/kitchen/${id}`;
  if (!can(user, "review_kitchen_request")) back(path, "error", "Only procurement or a manager can close a request.");
  if (kr.status !== "APPROVED") back(path, "error", "Only an approved request can be closed.");
  await db.kitchenRequest.update({ where: { id }, data: { status: "FULFILLED", reviewNote: [kr.reviewNote, str(fd, "closeNote") ? `Closed: ${str(fd, "closeNote")}` : "Closed before everything was issued"].filter(Boolean).join(" · ") } });
  revalidatePath("/", "layout");
  back(path, "ok", "Request closed.");
}

/* ---------------- goods received: check against the request and approve ---------------- */

export async function approveGoodsReceived(fd: FormData) {
  const { user, business } = await requireBuyer();
  const id = str(fd, "orderId");
  const path = `/orders/${id}`;
  if (!can(user, "approve")) back(path, "error", "Only an owner or manager can approve a goods received note.");
  const order = await db.purchaseOrder.findFirst({ where: { id, buyerId: business.id } });
  if (!order) back("/orders", "error", "That order wasn't found.");
  if (order.status !== "RECEIVED") back(path, "error", "Record the goods received first.");
  if (order.grnApprovedAt) back(path, "error", "This goods received note is already approved.");
  const note = str(fd, "grnNote") || null;
  await db.purchaseOrder.update({
    where: { id },
    data: {
      grnApprovedById: user.id,
      grnApprovedAt: new Date(),
      grnNote: note,
      events: { create: { actorId: user.id, message: `Goods received note checked and approved${note ? `: ${note}` : ""}` } },
    },
  });
  await audit(user, "order.grn_approved", `${user.name} approved the goods received note for ${poNo(order.number)} at ${business.name}${note ? `: ${note}` : ""}`, { targetType: "PurchaseOrder", targetId: id });
  revalidatePath("/", "layout");
  back(path, "ok", `${poNo(order.number)} goods received note approved. It now shows as checked for accounts.`);
}
