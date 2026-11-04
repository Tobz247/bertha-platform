import Link from "next/link";
import { OrderStatusPill, Pill } from "@/components/ui";
import { canApprove, requireBuyer } from "@/lib/auth";
import { db } from "@/lib/db";
import { day, naira, poNo, rfqNo } from "@/lib/format";
import { orderTotal, paymentState } from "@/lib/rules";
import { stockOverview } from "@/lib/stock";

export const metadata = { title: "Home" };

export default async function Dashboard() {
  const { user, business } = await requireBuyer();
  const [requests, orders, stock] = await Promise.all([
    db.request.findMany({
      where: { buyerId: business.id, status: "OPEN" },
      include: { quotes: { where: { status: "SUBMITTED" } } },
      orderBy: { neededBy: "asc" },
    }),
    db.purchaseOrder.findMany({
      where: { buyerId: business.id, status: { notIn: ["CANCELLED", "DECLINED", "NOT_APPROVED"] } },
      include: { supplier: true, lines: true, payments: true, invoice: true },
      orderBy: { deliveryDate: "asc" },
    }),
    stockOverview(business.id),
  ]);

  const withQuotes = requests.filter((r) => r.quotes.length > 0);
  const quoteCount = withQuotes.reduce((s, r) => s + r.quotes.length, 0);
  const approvals = orders.filter((o) => o.status === "AWAITING_APPROVAL");
  const coming = orders.filter((o) => ["AWAITING_SUPPLIER", "CONFIRMED", "DISPATCHED"].includes(o.status));
  const low = stock.filter((s) => s.low);
  const expiring = stock.filter((s) => s.expiringQty > 0);
  const owed = orders
    .filter((o) => o.status === "RECEIVED")
    .map((o) => {
      const due = o.invoice?.amount ?? orderTotal(o.lines.map((l) => ({ quantity: l.receivedQty ?? l.quantity, unitPrice: l.unitPrice })), o.deliveryFee);
      return { o, st: paymentState({ receivedAt: o.receivedAt, paymentTermsDays: o.paymentTermsDays, amountDue: due, paid: o.payments.reduce((s, p) => s + p.amount, 0) }) };
    })
    .filter((x) => x.st.kind === "unpaid" || x.st.kind === "part_paid");
  const owedTotal = owed.reduce((s, x) => s + ("owed" in x.st ? x.st.owed : 0), 0);
  const overdue = owed.filter((x) => "overdue" in x.st && x.st.overdue).length;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">{business.name}</div>
          <h1>Good day, {user.name.split(" ")[0]}</h1>
        </div>
        <Link className="btn" href="/requests/new">New request</Link>
      </div>

      <div className="tiles">
        <Link className="tile green" href="/requests"><span className="n">{withQuotes.length}</span><span className="t">Requests with quotes</span><span className="k">{quoteCount} quote{quoteCount === 1 ? "" : "s"} to compare</span></Link>
        {canApprove(user) ? (
          <Link className="tile amber" href="/approvals"><span className="n">{approvals.length}</span><span className="t">Waiting for approval</span><span className="k">orders over {business.approvalLimit != null ? naira(business.approvalLimit) : "your limit"}</span></Link>
        ) : null}
        <Link className="tile blue" href="/orders"><span className="n">{coming.length}</span><span className="t">Orders coming</span><span className="k">{coming.filter((o) => o.status === "DISPATCHED").length} on the way now</span></Link>
        <Link className="tile red" href="/stock?filter=low"><span className="n">{low.length}</span><span className="t">Low stock</span><span className="k">at or below reorder level</span></Link>
        <Link className="tile amber" href="/stock?filter=expiring"><span className="n">{expiring.length}</span><span className="t">Expiring soon</span><span className="k">within 3 days</span></Link>
        <Link className="tile" href="/orders?filter=owed"><span className="n">{naira(owedTotal)}</span><span className="t">Owed to suppliers</span><span className="k">{owed.length} order{owed.length === 1 ? "" : "s"}{overdue ? `, ${overdue} overdue` : ""}</span></Link>
      </div>

      <div className="grid2" style={{ marginTop: 8 }}>
        <section>
          <div className="section">Arriving next</div>
          <div className="stack">
            {coming.length === 0 ? <div className="empty">No deliveries expected.</div> : null}
            {coming.slice(0, 6).map((o) => (
              <Link key={o.id} className="card" href={`/orders/${o.id}`}>
                <div className="row"><span className="t">{o.supplier.name}</span><OrderStatusPill status={o.status} /></div>
                <div className="k"><span className="mono">{poNo(o.number)}</span> · {o.lines.map((l) => l.product).join(", ")} · due {day(o.deliveryDate)}</div>
              </Link>
            ))}
          </div>
        </section>
        <section>
          <div className="section">Open requests</div>
          <div className="stack">
            {requests.length === 0 ? <div className="empty">No open requests. <Link href="/requests/new">Ask for quotes</Link></div> : null}
            {requests.slice(0, 6).map((r) => (
              <Link key={r.id} className="card" href={`/requests/${r.id}`}>
                <div className="row"><span className="t">{r.title}</span>{r.quotes.length ? <Pill tone="green">{r.quotes.length} quote{r.quotes.length > 1 ? "s" : ""}</Pill> : <Pill tone="grey">Waiting for quotes</Pill>}</div>
                <div className="k"><span className="mono">{rfqNo(r.number)}</span> · needed {day(r.neededBy)}</div>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
