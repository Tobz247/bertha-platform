import "server-only";
import { db } from "./db";
import { areaOnHand } from "./kitchen-rules";
import { expiringBatches, isLow, stockOnHand } from "./rules";

export async function stockOverview(buyerId: string) {
  const items = await db.stockItem.findMany({
    where: { buyerId },
    include: { batches: { where: { quantity: { gt: 0 } }, orderBy: { expiresAt: "asc" } } },
    orderBy: { name: "asc" },
  });
  return items.map((i) => {
    const onHand = stockOnHand(i.batches);
    const expiring = expiringBatches(i.batches, 3);
    const nextExpiry = i.batches.find((b) => b.expiresAt)?.expiresAt ?? null;
    return { ...i, onHand, inStore: areaOnHand(i.batches, "STORE"), inKitchen: areaOnHand(i.batches, "KITCHEN"), low: isLow(onHand, i.reorderLevel), expiringQty: expiring.reduce((s, b) => s + b.quantity, 0), nextExpiry };
  });
}
