import { randomBytes } from "node:crypto";
import { notFound } from "next/navigation";
import { adminAddPriceItems, adminDeleteRateCard, adminResetPassword, adminUpdateCriteria, adminUpdatePriceItem, adminUploadRateCard } from "@/app/actions/admin";
import { Flash } from "@/components/Flash";
import { ChangeTag, ConsistencyPanel } from "@/components/PriceConsistency";
import { RateCardList, RateCardUpload } from "@/components/RateCards";
import { SupplierCriteriaFields, SupplierCriteriaSummary } from "@/components/SupplierCriteria";
import { Empty, PageHead, Pill } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { supplierConsistency } from "@/lib/consistency";
import { day, naira } from "@/lib/format";
import { priceKey } from "@/lib/rules";

export const metadata = { title: "Supplier" };

export default async function AdminSupplier({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  await requireAdmin();
  const s = await db.business.findFirst({
    where: { id, type: "SUPPLIER" },
    include: { categories: true, users: { orderBy: { createdAt: "asc" } }, catalogue: { orderBy: { name: "asc" } }, _count: { select: { supplierOrders: true } } },
  });
  if (!s) notFound();
  const [consistency, rateCards] = await Promise.all([
    supplierConsistency([s.id]),
    db.rateCard.findMany({ where: { supplierId: s.id }, omit: { data: true }, orderBy: { createdAt: "desc" } }),
  ]);
  const report = consistency.get(s.id);
  const byKey = new Map(report?.items.map((r) => [r.key, r]));
  const hidden = { supplierId: s.id };
  const owner = s.users[0];
  const v = s.verification;
  return (
    <>
      <PageHead
        title={s.name}
        eyebrow={<>{s.categories.map((c) => c.name).join(", ")} · {s.area} · {s._count.supplierOrders} order{s._count.supplierOrders === 1 ? "" : "s"}</>}
        backHref="/admin"
        backLabel="Supplier checks"
        action={<Pill tone={v === "VERIFIED" ? "green" : v === "REJECTED" ? "red" : "amber"}>{v.toLowerCase()}</Pill>}
      />
      <Flash sp={sp} />
      <div className="grid2">
        <div className="stack" style={{ minWidth: 0 }}>
          <div className="card stack" style={{ gap: 6 }}>
            <h2>Details</h2>
            <div className="k">{s.address} · {s.phone} · CAC {s.cacNumber || "not given"}</div>
            <div className="k">Bank: {s.bankName ? `${s.bankName} ${s.bankAccountNumber ?? ""} (${s.bankAccountName ?? ""})` : "not given"}</div>
            <div className="k">Delivery {s.deliveryFee ? naira(s.deliveryFee) : "free"}{s.minOrderValue ? ` · smallest order ${naira(s.minOrderValue)}` : ""}</div>
            <div className="k">Login: {owner ? <><span className="mono">{owner.email}</span> ({owner.name})</> : "none"}</div>
            <SupplierCriteriaSummary s={s} showChecks />
            <details>
              <summary className="k" style={{ cursor: "pointer" }}>Edit how they work</summary>
              <form action={adminUpdateCriteria} className="stack" style={{ marginTop: 10, maxWidth: "none" }}>
                <input type="hidden" name="supplierId" value={s.id} />
                <label className="f">CAC number<input type="text" name="cacNumber" id="cacNumber" defaultValue={s.cacNumber ?? ""} /></label>
                <SupplierCriteriaFields s={s} />
                <div><button className="btn sec" type="submit">Save details</button></div>
              </form>
            </details>
          </div>
          <div className="card stack">
            <h2>Rate cards</h2>
            <RateCardList cards={rateCards} remove={adminDeleteRateCard} hidden={hidden} />
            <RateCardUpload action={adminUploadRateCard} hidden={hidden} />
          </div>
          {owner ? (
            <form action={adminResetPassword} className="card stack">
              <input type="hidden" name="supplierId" value={s.id} />
              <h2>Set a new password</h2>
              <p className="k" style={{ margin: 0 }}>If they forget it, set a new one and give it to them directly.</p>
              <div className="fields">
                <label className="f">New password<input type="text" name="password" id="password" defaultValue={"bertha-" + randomBytes(4).toString("hex")} minLength={8} required /></label>
              </div>
              <div><button className="btn sec" type="submit">Set password</button></div>
            </form>
          ) : null}
        </div>

        <div className="stack" style={{ minWidth: 0 }}>
          <div className="card">
            <h2 style={{ marginBottom: 8 }}>Price list</h2>
            {s.catalogue.length === 0 ? <Empty>No items yet.</Empty> : (
              <div className="table-wrap"><table className="list">
                <tbody>
                  {s.catalogue.map((c) => {
                    const f = `pi-${c.id}`;
                    return (
                      <tr key={c.id}>
                        <td><span className="t">{c.name}</span><div className="k">per {c.unit} · updated {day(c.updatedAt)}</div><ChangeTag item={byKey.get(priceKey(c.name, c.unit))} quiet /></td>
                        <td className="r"><input form={f} type="number" name="price" min="1" step="1" defaultValue={c.price} aria-label={`Price of ${c.name}`} style={{ width: 100, textAlign: "right" }} /></td>
                        <td><input form={f} type="checkbox" name="available" defaultChecked={c.available} aria-label={`${c.name} in stock`} style={{ width: 18, height: 18, accentColor: "var(--brand)" }} /></td>
                        <td>
                          <form id={f} action={adminUpdatePriceItem} className="btns" style={{ flexWrap: "nowrap" }}>
                            <input type="hidden" name="supplierId" value={s.id} />
                            <input type="hidden" name="itemId" value={c.id} />
                            <button className="btn small" type="submit">Save</button>
                            <button className="btn small sec" type="submit" name="remove" value="1">Remove</button>
                          </form>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table></div>
            )}
          </div>
          <form action={adminAddPriceItems} className="card stack">
            <input type="hidden" name="supplierId" value={s.id} />
            <h2>Add items</h2>
            <label className="f">One per line: item, unit, price
              <textarea name="priceList" id="priceList" rows={4} placeholder={"Tomatoes, basket, 25000"} required />
            </label>
            <div><button className="btn sec" type="submit">Add to price list</button></div>
          </form>
        </div>
      </div>
      <div className="card stack" style={{ marginTop: 16 }}>
        <h2>Price consistency</h2>
        <ConsistencyPanel report={report} differences={report?.differences ?? []} />
      </div>
    </>
  );
}
