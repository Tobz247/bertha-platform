import type { LoadedOrder } from "@/lib/orders";
import { day, naira, poNo, qty } from "@/lib/format";
import { grnNo } from "@/lib/rules";

/** The paper form a store sends to the accounts office for each delivery. */
export function GoodsReceivedNote({ o }: { o: LoadedOrder & { receivedBy: { name: string } | null } }) {
  const goods = o.lines.reduce((s, l) => s + Math.round((l.receivedQty ?? 0) * l.unitPrice), 0);
  const total = (o.received ?? goods + o.deliveryFee);
  const diff = o.invoice ? o.invoice.amount - total : 0;
  return (
    <article className="paper">
      <div className="head">
        <div>
          <h1>Goods received note</h1>
          <div>{o.buyer.name}</div>
          <div style={{ color: "#555" }}>{o.buyer.address}</div>
        </div>
        <div className="no">{grnNo(o.number)}<div style={{ fontWeight: 400, fontSize: 12 }}>{o.receivedAt ? day(o.receivedAt) + " " + o.receivedAt.getFullYear() : ""}</div></div>
      </div>
      <div className="meta">
        <div><span>Supplier</span>{o.supplier.name}<br />{o.supplier.phone}</div>
        <div><span>Purchase order</span>{poNo(o.number)} · {day(o.createdAt)}</div>
        <div><span>Supplier invoice</span>{o.invoice ? `${o.invoice.number} · ${naira(o.invoice.amount)}` : "Not received yet"}</div>
        <div><span>Payment terms</span>{o.paymentTermsDays ? `${o.paymentTermsDays} days after delivery` : "On delivery (cash or transfer)"}</div>
      </div>
      <div className="paper-table">
        <table>
          <thead>
            <tr><th>#</th><th>Item</th><th className="r">Ordered</th><th className="r">Received</th><th>Unit</th><th className="r">Unit price</th><th className="r">Value received</th><th>Remarks</th></tr>
          </thead>
          <tbody>
            {o.lines.map((l, i) => {
              const rec = l.receivedQty ?? 0;
              return (
                <tr key={l.id}>
                  <td>{i + 1}</td>
                  <td>{l.product}</td>
                  <td className="r">{qty(l.quantity)}</td>
                  <td className={`r ${rec < l.quantity ? "short" : ""}`}>{qty(rec)}</td>
                  <td>{l.unit}</td>
                  <td className="r">{naira(l.unitPrice)}</td>
                  <td className="r">{naira(rec * l.unitPrice)}</td>
                  <td>{l.issue ?? ""}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr><td colSpan={6}>Goods</td><td className="r">{naira(goods)}</td><td /></tr>
            <tr><td colSpan={6}>Delivery</td><td className="r">{naira(o.deliveryFee)}</td><td /></tr>
            <tr><td colSpan={6}>Total value received</td><td className="r">{naira(total)}</td><td /></tr>
          </tfoot>
        </table>
      </div>
      {o.invoice && diff !== 0 ? (
        <div className="note">The supplier&apos;s invoice is {naira(Math.abs(diff))} {diff > 0 ? "more" : "less"} than the value received. Pay on the value received unless agreed otherwise.</div>
      ) : null}
      <div className="signs">
        <div><b>Received by (store)</b>{o.receivedBy?.name ?? ""}</div>
        <div><b>Checked by</b>Name and signature</div>
        <div><b>Accounts</b>Name and signature</div>
      </div>
    </article>
  );
}
