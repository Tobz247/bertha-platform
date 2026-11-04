import Link from "next/link";
import { notFound } from "next/navigation";
import { awardQuote, cancelRequest } from "@/app/actions/buyer";
import { Flash } from "@/components/Flash";
import { PageHead, Pill } from "@/components/ui";
import { requireBuyer } from "@/lib/auth";
import { db } from "@/lib/db";
import { day, naira, poNo, qty, rfqNo } from "@/lib/format";
import { supplierRatings } from "@/lib/orders";
import { lastPaidPrices, marketPrices } from "@/lib/prices";
import { needsApproval, orderTotal, priceFlag, priceKey, quoteBadges } from "@/lib/rules";

export const metadata = { title: "Request" };

export default async function RequestPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string>>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const { business } = await requireBuyer();
  const req = await db.request.findFirst({
    where: { id, buyerId: business.id },
    include: {
      category: true,
      lines: { orderBy: { position: "asc" } },
      invites: { include: { supplier: true } },
      quotes: { include: { supplier: true, lines: true }, orderBy: { createdAt: "asc" } },
      orders: true,
      createdBy: true,
    },
  });
  if (!req) notFound();

  const live = req.quotes.filter((q) => q.status !== "WITHDRAWN");
  const [ratings, lastPaid, market] = await Promise.all([
    supplierRatings(live.map((q) => q.supplierId)),
    lastPaidPrices(business.id),
    marketPrices(),
  ]);
  const flagFor = (l: { product: string; unit: string }, p: number) => {
    const k = priceKey(l.product, l.unit);
    return priceFlag(p, { lastPaid: lastPaid.get(k) ?? null, market: market.get(k)?.median ?? null });
  };
  const rows = live.map((q) => {
    const price = new Map(q.lines.map((l) => [l.requestLineId, l.unitPrice]));
    const quoted = req.lines.filter((l) => price.has(l.id));
    const total = orderTotal(quoted.map((l) => ({ quantity: l.quantity, unitPrice: price.get(l.id)! })), q.deliveryFee);
    const high = quoted.filter((l) => flagFor(l, price.get(l.id)!)).length;
    return { q, price, total, high, missing: req.lines.length - quoted.length, rating: ratings.get(q.supplierId) ?? null };
  });
  const badges = quoteBadges(rows.map((r) => ({ id: r.q.id, total: r.total, deliveryDate: r.q.deliveryDate, rating: r.rating?.avg ?? null })));
  const cheapest = rows.length ? rows.reduce((a, b) => (b.total < a.total && b.missing === 0 ? b : a)) : null;
  const open = req.status === "OPEN";

  return (
    <>
      <PageHead
        title={req.title}
        eyebrow={<><span className="mono">{rfqNo(req.number)}</span> · {req.category.name} · raised by {req.createdBy.name}</>}
        backHref="/requests"
        backLabel="Requests"
        action={open ? <form action={cancelRequest}><input type="hidden" name="requestId" value={req.id} /><button className="btn sec small" type="submit">Cancel request</button></form> : null}
      />
      <Flash sp={sp} />

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row" style={{ marginBottom: 8 }}>
          <span className="k">Needed {day(req.neededBy)} · quotes close {day(req.quoteDeadline)} · deliver to {req.deliveryAddress}</span>
          {req.status === "AWARDED" ? <Pill tone="blue">Awarded</Pill> : req.status === "CANCELLED" ? <Pill tone="grey">Cancelled</Pill> : null}
        </div>
        <div className="table-wrap">
          <table className="list">
            <thead><tr><th>Item</th><th className="r">Quantity</th></tr></thead>
            <tbody>{req.lines.map((l) => <tr key={l.id}><td>{l.product}</td><td className="r">{qty(l.quantity)} {l.unit}</td></tr>)}</tbody>
          </table>
        </div>
        {req.notes ? <p className="k" style={{ marginBottom: 0 }}>Notes: {req.notes}</p> : null}
        <p className="k" style={{ marginBottom: 0 }}>
          Sent to {req.audience === "SHORTLIST" ? req.invites.map((i) => i.supplier.name).join(", ") : `all verified ${req.category.name.toLowerCase()} suppliers`}.
        </p>
      </div>

      {req.orders.length ? (
        <div className="alert info" style={{ marginBottom: 16 }}>
          Order {req.orders.map((o) => <Link key={o.id} href={`/orders/${o.id}`}>{poNo(o.number)}</Link>)} was raised from this request.
        </div>
      ) : null}

      <h2 style={{ marginBottom: 12 }}>{rows.length ? `${rows.length} quote${rows.length > 1 ? "s" : ""}` : "No quotes yet"}</h2>
      {rows.length === 0 ? <div className="empty">Suppliers have been told. Quotes show here as they arrive.</div> : null}

      {rows.length ? (
        <form action={awardQuote} className="stack" style={{ maxWidth: "none" }}>
          <input type="hidden" name="requestId" value={req.id} />
          <div className="quotes">
            {rows.map(({ q, price, total, high, missing, rating }) => (
              <label key={q.id} className="quote">
                <div className="row" style={{ alignItems: "flex-start" }}>
                  <div>
                    <div className="t">{q.supplier.name}</div>
                    <div className="k">{rating ? <span className="stars">★ {rating.avg.toFixed(1)}</span> : "No ratings yet"}{rating ? ` · ${rating.count} rated order${rating.count > 1 ? "s" : ""}` : ""} · {q.supplier.area}</div>
                  </div>
                  {open && q.status === "SUBMITTED" ? <input type="radio" name="quoteId" value={q.id} defaultChecked={q.id === cheapest?.q.id} aria-label={`Choose ${q.supplier.name}`} style={{ width: 20, height: 20, accentColor: "var(--brand)" }} /> : null}
                </div>
                <div className="big">{naira(total)}</div>
                <div className="badges">
                  {(badges[q.id] ?? []).map((b) => <Pill key={b} tone={b === "Lowest total" ? "green" : b === "Top rated" ? "amber" : "blue"}>{b}</Pill>)}
                  {missing ? <Pill tone="red">Missing {missing} item{missing > 1 ? "s" : ""}</Pill> : null}
                  {high ? <Pill tone="red">{high} price{high > 1 ? "s look" : " looks"} high</Pill> : null}
                  {needsApproval(total, business.approvalLimit) ? <Pill tone="grey">Needs approval</Pill> : null}
                  {q.status === "AWARDED" ? <Pill tone="blue">Awarded</Pill> : null}
                </div>
                <table className="list">
                  <tbody>
                    {req.lines.map((l) => (
                      <tr key={l.id}>
                        <td>{l.product} <span className="k">× {qty(l.quantity)} {l.unit}</span></td>
                        <td className="r">
                          {price.has(l.id) ? <>{naira(price.get(l.id)!)}<span className="k">/{l.unit}</span></> : <span className="k">not quoted</span>}
                          {(() => {
                            const f = price.has(l.id) ? flagFor(l, price.get(l.id)!) : null;
                            return f ? <div className="k" style={{ color: "var(--red)" }}>+{f.pct}% on {f.against === "last" ? "your last" : "going rate"} {naira(f.ref)}</div> : null;
                          })()}
                        </td>
                      </tr>
                    ))}
                    <tr><td>Delivery</td><td className="r">{q.deliveryFee ? naira(q.deliveryFee) : "Free"}</td></tr>
                  </tbody>
                </table>
                <div className="k">Delivers {day(q.deliveryDate)} · valid to {day(q.validUntil)}{q.notes ? ` · ${q.notes}` : ""}</div>
              </label>
            ))}
          </div>
          {open ? (
            <div className="card stack" style={{ maxWidth: 640 }}>
              <label className="f">Payment terms
                <select name="paymentTermsDays" id="paymentTermsDays" defaultValue="7">
                  <option value="0">Pay on delivery (cash or transfer)</option>
                  <option value="7">7 days after delivery</option>
                  <option value="14">14 days after delivery</option>
                  <option value="30">30 days after delivery</option>
                </select>
              </label>
              {business.approvalLimit != null ? (
                <p className="k" style={{ margin: 0 }}>Orders over {naira(business.approvalLimit)} go to a manager for approval before the supplier sees them.</p>
              ) : null}
              <div><button className="btn" type="submit">Award the chosen quote</button></div>
            </div>
          ) : null}
        </form>
      ) : null}
    </>
  );
}
