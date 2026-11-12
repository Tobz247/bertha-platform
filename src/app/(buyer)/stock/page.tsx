import Link from "next/link";
import { Empty, PageHead, Pill } from "@/components/ui";
import { can, requireBuyer } from "@/lib/auth";
import { day, LOCATION_LABEL, naira, qty } from "@/lib/format";
import { stockOverview } from "@/lib/stock";

export const metadata = { title: "Stock" };

export default async function Stock({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { user, business } = await requireBuyer();
  const all = await stockOverview(business.id);
  const filter = sp.filter === "low" || sp.filter === "expiring" ? sp.filter : "all";
  const items = filter === "low" ? all.filter((i) => i.low) : filter === "expiring" ? all.filter((i) => i.expiringQty > 0) : all;
  const value = all.reduce((s, i) => s + i.onHand * (i.lastUnitPrice ?? 0), 0);
  const lowCount = all.filter((i) => i.low).length;

  return (
    <>
      <PageHead title="Stock" eyebrow={`${all.length} items · worth about ${naira(value)} at last purchase price`} action={can(user, "stock") ? <Link className="btn sec" href="/stock/new">Add item</Link> : null} />
      <div className="btns" style={{ marginBottom: 14 }}>
        <Link className={`btn small ${filter === "all" ? "" : "sec"}`} href="/stock">All {all.length}</Link>
        <Link className={`btn small ${filter === "low" ? "" : "sec"}`} href="/stock?filter=low">Low {lowCount}</Link>
        <Link className={`btn small ${filter === "expiring" ? "" : "sec"}`} href="/stock?filter=expiring">Expiring {all.filter((i) => i.expiringQty > 0).length}</Link>
      </div>
      {all.length === 0 ? <Empty>No stock yet. Items are added when you record a delivery, or you can <Link href="/stock/new">add one by hand</Link>.</Empty> : null}
      {all.length > 0 && items.length === 0 ? <Empty>Nothing here.</Empty> : null}
      {items.length ? (
        <form action="/requests/new" method="get">
          <div className="card table-wrap" style={{ padding: 0 }}>
            <table className="list">
              <thead><tr><th aria-label="Reorder" /><th>Item</th><th>Where</th><th className="r">On hand</th><th>Level</th><th>Next expiry</th></tr></thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.id}>
                    <td>{i.low ? <input type="checkbox" name="items" value={i.id} id={`pick-${i.id}`} aria-label={`Reorder ${i.name}`} style={{ width: 18, height: 18, accentColor: "var(--brand)" }} /> : null}</td>
                    <td><Link href={`/stock/${i.id}`} className="t">{i.name}</Link><div className="k">{i.unit}</div></td>
                    <td className="k">{LOCATION_LABEL[i.location]}</td>
                    <td className="r t">{qty(i.onHand)}</td>
                    <td style={{ minWidth: 120 }}>
                      <div className="bar"><i className={i.low ? "low" : ""} style={{ width: `${Math.min(100, (i.onHand / Math.max(i.reorderLevel * 2, i.reorderQty, 1)) * 100)}%` }} /></div>
                      <div className="k">{i.reorderLevel ? `reorder at ${qty(i.reorderLevel)}` : "no reorder level"} {i.low ? <Pill tone="red">Low</Pill> : null}</div>
                    </td>
                    <td>{i.nextExpiry ? <>{day(i.nextExpiry)} {i.expiringQty ? <Pill tone="amber">{qty(i.expiringQty)} expiring</Pill> : null}</> : <span className="k">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {items.some((i) => i.low) ? (
            <div className="row" style={{ marginTop: 12 }}>
              <span className="k">Tick low items to turn them into one request, filled in with your usual quantities.</span>
              <button className="btn" type="submit">Reorder ticked items</button>
            </div>
          ) : null}
        </form>
      ) : null}
    </>
  );
}
