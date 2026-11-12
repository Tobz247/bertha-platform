import "server-only";
import { db } from "./db";
import { approvedOf, itemKey } from "./kitchen-rules";
import { invoiceCheck, orderTotal, paymentState, receivedTotal } from "./rules";

export async function loadOrder(id: string) {
  const o = await db.purchaseOrder.findUnique({
    where: { id },
    include: {
      buyer: true,
      supplier: true,
      lines: { orderBy: { position: "asc" } },
      invoice: true,
      payments: { orderBy: { paidAt: "asc" }, include: { recordedBy: true } },
      events: { orderBy: { at: "asc" }, include: { actor: true } },
      createdBy: true,
      approvedBy: true,
      receivedBy: true,
      grnApprovedBy: true,
      rating: true,
      request: { include: { kitchenRequest: { include: { lines: true } } } },
    },
  });
  if (!o) return null;
  const total = orderTotal(o.lines, o.deliveryFee);
  const received = o.receivedAt ? receivedTotal(o.lines, o.deliveryFee) : null;
  const paid = o.payments.reduce((s, p) => s + p.amount, 0);
  const amountDue = o.invoice ? o.invoice.amount : received ?? total;
  const pay = paymentState({ receivedAt: o.receivedAt, paymentTermsDays: o.paymentTermsDays, amountDue, paid });
  const check = o.invoice && received != null ? invoiceCheck(o.invoice.amount, received) : null;
  return { ...o, total, received, paid, amountDue, pay, check, requested: requestedQty(o.request?.kitchenRequest?.lines ?? null) };
}

/**
 * When an order came from a kitchen request, what the kitchen asked for per item (approved quantity),
 * keyed by item name and unit. Null when the order isn't linked to a kitchen request.
 */
function requestedQty(lines: { product: string; unit: string; quantity: number; approvedQty: number | null }[] | null) {
  if (!lines) return null;
  const m: Record<string, number> = {};
  for (const l of lines) {
    const k = itemKey(l.product, l.unit);
    m[k] = (m[k] ?? 0) + approvedOf(l);
  }
  return m;
}

/** What the kitchen asked for of one order line, or null when not on (or not from) a kitchen request. */
export function requestedFor(o: { requested: Record<string, number> | null }, l: { product: string; unit: string }) {
  return o.requested?.[itemKey(l.product, l.unit)] ?? null;
}

export type LoadedOrder = NonNullable<Awaited<ReturnType<typeof loadOrder>>>;

/** Average star rating (1 to 5) per supplier, with the number of rated orders. */
export async function supplierRatings(supplierIds: string[]) {
  const rows = await db.rating.groupBy({
    by: ["supplierId"],
    where: { supplierId: { in: supplierIds } },
    _avg: { quality: true, accuracy: true, timeliness: true, price: true },
    _count: { _all: true },
  });
  const out = new Map<string, { avg: number; count: number }>();
  for (const r of rows) {
    const a = r._avg;
    const avg = ((a.quality ?? 0) + (a.accuracy ?? 0) + (a.timeliness ?? 0) + (a.price ?? 0)) / 4;
    out.set(r.supplierId, { avg: Math.round(avg * 10) / 10, count: r._count._all });
  }
  return out;
}

export function payLabel(o: Pick<LoadedOrder, "pay">): { label: string; tone: "green" | "amber" | "red" | "grey" } | null {
  const p = o.pay;
  if (p.kind === "not_due") return null;
  if (p.kind === "paid") return { label: "Paid", tone: "green" };
  if (p.overdue) return { label: "Overdue", tone: "red" };
  return { label: p.kind === "part_paid" ? "Part paid" : "Payment due", tone: "amber" };
}
