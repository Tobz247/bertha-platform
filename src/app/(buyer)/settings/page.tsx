import { addTeamMember, updateSettings } from "@/app/actions/buyer";
import { Flash } from "@/components/Flash";
import { PageHead } from "@/components/ui";
import { canApprove, requireBuyer } from "@/lib/auth";
import { db } from "@/lib/db";

export const metadata = { title: "Settings" };

const ROLE = { OWNER: "Owner", MANAGER: "Manager (can approve)", STAFF: "Staff" } as const;

export default async function Settings({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { user, business } = await requireBuyer();
  const team = await db.user.findMany({ where: { businessId: business.id }, orderBy: { createdAt: "asc" } });
  const admin = canApprove(user);
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
          <table className="list">
            <tbody>{team.map((t) => <tr key={t.id}><td>{t.name}<div className="k">{t.email}</div></td><td className="k">{ROLE[t.role]}</td></tr>)}</tbody>
          </table>
          {admin ? (
            <form action={addTeamMember} className="stack" style={{ borderTop: "1px solid var(--line)", paddingTop: 12 }}>
              <h3>Add someone</h3>
              <div className="fields">
                <label className="f">Name<input type="text" name="name" id="member-name" required /></label>
                <label className="f">Email<input type="email" name="email" id="member-email" required /></label>
              </div>
              <div className="fields">
                <label className="f">Role
                  <select name="role" id="member-role" defaultValue="STAFF"><option value="STAFF">Staff: requests, stock and deliveries</option><option value="MANAGER">Manager: also approves large orders</option></select>
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
