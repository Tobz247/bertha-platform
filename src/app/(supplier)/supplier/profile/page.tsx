import { updateSupplierProfile } from "@/app/actions/supplier";
import { Flash } from "@/components/Flash";
import { SupplierCriteriaFields } from "@/components/SupplierCriteria";
import { PageHead, Pill } from "@/components/ui";
import { requireSupplier } from "@/lib/auth";
import { db } from "@/lib/db";
import { ABUJA_AREAS } from "@/lib/format";
import { supplierRatings } from "@/lib/orders";

export const metadata = { title: "Business profile" };

export default async function SupplierProfile({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { business } = await requireSupplier();
  const [categories, mine, ratings] = await Promise.all([
    db.category.findMany({ orderBy: { name: "asc" } }),
    db.category.findMany({ where: { suppliers: { some: { id: business.id } } }, select: { id: true } }),
    supplierRatings([business.id]),
  ]);
  const mineIds = new Set(mine.map((c) => c.id));
  const r = ratings.get(business.id);
  const v = business.verification;
  return (
    <>
      <PageHead title={business.name} eyebrow="Business profile" action={<Pill tone={v === "VERIFIED" ? "green" : v === "REJECTED" ? "red" : "amber"}>{v === "VERIFIED" ? "Verified" : v === "REJECTED" ? "Not approved" : "Being checked"}</Pill>} />
      <Flash sp={sp} />
      <p className="k">{r ? `Rated ${r.avg.toFixed(1)} out of 5 from ${r.count} order${r.count > 1 ? "s" : ""}.` : "No ratings yet. Buyers rate you after each delivery."}</p>
      <form action={updateSupplierProfile} className="stack">
        <fieldset>
          <legend>What you supply</legend>
          <div className="fields" style={{ gap: 6 }}>
            {categories.map((c) => <label key={c.id} className="check"><input type="checkbox" name="categories" value={c.id} defaultChecked={mineIds.has(c.id)} /> {c.name}</label>)}
          </div>
        </fieldset>
        <div className="fields">
          <label className="f">Phone<input type="tel" name="phone" id="phone" defaultValue={business.phone} /></label>
          <label className="f">Area<select name="area" id="area" defaultValue={business.area}>{ABUJA_AREAS.map((a) => <option key={a}>{a}</option>)}</select></label>
        </div>
        <label className="f">Address<input type="text" name="address" id="address" defaultValue={business.address} /></label>
        <label className="f">CAC number <span className="hint">helps us verify you faster</span><input type="text" name="cacNumber" id="cacNumber" defaultValue={business.cacNumber ?? ""} /></label>
        <fieldset className="stack">
          <legend>How you work</legend>
          <p className="k" style={{ margin: 0 }}>Buyers see these when choosing a supplier. Filling them in also helps us verify you.</p>
          <SupplierCriteriaFields s={business} />
        </fieldset>
        <fieldset>
          <legend>Bank details for transfers</legend>
          <div className="fields">
            <label className="f">Bank<input type="text" name="bankName" id="bankName" defaultValue={business.bankName ?? ""} /></label>
            <label className="f">Account number<input type="text" name="bankAccountNumber" id="bankAccountNumber" inputMode="numeric" defaultValue={business.bankAccountNumber ?? ""} /></label>
            <label className="f">Account name<input type="text" name="bankAccountName" id="bankAccountName" defaultValue={business.bankAccountName ?? ""} /></label>
          </div>
        </fieldset>
        <div><button className="btn" type="submit">Save profile</button></div>
      </form>
    </>
  );
}
