import Link from "next/link";
import { login } from "@/app/actions/auth";
import { Flash } from "@/components/Flash";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  return (
    <main className="auth">
      <form action={login} className="card">
        <div>
          <div className="brand" style={{ padding: 0 }}>Bertha Services</div>
          <p className="muted" style={{ margin: "4px 0 0" }}>Procurement, orders and stock for food businesses in Abuja.</p>
        </div>
        <Flash sp={sp} />
        <label className="f">Email or phone number<input type="text" name="email" id="email" required autoComplete="username" inputMode="email" /></label>
        <label className="f">Password<input type="password" name="password" id="password" required autoComplete="current-password" /></label>
        <button className="btn" type="submit">Sign in</button>
        <p className="muted" style={{ margin: 0 }}>New here? <Link href="/signup">Create an account</Link></p>
      </form>
    </main>
  );
}
