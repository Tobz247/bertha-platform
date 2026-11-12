import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { adminUpdateUser } from "@/app/actions/admin";
import { Flash } from "@/components/Flash";
import { Empty, PageHead, Pill } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { day } from "@/lib/format";
import { BUYER_ROLES, roleLabel } from "@/lib/roles";

export const metadata = { title: "People and roles" };

const SUPPLIER_ROLES = BUYER_ROLES.filter((r) => ["OWNER", "MANAGER", "STAFF"].includes(r.role));

export default async function Users({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const me = await requireAdmin();
  const q = (sp.q || "").trim();
  const where: Prisma.UserWhereInput = q
    ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }, { business: { name: { contains: q, mode: "insensitive" } } }] }
    : {};
  const users = await db.user.findMany({
    where,
    include: { business: true },
    orderBy: [{ business: { name: "asc" } }, { createdAt: "asc" }],
    take: 300,
  });
  return (
    <>
      <PageHead title="People and roles" eyebrow={`${users.length} ${q ? "matching" : "people"} · every change here goes in the audit log`} action={<Link className="btn sec" href="/admin/audit?group=team">Role changes</Link>} />
      <Flash sp={sp} />
      <form method="get" className="btns" style={{ marginBottom: 12 }}>
        <input type="search" name="q" id="q" defaultValue={q} placeholder="Search name, email or business" style={{ maxWidth: 320 }} />
        <button className="btn sec" type="submit">Search</button>
      </form>
      {users.length === 0 ? <Empty>No one found.</Empty> : (
        <div className="card table-wrap" style={{ padding: 0 }}>
          <table className="list">
            <thead><tr><th>Person</th><th>Business</th><th>Last signed in</th><th className="r">Role and login</th></tr></thead>
            <tbody>
              {users.map((u) => {
                const roles = u.business?.type === "SUPPLIER" ? SUPPLIER_ROLES : BUYER_ROLES;
                return (
                  <tr key={u.id} style={u.active ? undefined : { opacity: 0.55 }}>
                    <td>{u.name}{u.isPlatformAdmin ? <> <Pill tone="red">Admin</Pill></> : null}<div className="k">{u.email}</div></td>
                    <td>{u.business ? <>{u.business.name}<div className="k">{u.business.type === "SUPPLIER" ? "Supplier" : "Buyer"}</div></> : <span className="k">None</span>}</td>
                    <td className="k">{u.active ? (u.lastLoginAt ? day(u.lastLoginAt) : "Not yet") : "Login turned off"}</td>
                    <td className="r">
                      {u.id === me.id ? <span className="k">{roleLabel(u.role)} (you)</span> : (
                        <form action={adminUpdateUser} className="btns" style={{ justifyContent: "flex-end", alignItems: "center" }}>
                          <input type="hidden" name="userId" value={u.id} />
                          <select name="role" aria-label={`Role for ${u.name}`} defaultValue={u.role} style={{ width: "auto" }}>
                            {roles.map((r) => <option key={r.role} value={r.role}>{r.label}</option>)}
                          </select>
                          <button className="btn sec small" type="submit">Save</button>
                          <button className={`btn small ${u.active ? "danger" : "sec"}`} type="submit" name="active" value={u.active ? "0" : "1"}>{u.active ? "Turn off" : "Turn on"}</button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
