import { randomBytes } from "node:crypto";
import { adminCreateSupplier } from "@/app/actions/admin";
import { Flash } from "@/components/Flash";
import { PageHead } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { ABUJA_AREAS } from "@/lib/format";

export const metadata = { title: "Add a supplier" };

export default async function AddSupplier({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  await requireAdmin();
  const categories = await db.category.findMany({ orderBy: { name: "asc" } });
  const tempPassword = "bertha-" + randomBytes(4).toString("hex");
  return (
    <>
      <PageHead title="Add a supplier" eyebrow="For suppliers you've met and checked yourself. They start verified." backHref="/admin" backLabel="Supplier checks" />
      <Flash sp={sp} />
      <form action={adminCreateSupplier} className="stack" style={{ maxWidth: 720 }}>
        <div className="card stack">
          <h2>Business</h2>
          <label className="f">Business name<input type="text" name="businessName" id="businessName" required placeholder="e.g. Mama Ngozi Vegetables, Wuse Market" /></label>
          <div className="fields">
            <label className="f">Phone<input type="tel" name="phone" id="phone" required placeholder="0803 000 0000" /></label>
            <label className="f">Area<select name="area" id="area" defaultValue="Wuse">{ABUJA_AREAS.map((a) => <option key={a}>{a}</option>)}</select></label>
          </div>
          <label className="f">Address or market stall<input type="text" name="address" id="address" required placeholder="e.g. Shop 14, Wuse Market" /></label>
          <fieldset>
            <legend>What they supply</legend>
            <div className="fields" style={{ gap: 6 }}>
              {categories.map((c) => <label key={c.id} className="check"><input type="checkbox" name="categories" value={c.id} /> {c.name}</label>)}
            </div>
          </fieldset>
          <div className="fields">
            <label className="f">CAC number <span className="hint">if they have one</span><input type="text" name="cacNumber" id="cacNumber" /></label>
            <label className="f">Delivery fee per order (₦) <span className="hint">optional</span><input type="number" name="deliveryFee" id="deliveryFee" min="0" step="1" /></label>
          </div>
        </div>

        <div className="card stack">
          <h2>Contact and login</h2>
          <div className="fields">
            <label className="f">Contact person<input type="text" name="name" id="name" required /></label>
            <label className="f">Email <span className="hint">leave blank if they have none</span><input type="email" name="email" id="email" /></label>
          </div>
          <label className="f">Temporary password <span className="hint">give it to them directly; they can sign in with it later</span><input type="text" name="password" id="password" defaultValue={tempPassword} required minLength={8} /></label>
          <p className="k" style={{ margin: 0 }}>With no email, they sign in by typing their phone number in the email box.</p>
        </div>

        <div className="card stack">
          <h2>Bank details for transfers <span className="hint">optional</span></h2>
          <div className="fields">
            <label className="f">Bank<input type="text" name="bankName" id="bankName" /></label>
            <label className="f">Account number<input type="text" name="bankAccountNumber" id="bankAccountNumber" inputMode="numeric" /></label>
            <label className="f">Account name<input type="text" name="bankAccountName" id="bankAccountName" /></label>
          </div>
        </div>

        <div className="card stack">
          <h2>Price list <span className="hint">optional</span></h2>
          <label className="f">One item per line: item, unit, price
            <textarea name="priceList" id="priceList" rows={6} placeholder={"Tomatoes, basket, 25000\nOnions, bag, 60000\nPepper (tatashe), basket, 18000"} />
          </label>
          <p className="k" style={{ margin: 0 }}>Buyers can order these straight away. You can change prices later from the supplier&apos;s page.</p>
        </div>
        <div><button className="btn" type="submit">Add supplier</button></div>
      </form>
    </>
  );
}
