import Link from "next/link";
import { ConsistencyPill } from "@/components/PriceConsistency";
import { Empty, PageHead, Pill } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { supplierConsistency } from "@/lib/consistency";
import { db } from "@/lib/db";
import { day, naira } from "@/lib/format";
import { addDays, pctDiff } from "@/lib/rules";
import { CONSISTENCY_DAYS, changeTone } from "@/lib/supplier-rules";

export const metadata = { title: "Price watch" };

export default async function PriceWatch() {
  await requireAdmin();
  const suppliers = await db.business.findMany({
    where: { type: "SUPPLIER", verification: { not: "REJECTED" } },
    select: { id: true, name: true, area: true, rateCards: { select: { createdAt: true }, orderBy: { createdAt: "desc" }, take: 1 } },
    orderBy: { name: "asc" },
  });
  const [reports, recent] = await Promise.all([
    supplierConsistency(suppliers.map((s) => s.id)),
    db.catalogPriceChange.findMany({
      where: { at: { gte: addDays(new Date(), -14) }, oldPrice: { not: null } },
      include: { supplier: { select: { id: true, name: true } } },
      orderBy: { at: "desc" },
      take: 60,
    }),
  ]);
  const rows = suppliers
    .map((s) => ({ s, r: reports.get(s.id) }))
    .sort((a, b) => (a.r?.score?.score ?? 101) - (b.r?.score?.score ?? 101) || a.s.name.localeCompare(b.s.name));
  const changes = recent.filter((c) => c.oldPrice !== c.newPrice);

  return (
    <>
      <PageHead title="Price watch" eyebrow={`How steady each supplier's prices have been over the last ${CONSISTENCY_DAYS} days. Least consistent first.`} />
      {rows.length === 0 ? <Empty>No suppliers yet.</Empty> : (
        <div className="card table-wrap" style={{ padding: 0, marginBottom: 20 }}>
          <table className="list">
            <thead><tr><th>Supplier</th><th>Consistency</th><th className="r">Changes (2 wks)</th><th className="r">Price differences</th><th>Latest rate card</th></tr></thead>
            <tbody>
              {rows.map(({ s, r }) => {
                const unsteady = r?.items.filter((i) => i.spread.level === "unsteady").map((i) => i.name) ?? [];
                return (
                  <tr key={s.id}>
                    <td><Link className="t" href={`/admin/suppliers/${s.id}`}>{s.name}</Link><div className="k">{s.area}{unsteady.length ? ` · unsteady: ${unsteady.slice(0, 3).join(", ")}${unsteady.length > 3 ? "…" : ""}` : ""}</div></td>
                    <td><ConsistencyPill report={r} /></td>
                    <td className="r">{r?.recentChanges ?? 0}</td>
                    <td className="r">{r?.differences.length ? <Pill tone="red">{r.differences.length}</Pill> : <span className="k">0</span>}</td>
                    <td className="k">{s.rateCards[0] ? day(s.rateCards[0].createdAt) : "none"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <h2 style={{ marginBottom: 8 }}>Price changes in the last 2 weeks</h2>
      {changes.length === 0 ? <Empty>No supplier has changed a price in the last 2 weeks.</Empty> : (
        <div className="card table-wrap" style={{ padding: 0 }}>
          <table className="list">
            <thead><tr><th>Item</th><th>Supplier</th><th className="r">Was</th><th className="r">Now</th><th>Change</th></tr></thead>
            <tbody>
              {changes.map((c) => {
                const pct = pctDiff(c.newPrice, c.oldPrice!);
                return (
                  <tr key={c.id}>
                    <td><span className="t">{c.name}</span><div className="k">per {c.unit} · {day(c.at)}{c.source === "RATE_CARD" ? " · from rate card" : c.source === "ADMIN" ? " · by Bertha" : ""}</div></td>
                    <td><Link href={`/admin/suppliers/${c.supplier.id}`}>{c.supplier.name}</Link></td>
                    <td className="r">{naira(c.oldPrice!)}</td>
                    <td className="r">{naira(c.newPrice)}</td>
                    <td><Pill tone={changeTone(pct)}>{pct > 0 ? "▲" : pct < 0 ? "▼" : ""} {Math.abs(pct)}%</Pill></td>
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
