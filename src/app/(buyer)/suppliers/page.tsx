import Link from "next/link";
import { Empty, PageHead, Pill } from "@/components/ui";
import { requireBuyer } from "@/lib/auth";
import { db } from "@/lib/db";
import { naira } from "@/lib/format";
import { supplierRatings } from "@/lib/orders";

export const metadata = { title: "Suppliers" };

export default async function Suppliers({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  await requireBuyer();
  const categories = await db.category.findMany({ orderBy: { name: "asc" } });
  const cat = categories.find((c) => c.id === sp.category)?.id;
  const suppliers = await db.business.findMany({
    where: { type: "SUPPLIER", verification: "VERIFIED", ...(cat ? { categories: { some: { id: cat } } } : {}) },
    include: { categories: true, _count: { select: { catalogue: { where: { available: true } } } } },
    orderBy: { name: "asc" },
  });
  const ratings = await supplierRatings(suppliers.map((s) => s.id));
  const sorted = [...suppliers].sort((a, b) => b._count.catalogue - a._count.catalogue || (ratings.get(b.id)?.avg ?? 0) - (ratings.get(a.id)?.avg ?? 0));

  return (
    <>
      <PageHead title="Suppliers" eyebrow="Verified suppliers in Abuja. Order from a price list, or ask several for quotes." action={<Link className="btn sec" href="/requests/new">Ask for quotes</Link>} />
      <div className="btns" style={{ marginBottom: 14 }}>
        <Link className={`btn small ${cat ? "sec" : ""}`} href="/suppliers">All</Link>
        {categories.map((c) => <Link key={c.id} className={`btn small ${cat === c.id ? "" : "sec"}`} href={`/suppliers?category=${c.id}`}>{c.name}</Link>)}
      </div>
      {sorted.length === 0 ? <Empty>No verified suppliers here yet.</Empty> : (
        <div className="card table-wrap" style={{ padding: 0 }}>
          <table className="list">
            <thead><tr><th>Supplier</th><th>Rating</th><th className="r">Price list</th><th className="r">Delivery</th></tr></thead>
            <tbody>
              {sorted.map((s) => {
                const r = ratings.get(s.id);
                return (
                  <tr key={s.id}>
                    <td><Link className="t" href={`/suppliers/${s.id}`}>{s.name}</Link><div className="k">{s.area} · {s.categories.map((c) => c.name).join(", ")}</div></td>
                    <td>{r ? <span className="stars">★ {r.avg.toFixed(1)} <span className="k">({r.count})</span></span> : <span className="k">no ratings yet</span>}</td>
                    <td className="r">{s._count.catalogue ? <Pill tone="green">{s._count.catalogue} items</Pill> : <span className="k">quotes only</span>}</td>
                    <td className="r">{s._count.catalogue ? (s.deliveryFee ? naira(s.deliveryFee) : "Free") : <span className="k">—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
