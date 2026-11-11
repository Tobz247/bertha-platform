import Link from "next/link";
import { setVerification } from "@/app/actions/supplier";
import { Flash } from "@/components/Flash";
import { Empty, PageHead, Pill } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { day } from "@/lib/format";

export const metadata = { title: "Supplier checks" };

export default async function AdminHome({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  await requireAdmin();
  const suppliers = await db.business.findMany({
    where: { type: "SUPPLIER" },
    include: { categories: true, users: { take: 1, orderBy: { createdAt: "asc" } } },
    orderBy: [{ verification: "asc" }, { createdAt: "desc" }],
  });
  const pending = suppliers.filter((s) => s.verification === "PENDING");
  return (
    <>
      <PageHead title="Supplier checks" eyebrow={`${pending.length} waiting · ${suppliers.length} suppliers in total`} action={<Link className="btn" href="/admin/suppliers/new">Add a supplier</Link>} />
      <Flash sp={sp} />
      <p className="k" style={{ maxWidth: 640 }}>Check documents and call the supplier before verifying. Only verified suppliers can send quotes.</p>
      {suppliers.length === 0 ? <Empty>No suppliers have signed up yet.</Empty> : null}
      <div className="stack">
        {suppliers.map((s) => (
          <div key={s.id} className="card stack" style={{ gap: 8 }}>
            <div className="row">
              <Link className="t" href={`/admin/suppliers/${s.id}`}>{s.name}</Link>
              <Pill tone={s.verification === "VERIFIED" ? "green" : s.verification === "REJECTED" ? "red" : "amber"}>{s.verification.toLowerCase()}</Pill>
            </div>
            <div className="k">{s.categories.map((c) => c.name).join(", ")} · {s.area} · {s.address}</div>
            <div className="k">Contact {s.users[0]?.name ?? "—"} · {s.phone} · {s.users[0]?.email ?? ""} · CAC {s.cacNumber || "not given"} · joined {day(s.createdAt)}</div>
            <form action={setVerification} className="btns">
              <input type="hidden" name="businessId" value={s.id} />
              {s.verification !== "VERIFIED" ? <button className="btn small" type="submit" name="status" value="VERIFIED">Verify</button> : null}
              {s.verification !== "REJECTED" ? <button className="btn danger small" type="submit" name="status" value="REJECTED">Reject</button> : null}
              {s.verification !== "PENDING" ? <button className="btn sec small" type="submit" name="status" value="PENDING">Back to pending</button> : null}
              <Link className="btn sec small" href={`/admin/suppliers/${s.id}`}>Price list and login</Link>
            </form>
          </div>
        ))}
      </div>
    </>
  );
}
