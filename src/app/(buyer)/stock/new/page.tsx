import { createStockItem } from "@/app/actions/buyer";
import { Flash } from "@/components/Flash";
import { PageHead } from "@/components/ui";
import { requireBuyer } from "@/lib/auth";

export const metadata = { title: "Add stock item" };

export default async function NewStockItem({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  await requireBuyer("stock");
  return (
    <>
      <PageHead title="Add stock item" eyebrow="For goods you already hold or buy outside the platform" backHref="/stock" backLabel="Stock" />
      <Flash sp={sp} />
      <form action={createStockItem} className="stack">
        <div className="fields">
          <label className="f">Item<input type="text" name="name" id="name" required placeholder="e.g. Palm oil" /></label>
          <label className="f">Unit<input type="text" name="unit" id="unit" required placeholder="e.g. 25L jerrycan" /></label>
        </div>
        <label className="f">Stored in
          <select name="location" id="location" defaultValue="DRY_STORE"><option value="DRY_STORE">Dry store</option><option value="COLD_ROOM">Cold room</option><option value="FREEZER">Freezer</option><option value="OTHER">Other</option></select>
        </label>
        <div className="fields">
          <label className="f">Quantity on hand now<input type="number" name="openingQty" id="openingQty" min="0" step="any" defaultValue={0} /></label>
          <label className="f">Use by <span className="hint">optional</span><input type="date" name="expiresAt" id="expiresAt" /></label>
        </div>
        <div className="fields">
          <label className="f">Reorder when at or below<input type="number" name="reorderLevel" id="reorderLevel" min="0" step="any" defaultValue={0} /></label>
          <label className="f">Usual order quantity<input type="number" name="reorderQty" id="reorderQty" min="0" step="any" defaultValue={0} /></label>
        </div>
        <div><button className="btn" type="submit">Add item</button></div>
      </form>
    </>
  );
}
