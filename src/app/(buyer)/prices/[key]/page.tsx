import Link from "next/link";
import { notFound } from "next/navigation";
import { PriceChange } from "@/components/PriceChange";
import { PageHead } from "@/components/ui";
import { requireBuyer } from "@/lib/auth";
import { db } from "@/lib/db";
import { day, naira, poNo, qty } from "@/lib/format";
import { buyerPriceHistory, MARKET_DAYS, marketPrices } from "@/lib/prices";
import { pctDiff, priceKey } from "@/lib/rules";

export const metadata = { title: "Price history" };

export default async function PriceHistory({ params }: { params: Promise<{ key: string }> }) {
  const key = decodeURIComponent((await params).key);
  const { business } = await requireBuyer();
  const [history, market, offers] = await Promise.all([
    buyerPriceHistory(business.id),
    marketPrices(),
    db.catalogItem.findMany({
      where: { available: true, supplier: { verification: "VERIFIED" } },
      include: { supplier: true },
    }),
  ]);
  const g = history.get(key);
  if (!g) notFound();
  const m = market.get(key);
  const listed = offers.filter((o) => priceKey(o.name, o.unit) === key).sort((a, b) => a.price - b.price);

  return (
    <>
      <PageHead title={g.product} eyebrow={`Price per ${g.unit}`} backHref="/prices" backLabel="Prices" />
      <div className="tiles" style={{ marginBottom: 16 }}>
        <div className="tile"><div className="k">Last paid</div><div className="n">{naira(g.points[0].price)}</div><div className="k">{day(g.points[0].at)}</div></div>
        <div className="tile"><div className="k">Your lowest</div><div className="n">{naira(Math.min(...g.points.map((p) => p.price)))}</div><div className="k">over {g.points.length} order{g.points.length > 1 ? "s" : ""}</div></div>
        <div className="tile"><div className="k">Going rate, last {MARKET_DAYS} days</div><div className="n">{m ? naira(m.median) : "—"}</div><div className="k">{m ? `${naira(m.low)} to ${naira(m.high)} · ${m.buyers} businesses` : "not enough data yet"}</div></div>
      </div>

      <div className="grid2">
        <div className="card">
          <h2 style={{ marginBottom: 8 }}>What you paid</h2>
          <table className="list">
            <thead><tr><th>Date</th><th>Supplier</th><th className="r">Qty</th><th className="r">Price</th><th /></tr></thead>
            <tbody>
              {g.points.map((p, i) => {
                const prev = g.points[i + 1];
                return (
                  <tr key={p.orderId + i}>
                    <td>{day(p.at)}<div className="k"><Link className="mono" href={`/orders/${p.orderId}`}>{poNo(p.orderNumber)}</Link></div></td>
                    <td>{p.supplier}</td>
                    <td className="r">{qty(p.quantity)}</td>
                    <td className="r t">{naira(p.price)}</td>
                    <td>{prev ? <PriceChange pct={pctDiff(p.price, prev.price)} /> : null}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="card">
          <h2 style={{ marginBottom: 8 }}>On suppliers' price lists now</h2>
          {listed.length === 0 ? <p className="k">No verified supplier lists this item yet. <Link href="/requests/new">Ask for quotes</Link> instead.</p> : (
            <table className="list">
              <tbody>
                {listed.map((o) => (
                  <tr key={o.id}>
                    <td><Link className="t" href={`/suppliers/${o.supplierId}`}>{o.supplier.name}</Link><div className="k">{o.supplier.area} · updated {day(o.updatedAt)}</div></td>
                    <td className="r t">{naira(o.price)}<div className="k">/{o.unit}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
