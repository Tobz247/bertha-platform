import Link from "next/link";
import { Empty, OrderStatusPill, PageHead, Pill } from "@/components/ui";
import { requireBuyer } from "@/lib/auth";
import { db } from "@/lib/db";
import { day, naira, poNo } from "@/lib/format";
import { orderTotal, paymentState, receivedTotal } from "@/lib/rules";

export const metadata = { title: "Orders" };

const GROUPS: [string, string[]][] = [
  ["Waiting", ["AWAITING_APPROVAL", "AWAITING_SUPPLIER", "CONFIRMED"]],
  ["On the way", ["DISPATCHED"]],
  ["Delivered", ["RECEIVED"]],
  ["Closed", ["NOT_APPROVED", "DECLINED", "CANCELLED"]],
];

export default async function Orders({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { business } = await requireBuyer();
  const orders = await db.purchaseOrder.findMany({
    where: { buyerId: business.id },
    include: { supplier: true, lines: true, payments: true, invoice: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const rows = orders.map((o) => {
    const total = orderTotal(o.lines, o.deliveryFee);
    const due = o.invoice?.amount ?? (o.receivedAt ? receivedTotal(o.lines, o.deliveryFee) : total);
    const pay = paymentState({ receivedAt: o.receivedAt, paymentTermsDays: o.paymentTermsDays, amountDue: due, paid: o.payments.reduce((s, p) => s + p.amount, 0) });
    return { o, total, pay };
  });
  const owedOnly = sp.filter === "owed";
  const shown = owedOnly ? rows.filter((r) => r.pay.kind === "unpaid" || r.pay.kind === "part_paid") : rows;

  return (
    <>
      <PageHead
        title={owedOnly ? "Orders to pay" : "Orders"}
        eyebrow={owedOnly ? <Link href="/orders">Show all orders</Link> : "Purchase orders raised from your requests"}
      />
      {shown.length === 0 ? <Empty>{owedOnly ? "Nothing owed to suppliers." : "No orders yet. Award a quote to raise one."}</Empty> : null}
      {GROUPS.map(([label, statuses]) => {
        const list = shown.filter((r) => statuses.includes(r.o.status));
        if (!list.length) return null;
        return (
          <section key={label}>
            <div className="section">{label}</div>
            <div className="card table-wrap" style={{ padding: 0 }}>
              <table className="list">
                <thead><tr><th>Order</th><th>Supplier</th><th>Delivery</th><th>Status</th><th className="r">Total</th></tr></thead>
                <tbody>
                  {list.map(({ o, total, pay }) => (
                    <tr key={o.id}>
                      <td><Link href={`/orders/${o.id}`} className="mono">{poNo(o.number)}</Link><div className="k">{o.lines.map((l) => l.product).join(", ")}</div></td>
                      <td>{o.supplier.name}</td>
                      <td>{day(o.deliveryDate)}</td>
                      <td>
                        {pay.kind === "not_due" ? <OrderStatusPill status={o.status} /> : pay.kind === "paid" ? <Pill tone="green">Paid</Pill> : pay.overdue ? <Pill tone="red">Overdue</Pill> : <Pill tone="amber">{pay.kind === "part_paid" ? "Part paid" : `Due ${day(pay.dueDate)}`}</Pill>}
                      </td>
                      <td className="r">{naira(total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </>
  );
}
