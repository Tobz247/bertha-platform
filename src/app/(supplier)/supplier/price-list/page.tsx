import { addCatalogItem, updateCatalogItem, updateOrderTerms } from "@/app/actions/supplier";
import { Flash } from "@/components/Flash";
import { Empty, PageHead, Pill } from "@/components/ui";
import { requireSupplier } from "@/lib/auth";
import { db } from "@/lib/db";
import { day, naira, qty } from "@/lib/format";
import { marketPrices } from "@/lib/prices";
import { pctDiff, priceKey } from "@/lib/rules";

export const metadata = { title: "Price list" };

export default async function PriceList({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { business } = await requireSupplier();
  const [items, categories, market] = await Promise.all([
    db.catalogItem.findMany({ where: { supplierId: business.id }, include: { category: true }, orderBy: [{ category: { name: "asc" } }, { name: "asc" }] }),
    db.category.findMany({ where: { suppliers: { some: { id: business.id } } }, orderBy: { name: "asc" } }),
    marketPrices(),
  ]);
  const units = [...new Set(categories.flatMap((c) => c.units.split(",").map((u) => u.trim())).filter(Boolean))];

  return (
    <>
      <PageHead title="Price list" eyebrow="Buyers can order these straight away, without asking for quotes" />
      <Flash sp={sp} />
      {business.verification !== "VERIFIED" ? <div className="alert warn" style={{ marginBottom: 16 }}>Buyers will see your price list once your account is verified.</div> : null}

      {items.length === 0 ? <Empty>Add the items you sell most often. Keep prices current: buyers see when you last updated each one.</Empty> : (
        <div className="card table-wrap" style={{ padding: 0, marginBottom: 20 }}>
          <table className="list">
            <thead><tr><th>Item</th><th className="r">Price (₦)</th><th className="r">Min. qty</th><th>In stock</th><th>Going rate</th><th /></tr></thead>
            <tbody>
              {items.map((i) => {
                const m = market.get(priceKey(i.name, i.unit));
                const diff = m ? pctDiff(i.price, m.median) : null;
                const formId = `ci-${i.id}`;
                return (
                  <tr key={i.id}>
                    <td><span className="t">{i.name}</span><div className="k">per {i.unit}{i.category ? ` · ${i.category.name}` : ""} · updated {day(i.updatedAt)}</div></td>
                    <td className="r"><input form={formId} type="number" name="price" min="1" step="1" defaultValue={i.price} aria-label={`Price of ${i.name}`} style={{ width: 110, textAlign: "right" }} /></td>
                    <td className="r"><input form={formId} type="number" name="minQty" min="0" step="any" defaultValue={i.minQty || ""} aria-label={`Minimum quantity of ${i.name}`} style={{ width: 80, textAlign: "right" }} /></td>
                    <td><input form={formId} type="checkbox" name="available" defaultChecked={i.available} aria-label={`${i.name} in stock`} style={{ width: 18, height: 18, accentColor: "var(--brand)" }} /></td>
                    <td>{m ? <>{naira(m.median)} {diff != null && Math.abs(diff) > 2 ? <Pill tone={diff > 10 ? "red" : diff < 0 ? "green" : "grey"}>{diff > 0 ? "+" : ""}{diff}%</Pill> : null}</> : <span className="k">—</span>}</td>
                    <td>
                      <form id={formId} action={updateCatalogItem} className="btns" style={{ flexWrap: "nowrap" }}>
                        <input type="hidden" name="itemId" value={i.id} />
                        <button className="btn small" type="submit">Save</button>
                        <button className="btn small sec" type="submit" name="remove" value="1">Remove</button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid2">
        <form action={addCatalogItem} className="card stack">
          <h2>Add an item</h2>
          <label className="f">Item<input type="text" name="name" id="name" placeholder="e.g. Tomatoes (Roma)" required /></label>
          <div className="fields">
            <label className="f">Unit<input type="text" name="unit" id="unit" list="units" placeholder="kg, basket, bag" required /></label>
            <label className="f">Price per unit (₦)<input type="number" name="price" id="price" min="1" step="1" required /></label>
          </div>
          <datalist id="units">{units.map((u) => <option key={u} value={u} />)}</datalist>
          <div className="fields">
            <label className="f">Category
              <select name="categoryId" id="categoryId" defaultValue={categories[0]?.id ?? ""}>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                <option value="">Other</option>
              </select>
            </label>
            <label className="f">Minimum quantity <span className="hint">optional</span><input type="number" name="minQty" id="minQty" min="0" step="any" /></label>
          </div>
          <div><button className="btn" type="submit">Add to price list</button></div>
        </form>

        <form action={updateOrderTerms} className="card stack">
          <h2>Delivery terms</h2>
          <p className="k" style={{ margin: 0 }}>Applied to orders from your price list. Quotes still carry their own delivery fee.</p>
          <label className="f">Delivery fee per order (₦)<input type="number" name="deliveryFee" id="deliveryFee" min="0" step="1" defaultValue={business.deliveryFee} /></label>
          <label className="f">Smallest order you accept (₦) <span className="hint">leave blank for none</span><input type="number" name="minOrderValue" id="minOrderValue" min="0" step="1" defaultValue={business.minOrderValue ?? ""} /></label>
          <div><button className="btn sec" type="submit">Save terms</button></div>
          {items.length ? <p className="k" style={{ margin: 0 }}>{items.filter((i) => i.available).length} of {items.length} items in stock{items.some((i) => i.minQty) ? ` · ${items.filter((i) => i.minQty).map((i) => `${i.name} min ${qty(i.minQty)}`).slice(0, 2).join(", ")}` : ""}.</p> : null}
        </form>
      </div>
    </>
  );
}
