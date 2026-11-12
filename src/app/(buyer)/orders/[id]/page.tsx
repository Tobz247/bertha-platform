import Link from "next/link";
import { notFound } from "next/navigation";
import { cancelOrder, decideApproval, rateOrder, receiveOrder, recordPayment } from "@/app/actions/buyer";
import { Flash } from "@/components/Flash";
import { GrnCheck } from "@/components/GrnCheck";
import { OrderEvents, OrderLines, PaymentSummary } from "@/components/OrderParts";
import { OrderStatusPill, PageHead, Pill } from "@/components/ui";
import { can, requireBuyer } from "@/lib/auth";
import { dateInput, day, naira, poNo, qty, rfqNo } from "@/lib/format";
import { kitchenNo } from "@/lib/kitchen-rules";
import { loadOrder, payLabel, requestedFor } from "@/lib/orders";
import { addDays } from "@/lib/rules";

export const metadata = { title: "Order" };

export default async function OrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const { user, business } = await requireBuyer("view_orders");
  const o = await loadOrder(id);
  if (!o || o.buyerId !== business.id) notFound();
  const pl = payLabel(o);
  const canReceive = can(user, "receive") && (o.status === "CONFIRMED" || o.status === "DISPATCHED");
  const canCancel = can(user, "order") && ["AWAITING_APPROVAL", "AWAITING_SUPPLIER", "CONFIRMED"].includes(o.status);
  const today = new Date();

  return (
    <>
      <PageHead
        title={o.supplier.name}
        eyebrow={<><span className="mono">{poNo(o.number)}</span> · raised {day(o.createdAt)} by {o.createdBy.name}{o.request ? <> · from <Link href={`/requests/${o.request.id}`}>{rfqNo(o.request.number)}</Link></> : o.source === "PRICE_LIST" ? <> · from <Link href={`/suppliers/${o.supplierId}`}>price list</Link></> : null}</>}
        backHref="/orders"
        backLabel="Orders"
        action={<div className="badges"><OrderStatusPill status={o.status} />{pl ? <Pill tone={pl.tone}>{pl.label}</Pill> : null}{o.receivedAt ? <Link className="btn sec small" href={`/grn/${o.id}`}>Goods received note</Link> : null}</div>}
      />
      <Flash sp={sp} />

      <div className="grid2">
        <div className="stack">
          <div className="card stack">
            <div className="k">Deliver {day(o.deliveryDate)} to {o.deliveryAddress} · {o.paymentTermsDays ? `pay ${o.paymentTermsDays} days after delivery` : "pay on delivery"} · supplier phone {o.supplier.phone}</div>
            <OrderLines o={o} />
          </div>

          {o.status === "AWAITING_APPROVAL" ? (
            can(user, "approve") ? (
              <form action={decideApproval} className="card stack">
                <input type="hidden" name="orderId" value={o.id} />
                <div className="alert warn"><b>Needs your approval.</b> {naira(o.total)} is over the {naira(business.approvalLimit ?? 0)} limit.</div>
                <label className="f">Note <span className="hint">optional, shown to the person who raised it</span><input type="text" name="note" id="note" /></label>
                <div className="btns">
                  <button className="btn" type="submit" name="decision" value="approve">Approve and send</button>
                  <button className="btn danger" type="submit" name="decision" value="reject">Don't approve</button>
                </div>
              </form>
            ) : (
              <div className="alert info">Waiting for an owner or manager to approve this order.</div>
            )
          ) : null}
          {o.status === "NOT_APPROVED" ? <div className="alert error">Not approved{o.approvedBy ? ` by ${o.approvedBy.name}` : ""}.{o.decisionNote ? ` “${o.decisionNote}”` : ""}</div> : null}
          {o.status === "DECLINED" ? <div className="alert error">The supplier declined this order.{o.decisionNote ? ` “${o.decisionNote}”` : ""} {o.request ? "Go back to the request to choose another quote, or create a new request." : "Try another supplier, or ask for quotes."}</div> : null}

          {canReceive ? (
            <form action={receiveOrder} className="card stack" id="receive">
              <input type="hidden" name="orderId" value={o.id} />
              <h2>Record goods received</h2>
              <p className="k" style={{ margin: 0 }}>Count what arrived. Stock goes up by these amounts, and the supplier&apos;s invoice is checked against them.{o.request?.kitchenRequest ? <> These goods are for kitchen request <Link href={`/kitchen/${o.request.kitchenRequest.id}`}>{kitchenNo(o.request.kitchenRequest.number)}</Link>; after you confirm, issue them to the {o.request.kitchenRequest.department.toLowerCase()} from there.</> : null}</p>
              {o.lines.map((l) => (
                <fieldset key={l.id}>
                  <legend>{l.product} · ordered {qty(l.quantity)} {l.unit}{o.requested ? (requestedFor(o, l) != null ? ` · kitchen asked for ${qty(requestedFor(o, l)!)}` : " · not on the kitchen request") : ""}</legend>
                  <div className="fields">
                    <label className="f">Received ({l.unit})<input type="number" name={`rec_${l.id}`} id={`rec_${l.id}`} defaultValue={l.quantity} min="0" step="any" /></label>
                    <label className="f">Problem
                      <select name={`issue_${l.id}`} id={`issue_${l.id}`} defaultValue="No problem">
                        <option>No problem</option><option>Short delivery</option><option>Poor quality</option><option>Wrong item</option>
                      </select>
                    </label>
                    <label className="f">Use by <span className="hint">optional</span><input type="date" name={`exp_${l.id}`} id={`exp_${l.id}`} min={dateInput(today)} /></label>
                    <label className="f">Store in
                      <select name={`loc_${l.id}`} id={`loc_${l.id}`} defaultValue="DRY_STORE">
                        <option value="DRY_STORE">Dry store</option><option value="COLD_ROOM">Cold room</option><option value="FREEZER">Freezer</option><option value="OTHER">Other</option>
                      </select>
                    </label>
                  </div>
                </fieldset>
              ))}
              <div><button className="btn" type="submit">Confirm and update stock</button></div>
            </form>
          ) : null}

          {o.status === "RECEIVED" ? <GrnCheck o={o} canApprove={canApprove(user)} /> : null}

          {o.status === "RECEIVED" ? (
            <div className="card stack">
              <h2>Payment</h2>
              {o.check && !o.check.matches ? (
                <div className="alert warn">
                  <b>The invoice doesn&apos;t match what arrived.</b> Invoice {naira(o.invoice!.amount)}, goods received worth {naira(o.received ?? 0)}
                  {o.check.difference > 0 ? `. Ask ${o.supplier.name} for a credit note for ${naira(o.check.difference)}.` : "."}
                </div>
              ) : null}
              {!o.invoice ? <div className="alert info">No invoice from the supplier yet. The amount due is the value of what you received.</div> : null}
              <PaymentSummary o={o} />
              {o.pay.kind !== "paid" && can(user, "pay") ? (
                <form action={recordPayment} className="stack" style={{ borderTop: "1px solid var(--line)", paddingTop: 12 }}>
                  <input type="hidden" name="orderId" value={o.id} />
                  <div className="fields">
                    <label className="f">Paid by
                      <select name="method" id="method" defaultValue="TRANSFER"><option value="TRANSFER">Bank transfer</option><option value="CASH">Cash</option></select>
                    </label>
                    <label className="f">Amount (₦)<input type="number" name="amount" id="amount" min="1" defaultValue={"owed" in o.pay ? o.pay.owed : 0} /></label>
                    <label className="f">Date<input type="date" name="paidAt" id="paidAt" defaultValue={dateInput(today)} max={dateInput(addDays(today, 1))} /></label>
                  </div>
                  <label className="f">Reference <span className="hint">transfer reference, or who collected the cash</span><input type="text" name="reference" id="reference" /></label>
                  <p className="k" style={{ margin: 0 }}>This keeps your records and the supplier&apos;s in step. It doesn&apos;t move money.</p>
                  <div><button className="btn" type="submit">Record payment</button></div>
                </form>
              ) : null}
            </div>
          ) : null}

          {o.status === "RECEIVED" && can(user, "rate") ? (
            <form action={rateOrder} className="card stack">
              <input type="hidden" name="orderId" value={o.id} />
              <h2>{o.rating ? "Your rating" : `Rate ${o.supplier.name}`}</h2>
              <div className="fields">
                {(["quality", "accuracy", "timeliness", "price"] as const).map((k) => (
                  <label key={k} className="f">{{ quality: "Quality", accuracy: "Right quantity", timeliness: "On time", price: "Fair price" }[k]}
                    <select name={k} id={`rate-${k}`} defaultValue={String(o.rating?.[k] ?? 4)}>
                      {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{"★".repeat(n)}</option>)}
                    </select>
                  </label>
                ))}
              </div>
              <label className="f">Comment <span className="hint">optional</span><input type="text" name="comment" id="comment" defaultValue={o.rating?.comment ?? ""} /></label>
              <div><button className="btn sec" type="submit">{o.rating ? "Update rating" : "Save rating"}</button></div>
            </form>
          ) : null}

          {canCancel ? (
            <form action={cancelOrder}>
              <input type="hidden" name="orderId" value={o.id} />
              <button className="btn sec small" type="submit">Cancel this order</button>
            </form>
          ) : null}
        </div>

        <aside className="card">
          <h2 style={{ marginBottom: 12 }}>History</h2>
          <OrderEvents o={o} />
        </aside>
      </div>
    </>
  );
}
