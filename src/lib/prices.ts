import "server-only";
import type { OrderStatus } from "@prisma/client";
import { db } from "./db";
import { addDays, median, priceKey } from "./rules";

/** Orders whose prices were really agreed (the supplier accepted). */
export const PRICED_STATUSES: OrderStatus[] = ["CONFIRMED", "DISPATCHED", "RECEIVED"];

/** The going rate shows only once at least this many different businesses have paid it. */
export const MARKET_MIN_BUYERS = 2;
export const MARKET_DAYS = 60;

export type PricePoint = { at: Date; price: number; supplier: string; orderId: string; orderNumber: number; quantity: number };

/** Everything a buyer has paid, grouped by product, newest first. */
export async function buyerPriceHistory(buyerId: string, days = 365) {
  const lines = await db.orderLine.findMany({
    where: { order: { buyerId, status: { in: PRICED_STATUSES }, createdAt: { gte: addDays(new Date(), -days) } } },
    include: { order: { select: { id: true, number: true, createdAt: true, supplier: { select: { name: true } } } } },
    orderBy: { order: { createdAt: "desc" } },
  });
  const byKey = new Map<string, { key: string; product: string; unit: string; points: PricePoint[] }>();
  for (const l of lines) {
    const key = priceKey(l.product, l.unit);
    let g = byKey.get(key);
    if (!g) byKey.set(key, (g = { key, product: l.product, unit: l.unit, points: [] }));
    g.points.push({ at: l.order.createdAt, price: l.unitPrice, supplier: l.order.supplier.name, orderId: l.order.id, orderNumber: l.order.number, quantity: l.quantity });
  }
  return byKey;
}

/** Last price a buyer paid per product key. */
export async function lastPaidPrices(buyerId: string) {
  const h = await buyerPriceHistory(buyerId);
  return new Map([...h].map(([k, g]) => [k, g.points[0].price]));
}

/**
 * The going rate on Bertha for each product: the median price agreed in the last
 * MARKET_DAYS days, shown only when enough different businesses bought it.
 */
export async function marketPrices(days = MARKET_DAYS) {
  const lines = await db.orderLine.findMany({
    where: { order: { status: { in: PRICED_STATUSES }, createdAt: { gte: addDays(new Date(), -days) } } },
    select: { product: true, unit: true, unitPrice: true, order: { select: { buyerId: true } } },
  });
  const groups = new Map<string, { prices: number[]; buyers: Set<string> }>();
  for (const l of lines) {
    const key = priceKey(l.product, l.unit);
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { prices: [], buyers: new Set() }));
    g.prices.push(l.unitPrice);
    g.buyers.add(l.order.buyerId);
  }
  const out = new Map<string, { median: number; low: number; high: number; buyers: number }>();
  for (const [k, g] of groups) {
    if (g.buyers.size < MARKET_MIN_BUYERS) continue;
    out.set(k, { median: median(g.prices)!, low: Math.min(...g.prices), high: Math.max(...g.prices), buyers: g.buyers.size });
  }
  return out;
}
