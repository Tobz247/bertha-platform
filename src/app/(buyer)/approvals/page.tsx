import Link from "next/link";
import { redirect } from "next/navigation";
import { decideApproval } from "@/app/actions/buyer";
import { Flash } from "@/components/Flash";
import { Empty, PageHead } from "@/components/ui";
import { canApprove, requireBuyer } from "@/lib/auth";
import { db } from "@/lib/db";
import { day, naira, poNo, qty } from "@/lib/format";
import { orderTotal } from "@/lib/rules";

export const metadata = { title: "Approvals" };

export default async function Approvals({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { user, business } = await requireBuyer();
  if (!canApprove(user)) redirect("/dashboard");
  const orders = await db.purchaseOrder.findMany({
    where: { buyerId: business.id, status: "AWAITING_APPROVAL" },
    include: { supplier: true, lines: { orderBy: { position: "asc" } }, createdBy: true, quote: { include: { request: { include: { quotes: { include: { lines: true } }, lines: true } } } } },
    orderBy: { createdAt: "asc" },
  });

  return (
    <>
      <PageHead title="Approvals" eyebrow={`Orders over ${naira(business.approvalLimit ?? 0)} wait here before the supplier sees them`} />
      <Flash sp={sp} />
      {orders.length === 0 ? <Empty>Nothing waiting for approval.</Empty> : null}
      <div className="stack">
        {orders.map((o) => {
          const total = orderTotal(o.lines, o.deliveryFee);
          const req = o.quote?.request;
          const others = req
            ? req.quotes
                .filter((q) => q.id !== o.quoteId && q.status !== "WITHDRAWN")
                .map((q) => {
                  const price = new Map(q.lines.map((l) => [l.requestLineId, l.unitPrice]));
                  return orderTotal(req.lines.filter((l) => price.has(l.id)).map((l) => ({ quantity: l.quantity, unitPrice: price.get(l.id)! })), q.deliveryFee);
                })
            : [];
          return (
            <form key={o.id} action={decideApproval} className="card stack">
              <input type="hidden" name="orderId" value={o.id} />
              <input type="hidden" name="returnTo" value="/approvals" />
              <div className="row">
                <div>
                  <div className="t">{o.supplier.name}</div>
                  <div className="k"><Link href={`/orders/${o.id}`} className="mono">{poNo(o.number)}</Link> · raised by {o.createdBy.name} on {day(o.createdAt)} · delivery {day(o.deliveryDate)}</div>
                </div>
                <div className="big">{naira(total)}</div>
              </div>
              <div className="k">{o.lines.map((l) => `${qty(l.quantity)} ${l.unit} ${l.product} at ${naira(l.unitPrice)}`).join(" · ")}</div>
              <div className="k">{o.paymentTermsDays ? `${o.paymentTermsDays}-day terms` : "Pay on delivery"}{others.length ? ` · ${others.length} other quote${others.length > 1 ? "s" : ""}, lowest ${naira(Math.min(...others))}` : " · only quote received"}</div>
              <label className="f">Note <span className="hint">optional</span><input type="text" name="note" id={`note-${o.id}`} /></label>
              <div className="btns">
                <button className="btn" type="submit" name="decision" value="approve">Approve and send</button>
                <button className="btn danger" type="submit" name="decision" value="reject">Don&apos;t approve</button>
              </div>
            </form>
          );
        })}
      </div>
    </>
  );
}
