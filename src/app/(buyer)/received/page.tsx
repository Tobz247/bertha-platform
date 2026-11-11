import Link from "next/link";
import { Empty, PageHead, Pill } from "@/components/ui";
import { requireBuyer } from "@/lib/auth";
import { db } from "@/lib/db";
import { dateInput, day, naira, poNo } from "@/lib/format";
import { loadOrder, payLabel } from "@/lib/orders";
import { receivedRange } from "@/lib/received";
import { grnNo } from "@/lib/rules";

export const metadata = { title: "Goods received" };

export default async function Received({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { business } = await requireBuyer();
  const { from, to, fromDay, toDay } = receivedRange(sp);
  const ids = await db.purchaseOrder.findMany({
    where: { buyerId: business.id, receivedAt: { gte: from, lt: to } },
    select: { id: true },
    orderBy: { receivedAt: "desc" },
  });
  const orders = (await Promise.all(ids.map((x) => loadOrder(x.id)))).filter((o) => o != null);
  const total = orders.reduce((s, o) => s + (o.received ?? 0), 0);
  const invoiced = orders.reduce((s, o) => s + (o.invoice?.amount ?? 0), 0);
  const mismatches = orders.filter((o) => o.check && !o.check.matches).length;
  const q = `from=${dateInput(fromDay)}&to=${dateInput(toDay)}`;

  return (
    <>
      <PageHead
        title="Goods received"
        eyebrow="A goods received note for every delivery, ready for the accounts office"
        action={orders.length ? <Link className="btn" href={`/grn?${q}`}>Print all {orders.length} notes</Link> : null}
      />
      <form method="get" className="btns" style={{ alignItems: "flex-end", marginBottom: 14 }}>
        <label className="f" style={{ width: 170 }}>From<input type="date" name="from" id="from" defaultValue={dateInput(fromDay)} /></label>
        <label className="f" style={{ width: 170 }}>To<input type="date" name="to" id="to" defaultValue={dateInput(toDay)} /></label>
        <button className="btn sec" type="submit">Show</button>
      </form>
      {orders.length === 0 ? <Empty>No deliveries received between {day(fromDay)} and {day(toDay)}.</Empty> : (
        <>
          <div className="tiles" style={{ marginBottom: 14 }}>
            <div className="tile"><div className="k">Deliveries</div><div className="n">{orders.length}</div></div>
            <div className="tile"><div className="k">Value received</div><div className="n">{naira(total)}</div></div>
            <div className="tile"><div className="k">Invoiced by suppliers</div><div className="n">{naira(invoiced)}</div></div>
            <div className={`tile ${mismatches ? "red" : ""}`}><div className="k">Invoices that don&apos;t match</div><div className="n">{mismatches}</div></div>
          </div>
          <div className="card table-wrap" style={{ padding: 0 }}>
            <table className="list">
              <thead><tr><th>Note</th><th>Supplier</th><th>Received by</th><th className="r">Value received</th><th className="r">Invoice</th><th>Payment</th></tr></thead>
              <tbody>
                {orders.map((o) => {
                  const pl = payLabel(o);
                  return (
                    <tr key={o.id}>
                      <td><Link className="t mono" href={`/grn/${o.id}`}>{grnNo(o.number)}</Link><div className="k">{day(o.receivedAt!)} · <Link href={`/orders/${o.id}`}>{poNo(o.number)}</Link></div></td>
                      <td>{o.supplier.name}</td>
                      <td>{o.receivedBy?.name ?? <span className="k">—</span>}</td>
                      <td className="r t">{naira(o.received ?? 0)}</td>
                      <td className="r">{o.invoice ? <>{naira(o.invoice.amount)}{o.check && !o.check.matches ? <div><Pill tone="red">{o.check.difference > 0 ? "+" : "−"}{naira(Math.abs(o.check.difference))}</Pill></div> : null}</> : <span className="k">not yet</span>}</td>
                      <td>{pl ? <Pill tone={pl.tone}>{pl.label}</Pill> : null}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
