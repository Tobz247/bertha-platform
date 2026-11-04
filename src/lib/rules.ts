// Pure business rules. No database access here, so they are easy to test.

export type Line = { quantity: number; unitPrice: number };

/** Line value in whole Naira. */
export function lineValue(l: Line): number {
  return Math.round(l.quantity * l.unitPrice);
}

export function orderTotal(lines: Line[], deliveryFee = 0): number {
  return lines.reduce((sum, l) => sum + lineValue(l), 0) + deliveryFee;
}

/** Value of what actually arrived (falls back to ordered quantity when not yet counted). */
export function receivedTotal(
  lines: (Line & { receivedQty: number | null })[],
  deliveryFee = 0,
): number {
  return (
    lines.reduce((sum, l) => sum + Math.round((l.receivedQty ?? l.quantity) * l.unitPrice), 0) +
    deliveryFee
  );
}

/** An order needs a manager's approval when the buyer has a limit and the total is above it. */
export function needsApproval(total: number, approvalLimit: number | null | undefined): boolean {
  return approvalLimit != null && approvalLimit >= 0 && total > approvalLimit;
}

export type QuoteSummary = { id: string; total: number; deliveryDate: Date; rating: number | null };

/** Badges for the comparison screen: lowest total, earliest delivery, top rated. */
export function quoteBadges(quotes: QuoteSummary[]) {
  if (quotes.length === 0) return {} as Record<string, string[]>;
  const minTotal = Math.min(...quotes.map((q) => q.total));
  const earliest = Math.min(...quotes.map((q) => startOfDay(q.deliveryDate).getTime()));
  const ratings = quotes.map((q) => q.rating).filter((r): r is number => r != null);
  const best = ratings.length ? Math.max(...ratings) : null;
  const out: Record<string, string[]> = {};
  for (const q of quotes) {
    const b: string[] = [];
    if (q.total === minTotal) b.push("Lowest total");
    if (startOfDay(q.deliveryDate).getTime() === earliest) b.push("Earliest delivery");
    if (best != null && q.rating === best && quotes.length > 1) b.push("Top rated");
    out[q.id] = b;
  }
  return out;
}

export type PaymentState =
  | { kind: "not_due" } // goods not received yet
  | { kind: "paid" }
  | { kind: "part_paid"; owed: number; dueDate: Date; overdue: boolean }
  | { kind: "unpaid"; owed: number; dueDate: Date; overdue: boolean };

/**
 * Payment status of an order. The amount owed is the invoice amount when there is one,
 * otherwise the value of what was received.
 */
export function paymentState(args: {
  receivedAt: Date | null;
  paymentTermsDays: number;
  amountDue: number;
  paid: number;
  today?: Date;
}): PaymentState {
  const { receivedAt, paymentTermsDays, amountDue, paid } = args;
  if (!receivedAt) return { kind: "not_due" };
  const owed = Math.max(0, amountDue - paid);
  if (owed === 0) return { kind: "paid" };
  const dueDate = addDays(startOfDay(receivedAt), paymentTermsDays);
  const today = startOfDay(args.today ?? new Date());
  const overdue = today.getTime() > dueDate.getTime();
  return paid > 0
    ? { kind: "part_paid", owed, dueDate, overdue }
    : { kind: "unpaid", owed, dueDate, overdue };
}

/** Compare a supplier's invoice with the value of goods received. */
export function invoiceCheck(invoiceAmount: number, receivedValue: number) {
  const difference = invoiceAmount - receivedValue;
  return { matches: difference === 0, difference };
}

export type Batch = { id: string; quantity: number; receivedAt: Date; expiresAt: Date | null };

/**
 * Take `qty` out of stock, oldest batch first (by expiry, then received date).
 * Returns the new quantity for each touched batch and any shortfall.
 */
export function takeFromBatches(batches: Batch[], qty: number) {
  const sorted = [...batches]
    .filter((b) => b.quantity > 0)
    .sort((a, b) => {
      const ea = a.expiresAt?.getTime() ?? Number.POSITIVE_INFINITY;
      const eb = b.expiresAt?.getTime() ?? Number.POSITIVE_INFINITY;
      if (ea !== eb) return ea - eb;
      return a.receivedAt.getTime() - b.receivedAt.getTime();
    });
  let left = qty;
  const updates: { id: string; quantity: number }[] = [];
  for (const b of sorted) {
    if (left <= 0) break;
    const take = Math.min(b.quantity, left);
    updates.push({ id: b.id, quantity: round3(b.quantity - take) });
    left = round3(left - take);
  }
  return { updates, shortfall: left > 0 ? left : 0 };
}

export function stockOnHand(batches: { quantity: number }[]): number {
  return round3(batches.reduce((s, b) => s + b.quantity, 0));
}

export function isLow(onHand: number, reorderLevel: number): boolean {
  return reorderLevel > 0 && onHand <= reorderLevel;
}

/** Batches with stock left that expire within `days` days (including already expired). */
export function expiringBatches<T extends Batch>(batches: T[], days: number, today = new Date()): T[] {
  const limit = addDays(startOfDay(today), days).getTime();
  return batches.filter((b) => b.quantity > 0 && b.expiresAt && b.expiresAt.getTime() <= limit);
}

/** Suggested reorder quantity: top back up to the usual order, or the usual order if none set. */
export function suggestedReorder(onHand: number, reorderLevel: number, reorderQty: number): number {
  if (reorderQty > 0) return reorderQty;
  return Math.max(1, round3(reorderLevel * 2 - onHand));
}

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
