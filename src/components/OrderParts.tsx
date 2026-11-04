import type { LoadedOrder } from "@/lib/orders";
import { day, naira, qty } from "@/lib/format";

export function OrderLines({ o }: { o: LoadedOrder }) {
  const counted = o.receivedAt != null;
  return (
    <div className="table-wrap">
      <table className="list">
        <thead>
          <tr><th>Item</th><th className="r">Ordered</th>{counted ? <th className="r">Received</th> : null}<th className="r">Price</th><th className="r">Value</th></tr>
        </thead>
        <tbody>
          {o.lines.map((l) => (
            <tr key={l.id}>
              <td>{l.product}{l.issue ? <div className="k" style={{ color: "var(--red)" }}>{l.issue}</div> : null}</td>
              <td className="r">{qty(l.quantity)} {l.unit}</td>
              {counted ? <td className="r" style={l.receivedQty != null && l.receivedQty < l.quantity ? { color: "var(--red)", fontWeight: 700 } : undefined}>{qty(l.receivedQty ?? 0)}</td> : null}
              <td className="r">{naira(l.unitPrice)}</td>
              <td className="r">{naira(Math.round(l.quantity * l.unitPrice))}</td>
            </tr>
          ))}
          <tr><td colSpan={counted ? 4 : 3}>Delivery</td><td className="r">{o.deliveryFee ? naira(o.deliveryFee) : "Free"}</td></tr>
        </tbody>
        <tfoot>
          <tr><td colSpan={counted ? 4 : 3}>Order total</td><td className="r">{naira(o.total)}</td></tr>
          {o.received != null && o.received !== o.total ? <tr><td colSpan={counted ? 4 : 3}>Value received</td><td className="r">{naira(o.received)}</td></tr> : null}
        </tfoot>
      </table>
    </div>
  );
}

export function OrderEvents({ o }: { o: LoadedOrder }) {
  return (
    <div className="timeline">
      {o.events.map((e) => (
        <div key={e.id} className="ts done">
          <span className="d" />
          <div>
            <div className="l">{e.message}</div>
            <div className="s">{day(e.at)} {e.at.toTimeString().slice(0, 5)}{e.actor ? ` · ${e.actor.name}` : ""}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function PaymentSummary({ o }: { o: LoadedOrder }) {
  const p = o.pay;
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row">
        <div><div className="k">{o.invoice ? `Invoice ${o.invoice.number}` : "Amount due"}</div><div className="big">{naira(o.amountDue)}</div></div>
        <div style={{ textAlign: "right" }}>
          <div className="k">Paid so far</div><div className="t num">{naira(o.paid)}</div>
          {"dueDate" in p ? <div className="k" style={p.overdue ? { color: "var(--red)", fontWeight: 600 } : undefined}>{p.overdue ? "Overdue since" : "Due"} {day(p.dueDate)}</div> : null}
        </div>
      </div>
      {o.payments.length ? (
        <table className="list">
          <tbody>
            {o.payments.map((pm) => (
              <tr key={pm.id}><td>{day(pm.paidAt)} · {pm.method === "CASH" ? "Cash" : "Transfer"}{pm.reference ? <span className="k"> · {pm.reference}</span> : null}</td><td className="r">{naira(pm.amount)}</td></tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}
