import { createKitchenRequest } from "@/app/actions/kitchen";
import { Flash } from "@/components/Flash";
import { KitchenLineEditor } from "@/components/KitchenLineEditor";
import { PageHead } from "@/components/ui";
import { requireBuyer } from "@/lib/auth";
import { db } from "@/lib/db";
import { dateInput } from "@/lib/format";
import { DEPARTMENTS } from "@/lib/kitchen-rules";
import { stockOverview } from "@/lib/stock";

export const metadata = { title: "New kitchen request" };

export default async function NewKitchenRequest({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { business } = await requireBuyer();
  const [stock, categories] = await Promise.all([stockOverview(business.id), db.category.findMany({ select: { units: true } })]);
  const units = Array.from(new Set([...stock.map((s) => s.unit), ...categories.flatMap((c) => c.units.split(",").map((u) => u.trim()))].filter(Boolean)));
  return (
    <>
      <PageHead title="New kitchen request" eyebrow="Ask the store for what you need. Procurement reviews it." backHref="/kitchen" backLabel="Kitchen requests" />
      <Flash sp={sp} />
      <form action={createKitchenRequest} className="stack">
        <div className="fields">
          <label className="f">For
            <input type="text" name="department" id="department" list="departments" defaultValue="Kitchen" required />
            <datalist id="departments">{DEPARTMENTS.map((d) => <option key={d} value={d} />)}</datalist>
          </label>
          <label className="f">Needed by<input type="date" name="neededBy" id="neededBy" required min={dateInput(new Date())} defaultValue={dateInput(new Date())} /></label>
        </div>
        <fieldset>
          <legend>Items</legend>
          <KitchenLineEditor stock={stock.map((s) => ({ name: s.name, unit: s.unit, onHand: s.onHand }))} units={units} />
        </fieldset>
        <label className="f">Note for procurement <span className="hint">optional: what it&apos;s for, e.g. Saturday wedding, 200 guests</span><textarea name="note" id="note" /></label>
        <div><button className="btn" type="submit">Send to procurement</button></div>
      </form>
    </>
  );
}
