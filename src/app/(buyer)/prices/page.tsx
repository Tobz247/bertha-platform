import Link from "next/link";
import { PriceChange } from "@/components/PriceChange";
import { Empty, PageHead } from "@/components/ui";
import { requireBuyer } from "@/lib/auth";
import { db } from "@/lib/db";
import { day, naira } from "@/lib/format";
import { buyerPriceHistory, MARKET_DAYS, marketPrices, PRICED_STATUSES } from "@/lib/prices";
import { addDays, orderTotal, pctDiff, PRICE_ALERT_PCT } from "@/lib/rules";

export const metadata = { title: "Prices" };

export default async function Prices() {
  const { business } = await requireBuyer();
  const [history, market, recent] = await Promise.all([
    buyerPriceHistory(business.id),
    marketPrices(),
    db.purchaseOrder.findMany({
      where: { buyerId: business.id, status: { in: PRICED_STATUSES }, createdAt: { gte: addDays(new Date(), -30) } },
      include: { lines: true, supplier: true },
    }),
  ]);

  const rows = [...history.values()]
    .map((g) => {
      const [last, prev] = g.points;
      const m = market.get(g.key) ?? null;
      return {
        ...g,
        last,
        change: prev ? pctDiff(last.price, prev.price) : null,
        low: Math.min(...g.points.map((p) => p.price)),
        market: m,
        vsMarket: m ? pctDiff(last.price, m.median) : null,
      };
    })
    .sort((a, b) => (b.vsMarket ?? -999) - (a.vsMarket ?? -999) || a.product.localeCompare(b.product));
  const overpaying = rows.filter((r) => r.vsMarket != null && r.vsMarket > PRICE_ALERT_PCT);

  const spend = new Map<string, { name: string; total: number; orders: number }>();
  for (const o of recent) {
    const s = spend.get(o.supplierId) ?? { name: o.supplier.name, total: 0, orders: 0 };
    s.total += orderTotal(o.lines, o.deliveryFee);
    s.orders += 1;
    spend.set(o.supplierId, s);
  }
  const spendRows = [...spend.values()].sort((a, b) => b.total - a.total);
  const spendTotal = spendRows.reduce((s, r) => s + r.total, 0);

  return (
    <>
      <PageHead title="Prices" eyebrow="What you pay, and the going rate on Bertha in Abuja" />

      {overpaying.length ? (
        <div className="alert warn" style={{ marginBottom: 16 }}>
          You're paying more than the going rate for {overpaying.length} item{overpaying.length > 1 ? "s" : ""}:{" "}
          {overpaying.slice(0, 4).map((r, i) => (
            <span key={r.key}>{i ? ", " : ""}<Link href={`/prices/${encodeURIComponent(r.key)}`}>{r.product}</Link> (+{r.vsMarket}%)</span>
          ))}
          {overpaying.length > 4 ? " and more" : ""}. Try asking more suppliers to quote next time.
        </div>
      ) : null}

      {rows.length === 0 ? (
        <Empty>Prices show here once suppliers confirm your first orders. Each order adds to your price history.</Empty>
      ) : (
        <div className="card table-wrap" style={{ padding: 0, marginBottom: 20 }}>
          <table className="list">
            <thead>
              <tr><th>Item</th><th className="r">Last paid</th><th>Since previous</th><th className="r">Your lowest</th><th className="r">Going rate</th><th>You vs rate</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <td><Link className="t" href={`/prices/${encodeURIComponent(r.key)}`}>{r.product}</Link><div className="k">per {r.unit}</div></td>
                  <td className="r"><span className="t">{naira(r.last.price)}</span><div className="k">{day(r.last.at)} · {r.last.supplier}</div></td>
                  <td>{r.change == null ? <span className="k">one purchase so far</span> : Math.abs(r.change) <= 2 ? <span className="k">no change</span> : <PriceChange pct={r.change} />}</td>
                  <td className="r">{naira(r.low)}</td>
                  <td className="r">{r.market ? <>{naira(r.market.median)}<div className="k">{r.market.buyers} businesses</div></> : <span className="k">not enough data</span>}</td>
                  <td>{r.vsMarket == null ? null : Math.abs(r.vsMarket) <= 2 ? <span className="k">about the same</span> : <PriceChange pct={r.vsMarket} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="k">The going rate is the middle price agreed on Bertha in the last {MARKET_DAYS} days. It shows once at least two businesses have bought the item, and never names who paid what.</p>

      <h2 style={{ margin: "24px 0 12px" }}>Spend in the last 30 days</h2>
      {spendRows.length === 0 ? <Empty>No confirmed orders in the last 30 days.</Empty> : (
        <div className="card table-wrap" style={{ padding: 0 }}>
          <table className="list">
            <thead><tr><th>Supplier</th><th className="r">Orders</th><th className="r">Spend</th><th className="r">Share</th></tr></thead>
            <tbody>
              {spendRows.map((s) => (
                <tr key={s.name}><td className="t">{s.name}</td><td className="r">{s.orders}</td><td className="r">{naira(s.total)}</td><td className="r">{Math.round((s.total / spendTotal) * 100)}%</td></tr>
              ))}
              <tr><td className="t">Total</td><td className="r">{recent.length}</td><td className="r t">{naira(spendTotal)}</td><td /></tr>
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
