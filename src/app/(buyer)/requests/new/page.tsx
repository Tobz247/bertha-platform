import { createRequest } from "@/app/actions/buyer";
import { Flash } from "@/components/Flash";
import { LineEditor } from "@/components/LineEditor";
import { PageHead } from "@/components/ui";
import { requireBuyer } from "@/lib/auth";
import { db } from "@/lib/db";
import { dateInput } from "@/lib/format";
import { addDays, stockOnHand, suggestedReorder } from "@/lib/rules";

export const metadata = { title: "New request" };

export default async function NewRequest({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const { business } = await requireBuyer("requests");
  const itemIds = ([] as string[]).concat(sp.items ?? []).flatMap((v) => v.split(",")).filter(Boolean);
  const [categories, suppliers, items] = await Promise.all([
    db.category.findMany({ orderBy: { name: "asc" } }),
    db.business.findMany({ where: { type: "SUPPLIER", verification: "VERIFIED" }, include: { categories: true }, orderBy: { name: "asc" } }),
    itemIds.length ? db.stockItem.findMany({ where: { id: { in: itemIds }, buyerId: business.id }, include: { batches: true } }) : [],
  ]);
  const initial = items.map((i) => ({
    product: i.name,
    quantity: String(suggestedReorder(stockOnHand(i.batches), i.reorderLevel, i.reorderQty)),
    unit: i.unit,
  }));
  const units = Array.from(new Set(categories.flatMap((c) => c.units.split(",").map((u) => u.trim())).filter(Boolean)));
  const today = new Date();

  return (
    <>
      <PageHead title="New request" eyebrow="Suppliers are told by SMS and email" backHref="/requests" backLabel="Requests" />
      <Flash sp={sp} />
      <form action={createRequest} className="stack">
        <label className="f">What is it for?<input type="text" name="title" id="title" required placeholder="e.g. Weekend vegetables" defaultValue={items.length ? "Restock: " + items.map((i) => i.name).join(", ") : ""} /></label>
        <label className="f">Category
          <select name="categoryId" id="categoryId" required defaultValue="">
            <option value="" disabled>Choose…</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <fieldset>
          <legend>Items</legend>
          <LineEditor initial={initial} units={units} />
        </fieldset>
        <div className="fields">
          <label className="f">Needed by<input type="date" name="neededBy" id="neededBy" required min={dateInput(today)} defaultValue={dateInput(addDays(today, 2))} /></label>
          <label className="f">Quotes close<input type="date" name="quoteDeadline" id="quoteDeadline" min={dateInput(today)} defaultValue={dateInput(addDays(today, 1))} /></label>
        </div>
        <label className="f">Deliver to<input type="text" name="deliveryAddress" id="deliveryAddress" defaultValue={business.address} /></label>
        <label className="f">Notes for suppliers <span className="hint">optional: quality, size, packaging</span><textarea name="notes" id="notes" /></label>
        <fieldset>
          <legend>Who should quote?</legend>
          <div className="stack" style={{ gap: 6 }}>
            <label className="check"><input type="radio" name="audience" value="ALL_VERIFIED" defaultChecked /> All verified suppliers in this category</label>
            <label className="check"><input type="radio" name="audience" value="SHORTLIST" /> Only the suppliers I tick below</label>
          </div>
          <div className="fields" style={{ marginTop: 10, gap: 6 }}>
            {suppliers.map((s) => (
              <label key={s.id} className="check"><input type="checkbox" name="shortlist" value={s.id} /> {s.name} <span className="k">· {s.categories.map((c) => c.name).join(", ")}</span></label>
            ))}
          </div>
        </fieldset>
        <div><button className="btn" type="submit">Send request</button></div>
      </form>
    </>
  );
}
