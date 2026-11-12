import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { Empty, PageHead, Pill } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

export const metadata = { title: "Audit log" };

const PAGE = 100;

const GROUPS: Record<string, { label: string; tone: "green" | "amber" | "red" | "blue" | "grey" }> = {
  auth: { label: "Sign-ins", tone: "grey" },
  team: { label: "Team and roles", tone: "blue" },
  order: { label: "Orders", tone: "green" },
  payment: { label: "Payments", tone: "green" },
  settings: { label: "Settings", tone: "amber" },
  admin: { label: "Admin", tone: "red" },
};

const when = (d: Date) =>
  d.toLocaleString("en-NG", { timeZone: "Africa/Lagos", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export default async function AuditLog({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  await requireAdmin();
  const group = sp.group && GROUPS[sp.group] ? sp.group : "";
  const businessId = sp.business || "";
  const q = (sp.q || "").trim();
  const before = sp.before ? new Date(sp.before) : null;
  const failedOnly = sp.group === "failed";

  const where: Prisma.AuditLogWhereInput = {
    ...(failedOnly ? { action: { in: ["auth.login_failed", "auth.login_blocked"] } } : group ? { action: { startsWith: `${group}.` } } : {}),
    ...(businessId ? { businessId } : {}),
    ...(q ? { summary: { contains: q, mode: "insensitive" } } : {}),
    ...(before && !Number.isNaN(before.getTime()) ? { at: { lt: before } } : {}),
  };
  const [rows, businesses] = await Promise.all([
    db.auditLog.findMany({ where, orderBy: { at: "desc" }, take: PAGE + 1, include: { business: { select: { name: true } } } }),
    db.business.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const more = rows.length > PAGE;
  const shown = rows.slice(0, PAGE);
  const filterQs = new URLSearchParams({ ...(sp.group ? { group: sp.group } : {}), ...(businessId ? { business: businessId } : {}), ...(q ? { q } : {}) });

  return (
    <>
      <PageHead title="Audit log" eyebrow="Who did what on Bertha, newest first. Entries can't be edited or deleted." />
      <form className="card fields" method="get" style={{ marginBottom: 16, alignItems: "end" }}>
        <label className="f">Type
          <select name="group" id="group" defaultValue={sp.group || ""}>
            <option value="">Everything</option>
            {Object.entries(GROUPS).map(([k, g]) => <option key={k} value={k}>{g.label}</option>)}
            <option value="failed">Failed or blocked sign-ins</option>
          </select>
        </label>
        <label className="f">Business
          <select name="business" id="business" defaultValue={businessId}>
            <option value="">All businesses</option>
            {businesses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>
        <label className="f">Search<input type="search" name="q" id="q" defaultValue={q} placeholder="name, email, PO number" /></label>
        <div className="btns"><button className="btn sec" type="submit">Filter</button>{filterQs.size || before ? <Link className="btn sec" href="/admin/audit">Clear</Link> : null}</div>
      </form>

      {shown.length === 0 ? <Empty>Nothing logged{filterQs.size ? " for these filters" : " yet"}.</Empty> : (
        <div className="card table-wrap" style={{ padding: 0 }}>
          <table className="list">
            <thead><tr><th>When (Abuja time)</th><th>Type</th><th>What happened</th><th>Business</th></tr></thead>
            <tbody>
              {shown.map((r) => {
                const g = GROUPS[r.action.split(".")[0]];
                const bad = r.action === "auth.login_failed" || r.action === "auth.login_blocked";
                return (
                  <tr key={r.id}>
                    <td className="k" style={{ whiteSpace: "nowrap" }}>{when(r.at)}</td>
                    <td>{bad ? <Pill tone="red">Failed sign-in</Pill> : <Pill tone={g?.tone ?? "grey"}>{g?.label ?? r.action}</Pill>}</td>
                    <td>{r.summary}</td>
                    <td className="k">{r.business ? <Link href={`/admin/audit?business=${r.businessId}`}>{r.business.name}</Link> : "Platform"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {more ? (
        <div style={{ marginTop: 12 }}>
          <Link className="btn sec" href={`/admin/audit?${new URLSearchParams({ ...Object.fromEntries(filterQs), before: shown[shown.length - 1].at.toISOString() })}`}>Older entries</Link>
        </div>
      ) : null}
    </>
  );
}
