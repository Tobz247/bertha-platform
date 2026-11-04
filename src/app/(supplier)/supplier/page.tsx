import Link from "next/link";
import { Empty, PageHead, Pill } from "@/components/ui";
import { requireSupplier } from "@/lib/auth";
import { db } from "@/lib/db";
import { day, qty, rfqNo } from "@/lib/format";
import { visibleToSupplier } from "@/lib/requests";

export const metadata = { title: "Requests for quotes" };

export default async function SupplierInbox() {
  const { business } = await requireSupplier();
  const categoryIds = (await db.category.findMany({ where: { suppliers: { some: { id: business.id } } }, select: { id: true } })).map((c) => c.id);
  const requests = await db.request.findMany({
    where: { status: "OPEN", ...visibleToSupplier(business.id, categoryIds) },
    include: { buyer: true, lines: { orderBy: { position: "asc" } }, category: true, quotes: { where: { supplierId: business.id } } },
    orderBy: { quoteDeadline: "asc" },
  });
  const now = new Date();
  return (
    <>
      <PageHead title="Requests for quotes" eyebrow={`${business.name} · ${business.verification === "VERIFIED" ? "Verified" : "Being checked"}`} />
      {business.verification !== "VERIFIED" ? (
        <div className="alert warn" style={{ marginBottom: 16 }}><b>Your account is being checked.</b> You can see requests now and send quotes once our team has verified your business. Complete your <Link href="/supplier/profile">profile</Link> to speed this up.</div>
      ) : null}
      {requests.length === 0 ? <Empty>No open requests in your categories right now. You&apos;ll get an SMS when one comes in.</Empty> : null}
      <div className="stack">
        {requests.map((r) => {
          const mine = r.quotes[0];
          const closed = r.quoteDeadline < now;
          return (
            <Link key={r.id} href={`/supplier/requests/${r.id}`} className="card">
              <div className="row">
                <span className="t">{r.buyer.name} <span className="k">· {r.buyer.area}</span></span>
                {mine && mine.status === "SUBMITTED" ? <Pill tone="green">Quote sent</Pill> : closed ? <Pill tone="grey">Closing date passed</Pill> : <Pill tone="amber">Closes {day(r.quoteDeadline)}</Pill>}
              </div>
              <div className="k">{r.lines.map((l) => `${qty(l.quantity)} ${l.unit} ${l.product}`).join(", ")}</div>
              <div className="k"><span className="mono">{rfqNo(r.number)}</span> · {r.category.name} · needed {day(r.neededBy)}</div>
            </Link>
          );
        })}
      </div>
    </>
  );
}
