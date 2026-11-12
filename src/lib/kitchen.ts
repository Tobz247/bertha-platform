import "server-only";
import { db } from "./db";
import { itemKey } from "./kitchen-rules";
import { stockOnHand } from "./rules";

export const KITCHEN_STATUS: Record<string, { label: string; tone: "amber" | "blue" | "green" | "red" | "grey" }> = {
  SUBMITTED: { label: "Waiting for review", tone: "amber" },
  APPROVED: { label: "Approved", tone: "blue" },
  REJECTED: { label: "Not approved", tone: "red" },
  FULFILLED: { label: "Done", tone: "green" },
  CANCELLED: { label: "Cancelled", tone: "grey" },
};

export async function loadKitchenRequest(id: string, buyerId: string) {
  return db.kitchenRequest.findFirst({
    where: { id, buyerId },
    include: {
      lines: { orderBy: { position: "asc" } },
      raisedBy: true,
      reviewedBy: true,
      rfqs: { include: { orders: { include: { supplier: true } }, category: true }, orderBy: { createdAt: "asc" } },
      movements: { include: { item: true, user: true }, orderBy: { at: "asc" } },
    },
  });
}

/** Stock items of a buyer keyed by name and unit, with what is on hand. */
export async function stockByKey(buyerId: string) {
  const items = await db.stockItem.findMany({ where: { buyerId }, include: { batches: { where: { quantity: { gt: 0 } } } } });
  return new Map(items.map((i) => [itemKey(i.name, i.unit), { id: i.id, name: i.name, unit: i.unit, onHand: stockOnHand(i.batches) }]));
}
