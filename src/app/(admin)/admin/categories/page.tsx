import { addCategory } from "@/app/actions/supplier";
import { Flash } from "@/components/Flash";
import { PageHead } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

export const metadata = { title: "Categories" };

export default async function Categories({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  await requireAdmin();
  const cats = await db.category.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { suppliers: true, requests: true } } } });
  return (
    <>
      <PageHead title="Categories" eyebrow="Requests are routed to suppliers by category" />
      <Flash sp={sp} />
      <div className="grid2">
        <div className="card table-wrap" style={{ padding: 0 }}>
          <table className="list">
            <thead><tr><th>Category</th><th>Units</th><th className="r">Suppliers</th><th className="r">Requests</th></tr></thead>
            <tbody>{cats.map((c) => <tr key={c.id}><td className="t">{c.name}</td><td className="k">{c.units.split(",").join(", ")}</td><td className="r">{c._count.suppliers}</td><td className="r">{c._count.requests}</td></tr>)}</tbody>
          </table>
        </div>
        <form action={addCategory} className="card stack">
          <h2>Add a category</h2>
          <label className="f">Name<input type="text" name="name" id="name" required /></label>
          <label className="f">Units <span className="hint">comma-separated, e.g. kg,crate,bag</span><input type="text" name="units" id="units" /></label>
          <div><button className="btn" type="submit">Add</button></div>
        </form>
      </div>
    </>
  );
}
