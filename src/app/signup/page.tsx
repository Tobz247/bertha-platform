import Link from "next/link";
import { signup } from "@/app/actions/auth";
import { Flash } from "@/components/Flash";
import { db } from "@/lib/db";
import { ABUJA_AREAS } from "@/lib/format";

export const metadata = { title: "Create an account" };

export default async function SignupPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const categories = await db.category.findMany({ orderBy: { name: "asc" } });
  return (
    <main className="auth">
      <form action={signup} className="card" style={{ maxWidth: 560 }}>
        <div>
          <h1>Create your account</h1>
          <p className="muted" style={{ margin: "4px 0 0" }}>One account for your business. You can add your team later.</p>
        </div>
        <Flash sp={sp} />
        <fieldset>
          <legend>I am</legend>
          <div className="stack" style={{ gap: 6 }}>
            <label className="check"><input type="radio" name="type" value="BUYER" defaultChecked /> A buyer: hotel, restaurant, caterer or food business</label>
            <label className="check"><input type="radio" name="type" value="SUPPLIER" /> A supplier: farmer, wholesaler or distributor</label>
          </div>
        </fieldset>
        <label className="f">Business name<input type="text" name="businessName" id="businessName" required /></label>
        <div className="fields">
          <label className="f">Area
            <select name="area" id="area" required defaultValue="">
              <option value="" disabled>Choose…</option>
              {ABUJA_AREAS.map((a) => <option key={a}>{a}</option>)}
            </select>
          </label>
          <label className="f">CAC number <span className="hint">optional</span><input type="text" name="cacNumber" id="cacNumber" /></label>
        </div>
        <label className="f">Business address<input type="text" name="address" id="address" required /></label>
        <div className="fields">
          <label className="f">Your name<input type="text" name="name" id="name" required autoComplete="name" /></label>
          <label className="f">Phone<input type="tel" name="phone" id="phone" required placeholder="0803 000 0000" autoComplete="tel" /></label>
        </div>
        <label className="f">Email<input type="email" name="email" id="email" required autoComplete="email" /></label>
        <label className="f">Password <span className="hint">at least 8 characters</span><input type="password" name="password" id="password" required minLength={8} autoComplete="new-password" /></label>
        <fieldset>
          <legend>Suppliers only: what do you supply?</legend>
          <div className="fields" style={{ gap: 6 }}>
            {categories.map((c) => (
              <label key={c.id} className="check"><input type="checkbox" name="categories" value={c.id} /> {c.name}</label>
            ))}
          </div>
          <p className="k" style={{ marginBottom: 0 }}>Supplier accounts are checked by our team before you can send quotes.</p>
        </fieldset>
        <button className="btn" type="submit">Create account</button>
        <p className="muted" style={{ margin: 0 }}>Already have an account? <Link href="/login">Sign in</Link></p>
      </form>
    </main>
  );
}
