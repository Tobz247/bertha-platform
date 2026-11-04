import { notFound } from "next/navigation";
import { submitQuote, withdrawQuote } from "@/app/actions/supplier";
import { Flash } from "@/components/Flash";
import { PageHead, Pill } from "@/components/ui";
import { requireSupplier } from "@/lib/auth";
import { db } from "@/lib/db";
import { dateInput, day, naira, qty, rfqNo } from "@/lib/format";
import { visibleToSupplier } from "@/lib/requests";
import { addDays } from "@/lib/rules";

export const metadata = { title: "Quote" };

export default async function SupplierRequest({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const { business } = await requireSupplier();
  const categoryIds = (await db.category.findMany({ where: { suppliers: { some: { id: business.id } } }, select: { id: true } })).map((c) => c.id);
  const req = await db.request.findFirst({
    where: { id, ...visibleToSupplier(business.id, categoryIds) },
    include: { buyer: true, category: true, lines: { orderBy: { position: "asc" } }, quotes: { where: { supplierId: business.id }, include: { lines: true } } },
  });
  if (!req) notFound();
  const mine = req.quotes[0];
  const price = new Map(mine?.lines.map((l) => [l.requestLineId, l.unitPrice]) ?? []);
  const editable = req.status === "OPEN" && (!mine || mine.status === "SUBMITTED" || mine.status === "WITHDRAWN") && business.verification === "VERIFIED";
  const statusPill =
    mine?.status === "AWARDED" ? <Pill tone="green">You won this</Pill> :
    mine?.status === "NOT_SELECTED" ? <Pill tone="grey">Another quote was chosen</Pill> :
    mine?.status === "SUBMITTED" ? <Pill tone="green">Quote sent</Pill> :
    req.status !== "OPEN" ? <Pill tone="grey">Closed</Pill> : null;

  return (
    <>
      <PageHead title={req.buyer.name} eyebrow={<><span className="mono">{rfqNo(req.number)}</span> · {req.title} · {req.category.name}</>} backHref="/supplier" backLabel="Requests" action={statusPill} />
      <Flash sp={sp} />
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="k">Needed {day(req.neededBy)} · deliver to {req.deliveryAddress} · quotes close {day(req.quoteDeadline)}</div>
        {req.notes ? <p style={{ marginBottom: 0 }}>{req.notes}</p> : null}
      </div>
      <form action={submitQuote} className="stack">
        <input type="hidden" name="requestId" value={req.id} />
        <fieldset disabled={!editable}>
          <legend>Your prices</legend>
          <div className="stack">
            {req.lines.map((l) => (
              <label key={l.id} className="f">{l.product} · {qty(l.quantity)} {l.unit}{l.notes ? <span className="hint">{l.notes}</span> : null}
                <input type="number" name={`price_${l.id}`} id={`price_${l.id}`} min="0" placeholder={`Naira per ${l.unit}, or leave blank`} defaultValue={price.get(l.id) ?? ""} />
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset disabled={!editable}>
          <legend>Delivery</legend>
          <div className="fields">
            <label className="f">Delivery fee (₦)<input type="number" name="deliveryFee" id="deliveryFee" min="0" defaultValue={mine?.deliveryFee ?? 0} /></label>
            <label className="f">Can deliver on<input type="date" name="deliveryDate" id="deliveryDate" required defaultValue={dateInput(mine?.deliveryDate ?? req.neededBy)} /></label>
            <label className="f">Quote valid until<input type="date" name="validUntil" id="validUntil" required defaultValue={dateInput(mine?.validUntil ?? addDays(new Date(), 3))} /></label>
          </div>
          <label className="f" style={{ marginTop: 10 }}>Note to the buyer <span className="hint">optional</span><input type="text" name="notes" id="notes" defaultValue={mine?.notes ?? ""} /></label>
        </fieldset>
        {mine && mine.status === "SUBMITTED" ? (
          <p className="k" style={{ margin: 0 }}>
            Your quote total: {naira(req.lines.reduce((s, l) => s + Math.round((price.get(l.id) ?? 0) * l.quantity), 0) + mine.deliveryFee)}. You can change it until the buyer decides.
          </p>
        ) : null}
        {editable ? <div className="btns"><button className="btn" type="submit">{mine?.status === "SUBMITTED" ? "Update quote" : "Send quote"}</button></div> : null}
      </form>
      {mine?.status === "SUBMITTED" && req.status === "OPEN" ? (
        <form action={withdrawQuote} style={{ marginTop: 10 }}>
          <input type="hidden" name="requestId" value={req.id} />
          <button className="btn sec small" type="submit">Withdraw quote</button>
        </form>
      ) : null}
    </>
  );
}
