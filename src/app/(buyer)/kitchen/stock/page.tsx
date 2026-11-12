import Link from "next/link";
import { Empty, PageHead, Pill } from "@/components/ui";
import { requireBuyer } from "@/lib/auth";
import { db } from "@/lib/db";
import { day, naira, qty } from "@/lib/format";
import { expiringBatches, round3 } from "@/lib/rules";

export const metadata = { title: "Kitchen stock" };

/** What has been issued to the kitchen and not yet used, sold in dishes or wasted. */
export default async function KitchenStock() {
  const { business } = await requireBuyer();
  const items = await db.stockItem.findMany({
    where: { buyerId: business.id, batches: { some: { area: "KITCHEN", quantity: { gt: 0 } } } },
    include: { batches: { where: { area: "KITCHEN", quantity: { gt: 0 } }, orderBy: [{ expiresAt: "asc" }, { receivedAt: "asc" }] } },
    orderBy: { name: "asc" },
  });
  const rows = items.map((i) => ({
    i,
    qty: round3(i.batches.reduce((s, b) => s + b.quantity, 0)),
    nextExpiry: i.batches.find((b) => b.expiresAt)?.expiresAt ?? null,
    expiring: expiringBatches(i.batches, 2).reduce((s, b) => s + b.quantity, 0),
  }));
  const value = rows.reduce((s, r) => s + r.qty * (r.i.lastUnitPrice ?? 0), 0);
  return (
    <>
      <PageHead title="Kitchen stock" eyebrow={`Issued from the store and not yet used · worth about ${naira(value)}`} backHref="/kitchen" backLabel="Kitchen requests" />
      <p className="k" style={{ marginTop: 0 }}>Dishes sold and kitchen use come out of this first. Count it at the end of a shift on each item&apos;s page (choose “Kitchen”), so anything missing shows up.</p>
      {rows.length === 0 ? <Empty>Nothing in the kitchen. Goods appear here when the store issues them against a kitchen request.</Empty> : (
        <div className="card table-wrap" style={{ padding: 0 }}>
          <table className="list">
            <thead><tr><th>Item</th><th className="r">In kitchen</th><th>Use by</th><th className="r">Value</th></tr></thead>
            <tbody>
              {rows.map(({ i, qty: q, nextExpiry, expiring }) => (
                <tr key={i.id}>
                  <td><Link className="t" href={`/stock/${i.id}`}>{i.name}</Link></td>
                  <td className="r t">{qty(q)} {i.unit}</td>
                  <td>{nextExpiry ? <>{day(nextExpiry)} {expiring ? <Pill tone="amber">use soon</Pill> : null}</> : <span className="k">—</span>}</td>
                  <td className="r">{i.lastUnitPrice ? naira(q * i.lastUnitPrice) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
