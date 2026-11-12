import "server-only";
import { db } from "./db";
import { poNo, rfqNo } from "./format";
import { PRICED_STATUSES } from "./prices";
import { addDays, priceKey } from "./rules";
import {
  CONSISTENCY_DAYS,
  type ListChange,
  type Tone,
  consistencyScore,
  lastChange,
  listPriceAt,
  priceDifference,
  priceSpread,
} from "./supplier-rules";

export type ItemReport = {
  key: string;
  name: string;
  unit: string;
  itemId: string | null;
  current: number | null;
  available: boolean;
  updatedAt: Date | null;
  lastChange: ReturnType<typeof lastChange>;
  changes: number; // real price changes in the period
  spread: ReturnType<typeof priceSpread>;
  history: { at: Date; price: number; what: string }[];
};

export type Difference = {
  kind: "order" | "quote";
  ref: string;
  href: string;
  buyerId: string;
  at: Date;
  name: string;
  unit: string;
  charged: number;
  listed: number;
  pct: number;
  tone: Tone;
};

export type ConsistencyReport = {
  score: ReturnType<typeof consistencyScore>;
  items: ItemReport[];
  differences: Difference[];
  recentChanges: number; // real price changes in the last 14 days
};

/**
 * How steady each supplier's prices have been over the last CONSISTENCY_DAYS days: list price changes,
 * what they charged on orders, and quotes that differ from their own list.
 */
export async function supplierConsistency(supplierIds: string[], days = CONSISTENCY_DAYS): Promise<Map<string, ConsistencyReport>> {
  const out = new Map<string, ConsistencyReport>();
  if (!supplierIds.length) return out;
  const since = addDays(new Date(), -days);
  const fortnight = addDays(new Date(), -14);

  const [items, changes, orderLines, quoteLines] = await Promise.all([
    db.catalogItem.findMany({ where: { supplierId: { in: supplierIds } }, orderBy: { name: "asc" } }),
    db.catalogPriceChange.findMany({ where: { supplierId: { in: supplierIds }, at: { gte: since } }, orderBy: { at: "asc" } }),
    db.orderLine.findMany({
      where: { order: { supplierId: { in: supplierIds }, status: { in: PRICED_STATUSES }, createdAt: { gte: since } } },
      select: { product: true, unit: true, unitPrice: true, order: { select: { id: true, number: true, buyerId: true, supplierId: true, createdAt: true, source: true } } },
    }),
    db.quoteLine.findMany({
      where: { quote: { supplierId: { in: supplierIds }, status: { not: "WITHDRAWN" }, createdAt: { gte: since } } },
      select: {
        unitPrice: true,
        requestLine: { select: { product: true, unit: true } },
        quote: { select: { supplierId: true, createdAt: true, order: { select: { id: true } }, request: { select: { id: true, number: true, buyerId: true } } } },
      },
    }),
  ]);

  type Group = { name: string; unit: string; item: (typeof items)[number] | null; changes: (ListChange & { source: string })[]; orders: typeof orderLines; quotes: typeof quoteLines };
  const groups = new Map<string, Map<string, Group>>();
  const group = (supplierId: string, name: string, unit: string) => {
    let bySupplier = groups.get(supplierId);
    if (!bySupplier) groups.set(supplierId, (bySupplier = new Map()));
    const key = priceKey(name, unit);
    let g = bySupplier.get(key);
    if (!g) bySupplier.set(key, (g = { name, unit, item: null, changes: [], orders: [], quotes: [] }));
    return g;
  };
  for (const i of items) {
    const g = group(i.supplierId, i.name, i.unit);
    if (!g.item || i.available) g.item = i;
  }
  for (const c of changes) group(c.supplierId, c.name, c.unit).changes.push({ at: c.at, oldPrice: c.oldPrice, newPrice: c.newPrice, source: c.source });
  for (const l of orderLines) group(l.order.supplierId, l.product, l.unit).orders.push(l);
  // A quote that became an order is already counted as that order.
  for (const q of quoteLines) if (!q.quote.order) group(q.quote.supplierId, q.requestLine.product, q.requestLine.unit).quotes.push(q);

  for (const id of supplierIds) {
    const reports: ItemReport[] = [];
    const differences: Difference[] = [];
    let recent = 0;
    for (const [key, g] of groups.get(id) ?? []) {
      // Only items they list now or have sold; a lone quote isn't enough to judge.
      if (!g.item && !g.orders.length) continue;
      const current = g.item?.price ?? null;
      const history: ItemReport["history"] = [];
      const atStart = listPriceAt(g.changes, current, since);
      if (atStart != null) history.push({ at: since, price: atStart, what: "List price" });
      for (const c of g.changes) history.push({ at: c.at, price: c.newPrice, what: c.oldPrice == null ? "Added to list" : c.source === "RATE_CARD" ? "Rate card" : c.source === "ADMIN" ? "Changed by Bertha" : "List price" });
      for (const o of g.orders) {
        history.push({ at: o.order.createdAt, price: o.unitPrice, what: `${o.order.source === "QUOTE" ? "Charged (quote)" : "Charged"} on ${poNo(o.order.number)}` });
        const listed = listPriceAt(g.changes, current, o.order.createdAt);
        const d = priceDifference(o.unitPrice, listed);
        if (d && listed != null) differences.push({ kind: "order", ref: poNo(o.order.number), href: `/orders/${o.order.id}`, buyerId: o.order.buyerId, at: o.order.createdAt, name: g.name, unit: g.unit, charged: o.unitPrice, listed, ...d });
      }
      for (const q of g.quotes) {
        const listed = listPriceAt(g.changes, current, q.quote.createdAt);
        const d = priceDifference(q.unitPrice, listed);
        if (d && listed != null) differences.push({ kind: "quote", ref: rfqNo(q.quote.request.number), href: `/requests/${q.quote.request.id}`, buyerId: q.quote.request.buyerId, at: q.quote.createdAt, name: g.name, unit: g.unit, charged: q.unitPrice, listed, ...d });
      }
      history.sort((a, b) => a.at.getTime() - b.at.getTime());
      const real = g.changes.filter((c) => c.oldPrice != null && c.oldPrice !== c.newPrice);
      recent += real.filter((c) => c.at >= fortnight).length;
      reports.push({
        key,
        name: g.item?.name ?? g.name,
        unit: g.item?.unit ?? g.unit,
        itemId: g.item?.id ?? null,
        current,
        available: g.item?.available ?? false,
        updatedAt: g.item?.updatedAt ?? null,
        lastChange: lastChange(g.changes),
        changes: real.length,
        spread: priceSpread([...history.map((h) => h.price), ...(current != null ? [current] : [])]),
        history,
      });
    }
    differences.sort((a, b) => b.at.getTime() - a.at.getTime());
    reports.sort((a, b) => a.name.localeCompare(b.name));
    out.set(id, { score: consistencyScore(reports.map((r) => r.spread.level), differences.length), items: reports, differences, recentChanges: recent });
  }
  return out;
}

/** Record a list price being set, so its history is kept. Skips re-saves at the same price. */
export async function logPriceChange(args: { supplierId: string; itemId: string; name: string; unit: string; oldPrice: number | null; newPrice: number; source: "PRICE_LIST" | "ADMIN" | "RATE_CARD" }) {
  if (args.oldPrice === args.newPrice) return;
  await db.catalogPriceChange.create({ data: args });
}
