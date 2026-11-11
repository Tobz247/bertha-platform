import Link from "next/link";
import { GoodsReceivedNote } from "@/components/GoodsReceivedNote";
import { PrintButton } from "@/components/PrintButton";
import { requireBuyer } from "@/lib/auth";
import { db } from "@/lib/db";
import { loadOrder } from "@/lib/orders";
import { receivedRange } from "@/lib/received";

export const metadata = { title: "Goods received notes" };

/** Every goods received note in a date range, one per page, for accounts. */
export default async function GrnBatch({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { business } = await requireBuyer();
  const { from, to } = receivedRange(sp);
  const ids = await db.purchaseOrder.findMany({
    where: { buyerId: business.id, receivedAt: { gte: from, lt: to } },
    select: { id: true },
    orderBy: { receivedAt: "asc" },
  });
  const orders = (await Promise.all(ids.map((x) => loadOrder(x.id)))).filter((o) => o != null);
  return (
    <div className="paper-wrap">
      <div className="paper-bar">
        <Link href={`/received?from=${sp.from ?? ""}&to=${sp.to ?? ""}`}>‹ Back to goods received</Link>
        {orders.length ? <PrintButton label={`Print all ${orders.length}`} /> : null}
      </div>
      {orders.length === 0 ? <div className="paper">No deliveries were received in these dates.</div> : orders.map((o) => <GoodsReceivedNote key={o.id} o={o} />)}
    </div>
  );
}
