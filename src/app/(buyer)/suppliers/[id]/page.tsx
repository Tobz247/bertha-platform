import Link from "next/link";
import { notFound } from "next/navigation";
import { placePriceListOrder } from "@/app/actions/buyer";
import { Flash } from "@/components/Flash";
import { ChangeTag, ConsistencyPanel, ConsistencyPill } from "@/components/PriceConsistency";
import { RateCardList } from "@/components/RateCards";
import { SupplierCriteriaSummary } from "@/components/SupplierCriteria";
import { Empty, PageHead } from "@/components/ui";
import { can, requireBuyer } from "@/lib/auth";
import { supplierConsistency } from "@/lib/consistency";
import { db } from "@/lib/db";
import { dateInput, day, naira, qty } from "@/lib/format";
import { supplierRatings } from "@/lib/orders";
import { lastPaidPrices, marketPrices } from "@/lib/prices";
import { addDays, priceFlag, priceKey } from "@/lib/rules";

export const metadata = { title: "Supplier" };

export default async function SupplierPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const { user, business } = await requireBuyer();
  const s = await db.business.findFirst({
    where: { id, type: "SUPPLIER", verification: "VERIFIED" },
    include: { categories: true, catalogue: { where: { available: true }, include: { category: true }, orderBy: [{ category: { name: "asc" } }, { name: "asc" }] } },
  });
  if (!s) notFound();
  const [ratings, lastPaid, market, pastOrders, consistency, rateCards] = await Promise.all([
    supplierRatings([s.id]),
    lastPaidPrices(business.id),
    marketPrices(),
    db.purchaseOrder.count({ where: { buyerId: business.id, supplierId: s.id, status: "RECEIVED" } }),
    supplierConsistency([s.id]),
    db.rateCard.findMany({ where: { supplierId: s.id }, omit: { data: true }, orderBy: { createdAt: "desc" }, take: 5 }),
  ]);
  const report = consistency.get(s.id);
  const byKey = new Map(report?.items.map((i) => [i.key, i]));
  const mine = report?.differences.filter((d) => d.buyerId === business.id) ?? [];
  const others = (report?.differences.length ?? 0) - mine.length;
  const r = ratings.get(s.id);

  return (
    <>
      <PageHead
        title={s.name}
        eyebrow={<>{s.area} · {s.categories.map((c) => c.name).join(", ")}{r ? <> · <span className="stars">★ {r.avg.toFixed(1)}</span> from {r.count} order{r.count > 1 ? "s" : ""}</> : " · no ratings yet"}</>}
        backHref="/suppliers"
        backLabel="Suppliers"
        action={<ConsistencyPill report={report} />}
      />
      <Flash sp={sp} />
      <p className="k">
        {pastOrders ? `You've had ${pastOrders} deliver${pastOrders > 1 ? "ies" : "y"} from ${s.name}. ` : ""}
        Delivery {s.deliveryFee ? naira(s.deliveryFee) : "free"} per order{s.minOrderValue ? ` · smallest order ${naira(s.minOrderValue)}` : ""} · {s.phone}
      </p>
      <div style={{ marginBottom: 16 }}><SupplierCriteriaSummary s={s} /></div>

      {s.catalogue.length === 0 ? (
        <Empty>{s.name} hasn't put up a price list yet. <Link href="/requests/new">Ask for a quote</Link> instead.</Empty>
      ) : (
        <form action={placePriceListOrder} className="stack" style={{ maxWidth: "none" }}>
          <input type="hidden" name="supplierId" value={s.id} />
          <div className="card table-wrap" style={{ padding: 0 }}>
            <table className="list">
              <thead><tr><th>Item</th><th className="r">Price</th><th>Compared</th><th className="r">Quantity</th></tr></thead>
              <tbody>
                {s.catalogue.map((c) => {
                  const k = priceKey(c.name, c.unit);
                  const last = lastPaid.get(k) ?? null;
                  const m = market.get(k)?.median ?? null;
                  const f = priceFlag(c.price, { lastPaid: last, market: m });
                  return (
                    <tr key={c.id}>
                      <td><span className="t">{c.name}</span><div className="k">{c.category?.name ?? "Other"}{c.minQty ? ` · min ${qty(c.minQty)} ${c.unit}` : ""} · price from {day(c.updatedAt)}</div></td>
                      <td className="r t">{naira(c.price)}<span className="k">/{c.unit}</span><div><ChangeTag item={byKey.get(k)} quiet /></div></td>
                      <td className="k">
                        {f ? <span style={{ color: "var(--red)" }}>+{f.pct}% on {f.against === "last" ? "your last" : "going rate"} {naira(f.ref)}</span>
                          : last != null ? `you last paid ${naira(last)}` : m != null ? `going rate ${naira(m)}` : ""}
                      </td>
                      <td className="r"><input type="number" name={`q_${c.id}`} min="0" step="any" placeholder="0" aria-label={`Quantity of ${c.name} in ${c.unit}`} style={{ width: 90, textAlign: "right" }} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="card stack" style={{ maxWidth: 640 }}>
            <div className="fields">
              <label className="f">Deliver on<input type="date" name="deliveryDate" id="deliveryDate" required defaultValue={dateInput(addDays(new Date(), 1))} min={dateInput(new Date())} /></label>
              <label className="f">Payment terms
                <select name="paymentTermsDays" id="paymentTermsDays" defaultValue="7">
                  <option value="0">Pay on delivery (cash or transfer)</option>
                  <option value="7">7 days after delivery</option>
                  <option value="14">14 days after delivery</option>
                  <option value="30">30 days after delivery</option>
                </select>
              </label>
            </div>
            <label className="f">Deliver to<input type="text" name="deliveryAddress" id="deliveryAddress" defaultValue={business.address} /></label>
            <label className="f">Note for the supplier <span className="hint">optional</span><input type="text" name="note" id="note" placeholder="e.g. deliver before 9am, use back gate" /></label>
            {business.approvalLimit != null ? <p className="k" style={{ margin: 0 }}>Orders over {naira(business.approvalLimit)} go to a manager for approval first.</p> : null}
            {can(user, "order") ? <div><button className="btn" type="submit">Place order</button></div> : <p className="k" style={{ margin: 0 }}>Your role can see prices but not place orders. Ask procurement or a manager.</p>}
          </div>
        </form>
      )}

      <div className="stack" style={{ marginTop: 20 }}>
        <div className="card stack" style={{ minWidth: 0 }}>
          <h2>Price consistency</h2>
          <p className="k" style={{ margin: 0 }}>How steady {s.name}&apos;s prices have been, and any price you were charged or quoted that differs from their own list.</p>
          <ConsistencyPanel report={report} differences={mine} otherDifferences={others} linkRefs />
        </div>
        <div className="card stack">
          <h2>Rate cards</h2>
          <RateCardList cards={rateCards} />
        </div>
      </div>
    </>
  );
}
