import Link from "next/link";
import { Empty, OrderStatusPill, PageHead } from "@/components/ui";
import { requireSupplier } from "@/lib/auth";
import { db } from "@/lib/db";
import { day, naira, poNo } from "@/lib/format";
import { orderTotal } from "@/lib/rules";

export const metadata = { title: "Orders" };

export default async function SupplierOrders() {
  const { business } = await requireSupplier();
  const orders = await db.purchaseOrder.findMany({
    where: { supplierId: business.id, status: { notIn: ["AWAITING_APPROVAL", "NOT_APPROVED"] } },
    include: { buyer: true, lines: true, payments: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return (
    <>
      <PageHead title="Orders" eyebrow="Purchase orders from buyers" />
      {orders.length === 0 ? <Empty>No orders yet. Orders appear here when a buyer accepts your quote.</Empty> : (
        <div className="card table-wrap" style={{ padding: 0 }}>
          <table className="list">
            <thead><tr><th>Order</th><th>Buyer</th><th>Deliver</th><th>Status</th><th className="r">Total</th><th className="r">Paid</th></tr></thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td><Link className="mono" href={`/supplier/orders/${o.id}`}>{poNo(o.number)}</Link><div className="k">{o.lines.map((l) => l.product).join(", ")}</div></td>
                  <td>{o.buyer.name}</td>
                  <td>{day(o.deliveryDate)}</td>
                  <td><OrderStatusPill status={o.status} /></td>
                  <td className="r">{naira(orderTotal(o.lines, o.deliveryFee))}</td>
                  <td className="r">{naira(o.payments.reduce((s, p) => s + p.amount, 0))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
