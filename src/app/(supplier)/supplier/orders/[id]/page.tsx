import { notFound } from "next/navigation";
import { raiseInvoice, supplierOrderStep } from "@/app/actions/supplier";
import { Flash } from "@/components/Flash";
import { OrderEvents, OrderLines, PaymentSummary } from "@/components/OrderParts";
import { OrderStatusPill, PageHead } from "@/components/ui";
import { requireSupplier } from "@/lib/auth";
import { day, poNo } from "@/lib/format";
import { loadOrder } from "@/lib/orders";

export const metadata = { title: "Order" };

export default async function SupplierOrder({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const { business } = await requireSupplier();
  const o = await loadOrder(id);
  if (!o || o.supplierId !== business.id || o.status === "AWAITING_APPROVAL" || o.status === "NOT_APPROVED") notFound();
  const step = (name: string, label: string, cls = "btn") => (
    <button className={cls} type="submit" name="step" value={name}>{label}</button>
  );
  return (
    <>
      <PageHead title={o.buyer.name} eyebrow={<><span className="mono">{poNo(o.number)}</span> · {day(o.createdAt)} · {o.source === "PRICE_LIST" ? "from your price list" : "from your quote"}</>} backHref="/supplier/orders" backLabel="Orders" action={<OrderStatusPill status={o.status} />} />
      <Flash sp={sp} />
      <div className="grid2">
        <div className="stack">
          <div className="card stack">
            <div className="k">Deliver {day(o.deliveryDate)} to {o.deliveryAddress} · buyer phone {o.buyer.phone} · {o.paymentTermsDays ? `payment ${o.paymentTermsDays} days after delivery` : "payment on delivery, cash or transfer"}</div>
            <OrderLines o={o} />
          </div>
          {o.status === "AWAITING_SUPPLIER" ? (
            <form action={supplierOrderStep} className="card stack">
              <input type="hidden" name="orderId" value={o.id} />
              <h2>Can you fulfil this order?</h2>
              <label className="f">Note if declining <span className="hint">optional</span><input type="text" name="note" id="note" /></label>
              <div className="btns">{step("accept", "Accept order")}{step("decline", "Decline", "btn danger")}</div>
            </form>
          ) : null}
          {o.status === "CONFIRMED" ? (
            <form action={supplierOrderStep} className="card stack">
              <input type="hidden" name="orderId" value={o.id} />
              <p style={{ margin: 0 }}>Mark the order dispatched when it leaves you. The buyer gets a message.</p>
              <div>{step("dispatch", "Mark dispatched")}</div>
            </form>
          ) : null}
          {o.status === "DISPATCHED" || o.status === "RECEIVED" ? (
            <form action={raiseInvoice} className="card stack">
              <input type="hidden" name="orderId" value={o.id} />
              <h2>{o.invoice ? "Your invoice" : "Raise invoice"}</h2>
              {o.status === "RECEIVED" && o.received != null && o.received !== o.total ? (
                <div className="alert warn">The buyer counted goods worth <b>₦{o.received.toLocaleString("en-NG")}</b>, less than the order. Invoice for what arrived to avoid a dispute.</div>
              ) : null}
              <div className="fields">
                <label className="f">Invoice number<input type="text" name="number" id="number" required defaultValue={o.invoice?.number ?? `INV-${o.number}`} /></label>
                <label className="f">Amount (₦)<input type="number" name="amount" id="amount" min="1" required defaultValue={o.invoice?.amount ?? o.received ?? o.total} /></label>
              </div>
              <div><button className="btn sec" type="submit">{o.invoice ? "Update invoice" : "Send invoice"}</button></div>
            </form>
          ) : null}
          {o.status === "RECEIVED" ? <div className="card"><h2 style={{ marginBottom: 8 }}>Payments</h2><PaymentSummary o={o} /></div> : null}
        </div>
        <aside className="card"><h2 style={{ marginBottom: 12 }}>History</h2><OrderEvents o={o} /></aside>
      </div>
    </>
  );
}
