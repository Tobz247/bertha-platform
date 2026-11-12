import { addTeamMember, updateSettings, updateTeamMember } from "@/app/actions/buyer";
import { Flash } from "@/components/Flash";
import { PageHead } from "@/components/ui";
import { can, requireBuyer } from "@/lib/auth";
import { db } from "@/lib/db";
import { day } from "@/lib/format";
import { BUYER_ROLES, roleLabel } from "@/lib/roles";

export const metadata = { title: "Settings" };

export default async function Settings({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { user, business } = await requireBuyer();
  const team = await db.user.findMany({ where: { businessId: business.id }, orderBy: { createdAt: "asc" } });
  const admin = can(user, "team");
  // Only owners can hand out or change the owner role.
  const roles = BUYER_ROLES.filter((r) => r.role !== "OWNER" || user.role === "OWNER");
  return (
    <>
      <PageHead title="Settings" eyebrow={business.name} />
      <Flash sp={sp} />
      <div className="grid2">
        <form action={updateSettings} className="card stack">
          <h2>Business</h2>
          <label className="f">Approval limit (₦) <span className="hint">orders above this need an owner or manager to approve. Leave blank to turn approvals off.</span>
            <input type="number" name="approvalLimit" id="approvalLimit" min="0" defaultValue={business.approvalLimit ?? ""} disabled={!admin} />
          </label>
          <label className="f">Delivery address<input type="text" name="address" id="address" defaultValue={business.address} disabled={!admin} /></label>
          <label className="f">Phone<input type="tel" name="phone" id="phone" defaultValue={business.phone} disabled={!admin} /></label>
          {admin ? <div><button className="btn" type="submit">Save</button></div> : <p className="k">Only an owner or manager can change these.</p>}
        </form>
        <div className="card stack">
          <h2>Team</h2>
          <p className="k" style={{ margin: 0 }}>Each person sees the parts of Bertha their role needs. You are {roleLabel(user.role)}.</p>
          <table className="list">
            <tbody>
              {team.map((t) => {
                const locked = !admin || t.id === user.id || (t.role === "OWNER" && user.role !== "OWNER");
                return (
                  <tr key={t.id} style={t.active ? undefined : { opacity: 0.55 }}>
                    <td>
                      {t.name}{t.id === user.id ? " (you)" : ""}
                      <div className="k">{t.email}{t.active ? (t.lastLoginAt ? ` · last in ${day(t.lastLoginAt)}` : " · not signed in yet") : " · login turned off"}</div>
                    </td>
                    <td>
                      {locked ? (
                        <span className="k">{roleLabel(t.role)}</span>
                      ) : (
                        <form action={updateTeamMember} className="btns" style={{ alignItems: "center", justifyContent: "flex-end" }}>
                          <input type="hidden" name="userId" value={t.id} />
                          <select name="role" aria-label={`Role for ${t.name}`} defaultValue={t.role} style={{ width: "auto" }}>
                            {roles.map((r) => <option key={r.role} value={r.role}>{r.label}</option>)}
                          </select>
                          <button className="btn sec small" type="submit">Save</button>
                          <button className="btn sec small" type="submit" name="active" value={t.active ? "0" : "1"}>{t.active ? "Turn off login" : "Turn login back on"}</button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <details>
            <summary className="k">What each role can do</summary>
            <table className="list"><tbody>{BUYER_ROLES.map((r) => <tr key={r.role}><td>{r.label}</td><td className="k">{r.does}</td></tr>)}</tbody></table>
          </details>
          {admin ? (
            <form action={addTeamMember} className="stack" style={{ borderTop: "1px solid var(--line)", paddingTop: 12 }}>
              <h3>Add someone</h3>
              <div className="fields">
                <label className="f">Name<input type="text" name="name" id="member-name" required /></label>
                <label className="f">Email<input type="email" name="email" id="member-email" required /></label>
              </div>
              <div className="fields">
                <label className="f">Role
                  <select name="role" id="member-role" defaultValue="STAFF">{roles.map((r) => <option key={r.role} value={r.role}>{r.label}: {r.does.toLowerCase()}</option>)}</select>
                </label>
                <label className="f">Temporary password<input type="text" name="password" id="member-password" required minLength={8} /></label>
              </div>
              <div><button className="btn sec" type="submit">Add to team</button></div>
            </form>
          ) : null}
        </div>
      </div>
    </>
  );
}
