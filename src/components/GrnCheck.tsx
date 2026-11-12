import Link from "next/link";
import { approveGoodsReceived } from "@/app/actions/kitchen";
import { Pill } from "@/components/ui";
import { day, qty } from "@/lib/format";
import { deliveryAllMatch, deliveryMatch, kitchenNo } from "@/lib/kitchen-rules";
import { requestedFor, type LoadedOrder } from "@/lib/orders";

/** Lines of a delivery checked against the order (and the kitchen request), plus the manager's approval. */
export function grnMatches(o: LoadedOrder) {
  return o.lines.map((l) => {
    const requested = requestedFor(o, l);
    return { l, requested, m: deliveryMatch({ requested: o.requested ? requested : l.quantity, ordered: l.quantity, received: l.receivedQty ?? 0, unit: l.unit }) };
  });
}

export function GrnCheck({ o, canApprove }: { o: LoadedOrder; canApprove: boolean }) {
  const rows = grnMatches(o);
  const allMatch = deliveryAllMatch(rows.map((r) => r.m)) && !(o.check && !o.check.matches);
  const kr = o.request?.kitchenRequest ?? null;
  return (
    <div className="card stack" id="grn-check">
      <div className="row">
        <h2>Check delivery against the {kr ? "request" : "order"}</h2>
        {o.grnApprovedAt ? <Pill tone="green">GRN approved</Pill> : <Pill tone="amber">GRN waiting for approval</Pill>}
      </div>
      {kr ? <p className="k" style={{ margin: 0 }}>Bought for kitchen request <Link href={`/kitchen/${kr.id}`}>{kitchenNo(kr.number)}</Link> ({kr.department}).</p> : null}
      <div className="table-wrap">
        <table className="list">
          <thead><tr><th>Item</th>{kr ? <th className="r">Kitchen asked</th> : null}<th className="r">Ordered</th><th className="r">Received</th><th>Result</th></tr></thead>
          <tbody>
            {rows.map(({ l, requested, m }) => (
              <tr key={l.id}>
                <td>{l.product}{l.issue ? <div className="k" style={{ color: "var(--red)" }}>{l.issue}</div> : null}</td>
                {kr ? <td className="r">{requested != null ? `${qty(requested)} ${l.unit}` : "—"}</td> : null}
                <td className="r">{qty(l.quantity)} {l.unit}</td>
                <td className="r">{qty(l.receivedQty ?? 0)}</td>
                <td><Pill tone={m.tone}>{m.label}</Pill></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {o.check && !o.check.matches ? <div className="alert warn">The supplier&apos;s invoice doesn&apos;t match the value received (see Payment below).</div> : null}
      {o.grnApprovedAt ? (
        <div className="alert ok">Checked and approved by {o.grnApprovedBy?.name ?? "a manager"} on {day(o.grnApprovedAt)}.{o.grnNote ? ` “${o.grnNote}”` : ""}</div>
      ) : canApprove ? (
        <form action={approveGoodsReceived} className="stack">
          <input type="hidden" name="orderId" value={o.id} />
          {allMatch ? <div className="alert info">Everything matches. Approve the goods received note so accounts can pay it.</div> : <div className="alert warn">Some lines don&apos;t match. Approve once you&apos;ve agreed with the supplier how it will be settled (credit note, a second delivery, or paying for what arrived).</div>}
          <label className="f">Note <span className="hint">optional, e.g. “credit note agreed for 2 kg short”</span><input type="text" name="grnNote" id="grnNote" /></label>
          <div><button className="btn" type="submit">Approve goods received note</button></div>
        </form>
      ) : (
        <div className="alert info">An owner or manager checks and approves this goods received note.</div>
      )}
    </div>
  );
}
