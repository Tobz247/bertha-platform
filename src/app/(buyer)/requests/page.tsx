import Link from "next/link";
import { Empty, PageHead, Pill } from "@/components/ui";
import { requireBuyer } from "@/lib/auth";
import { db } from "@/lib/db";
import { day, rfqNo } from "@/lib/format";

export const metadata = { title: "Requests" };

const STATUS = { OPEN: null, AWARDED: { t: "Awarded", tone: "blue" }, CLOSED: { t: "Closed", tone: "grey" }, CANCELLED: { t: "Cancelled", tone: "grey" } } as const;

export default async function Requests() {
  const { business } = await requireBuyer();
  const requests = await db.request.findMany({
    where: { buyerId: business.id },
    include: { lines: true, category: true, quotes: { where: { status: { in: ["SUBMITTED", "AWARDED", "NOT_SELECTED"] } } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return (
    <>
      <PageHead title="Requests" eyebrow="Ask verified suppliers for quotes" action={<Link className="btn" href="/requests/new">New request</Link>} />
      {requests.length === 0 ? <Empty>No requests yet. <Link href="/requests/new">Create your first one</Link>.</Empty> : null}
      <div className="stack">
        {requests.map((r) => {
          const s = STATUS[r.status];
          return (
            <Link key={r.id} href={`/requests/${r.id}`} className="card">
              <div className="row">
                <span className="t">{r.title}</span>
                {s ? <Pill tone={s.tone}>{s.t}</Pill> : r.quotes.length ? <Pill tone="green">{r.quotes.length} quote{r.quotes.length > 1 ? "s" : ""} to compare</Pill> : <Pill tone="grey">Waiting for quotes</Pill>}
              </div>
              <div className="k"><span className="mono">{rfqNo(r.number)}</span> · {r.category.name} · {r.lines.length} item{r.lines.length > 1 ? "s" : ""} · needed {day(r.neededBy)}</div>
            </Link>
          );
        })}
      </div>
    </>
  );
}
