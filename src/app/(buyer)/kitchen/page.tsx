import Link from "next/link";
import { Flash } from "@/components/Flash";
import { Empty, PageHead, Pill } from "@/components/ui";
import { can, requireBuyer } from "@/lib/auth";
import { db } from "@/lib/db";
import { day } from "@/lib/format";
import { KITCHEN_STATUS } from "@/lib/kitchen";
import { issueProgress, kitchenNo } from "@/lib/kitchen-rules";

export const metadata = { title: "Kitchen requests" };

const TABS = [
  { key: "open", label: "Open", where: { status: { in: ["SUBMITTED", "APPROVED"] as ("SUBMITTED" | "APPROVED")[] } } },
  { key: "all", label: "All", where: {} },
];

export default async function KitchenRequests({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { user, business } = await requireBuyer();
  const tab = TABS.find((t) => t.key === sp.show) ?? TABS[0];
  const list = await db.kitchenRequest.findMany({
    where: { buyerId: business.id, ...tab.where },
    include: { lines: true, raisedBy: true, rfqs: { select: { id: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return (
    <>
      <PageHead
        title="Kitchen requests"
        eyebrow="The kitchen asks, procurement reviews, the store issues or buys"
        action={can(user, "kitchen_request") ? <Link className="btn" href="/kitchen/new">New kitchen request</Link> : null}
      />
      <Flash sp={sp} />
      <div className="btns" style={{ marginBottom: 14 }}>
        <Link className="btn small sec" href="/kitchen/stock">Kitchen stock</Link>
        {TABS.map((t) => <Link key={t.key} className={`btn small ${t.key === tab.key ? "" : "sec"}`} href={`/kitchen?show=${t.key}`}>{t.label}</Link>)}
      </div>
      {list.length === 0 ? <Empty>{tab.key === "open" ? "No open kitchen requests." : "No kitchen requests yet."} {can(user, "kitchen_request") ? <Link href="/kitchen/new">Raise one</Link> : null}</Empty> : null}
      <div className="stack">
        {list.map((k) => {
          const s = KITCHEN_STATUS[k.status];
          const prog = k.status === "APPROVED" ? issueProgress(k.lines) : null;
          return (
            <Link key={k.id} href={`/kitchen/${k.id}`} className="card">
              <div className="row">
                <span className="t">{k.department}: {k.lines.slice(0, 3).map((l) => l.product).join(", ")}{k.lines.length > 3 ? ` and ${k.lines.length - 3} more` : ""}</span>
                <span className="badges">
                  <Pill tone={s.tone}>{s.label}</Pill>
                  {prog === "part" ? <Pill tone="amber">Partly issued</Pill> : null}
                  {k.rfqs.length ? <Pill tone="blue">Sent to suppliers</Pill> : null}
                </span>
              </div>
              <div className="k"><span className="mono">{kitchenNo(k.number)}</span> · raised {day(k.createdAt)} by {k.raisedBy.name} · needed {day(k.neededBy)} · {k.lines.length} item{k.lines.length > 1 ? "s" : ""}</div>
            </Link>
          );
        })}
      </div>
    </>
  );
}
