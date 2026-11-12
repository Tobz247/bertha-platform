import Link from "next/link";
import { notFound } from "next/navigation";
import { cancelKitchenRequest, closeKitchenRequest, issueFromStore, reviewKitchenRequest } from "@/app/actions/kitchen";
import { Flash } from "@/components/Flash";
import { OrderStatusPill, PageHead, Pill } from "@/components/ui";
import { can, requireBuyer } from "@/lib/auth";
import { day, poNo, qty, rfqNo } from "@/lib/format";
import { KITCHEN_STATUS, loadKitchenRequest, stockByKey } from "@/lib/kitchen";
import { approvedOf, issueProgress, itemKey, kitchenNo, linePlan } from "@/lib/kitchen-rules";

export const metadata = { title: "Kitchen request" };

export default async function KitchenRequestPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const { user, business } = await requireBuyer();
  const [k, stock] = await Promise.all([loadKitchenRequest(id, business.id), stockByKey(business.id)]);
  if (!k) notFound();
  const reviewer = can(user, "review_kitchen_request");
  const store = can(user, "stock");
  const buyer = can(user, "requests");
  const s = KITCHEN_STATUS[k.status];
  const reviewed = k.status !== "SUBMITTED";
  const rows = k.lines.map((l) => {
    const st = stock.get(itemKey(l.product, l.unit)) ?? null;
    return { l, st, plan: linePlan(l, st?.onHand ?? null) };
  });
  const canIssue = rows.filter((r) => r.plan.issueNow > 0);
  const toBuy = rows.filter((r) => r.plan.toBuy > 0);
  const prog = k.status === "APPROVED" ? issueProgress(k.lines) : null;
  const buyHref = `/requests/new?kitchen=${k.id}`;

  return (
    <>
      <PageHead
        title={`${k.department} request`}
        eyebrow={<><span className="mono">{kitchenNo(k.number)}</span> · raised {day(k.createdAt)} by {k.raisedBy.name} · needed {day(k.neededBy)}</>}
        backHref="/kitchen"
        backLabel="Kitchen requests"
        action={<div className="badges"><Pill tone={s.tone}>{s.label}</Pill>{prog === "part" ? <Pill tone="amber">Partly issued</Pill> : null}</div>}
      />
      <Flash sp={sp} />

      <div className="grid2">
        <div className="stack">
          {k.note ? <div className="alert info">“{k.note}”</div> : null}

          <div className="card table-wrap">
            <table className="list">
              <thead>
                <tr><th>Item</th><th className="r">Asked</th>{reviewed ? <th className="r">Approved</th> : null}<th className="r">Issued</th><th className="r">In store</th><th>Next step</th></tr>
              </thead>
              <tbody>
                {rows.map(({ l, st, plan }) => (
                  <tr key={l.id}>
                    <td>{st ? <Link href={`/stock/${st.id}`}>{l.product}</Link> : l.product}</td>
                    <td className="r">{qty(l.quantity)} {l.unit}</td>
                    {reviewed ? <td className="r" style={l.approvedQty != null && l.approvedQty < l.quantity ? { color: "var(--red)" } : undefined}>{qty(approvedOf(l))}</td> : null}
                    <td className="r">{qty(l.issuedQty)}</td>
                    <td className="r">{st ? qty(st.onHand) : <span className="k">not stocked</span>}</td>
                    <td>
                      {k.status === "REJECTED" || k.status === "CANCELLED" ? null
                        : plan.remaining === 0 ? <Pill tone="green">Issued</Pill>
                        : <>
                            {plan.issueNow > 0 ? <Pill tone="green">Issue {qty(plan.issueNow)}</Pill> : null}{" "}
                            {plan.toBuy > 0 ? <Pill tone="amber">Buy {qty(plan.toBuy)}</Pill> : null}
                          </>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {k.status === "SUBMITTED" && reviewer ? (
            <form action={reviewKitchenRequest} className="card stack">
              <input type="hidden" name="kitchenRequestId" value={k.id} />
              <h2>Review</h2>
              <p className="k" style={{ margin: 0 }}>Change a quantity to approve less (or 0 to leave an item out). After approval the store issues what it has, and you can send the rest to suppliers.</p>
              <div className="fields">
                {k.lines.map((l) => (
                  <label key={l.id} className="f">{l.product} ({l.unit})<input type="number" name={`approved_${l.id}`} id={`approved_${l.id}`} min="0" step="any" defaultValue={l.quantity} /></label>
                ))}
              </div>
              <label className="f">Note <span className="hint">needed if you don&apos;t approve</span><input type="text" name="reviewNote" id="reviewNote" /></label>
              <div className="btns">
                <button className="btn" type="submit" name="decision" value="approve">Approve</button>
                <button className="btn danger" type="submit" name="decision" value="reject">Don&apos;t approve</button>
              </div>
            </form>
          ) : null}
          {k.status === "SUBMITTED" && !reviewer ? <div className="alert info">Waiting for procurement to review this request.</div> : null}
          {k.status === "REJECTED" ? <div className="alert error">Not approved{k.reviewedBy ? ` by ${k.reviewedBy.name}` : ""}.{k.reviewNote ? ` “${k.reviewNote}”` : ""}</div> : null}
          {k.status === "APPROVED" && k.reviewNote ? <div className="alert info">Approved by {k.reviewedBy?.name}: “{k.reviewNote}”</div> : null}

          {k.status === "APPROVED" && store && canIssue.length ? (
            <form action={issueFromStore} className="card stack" id="issue">
              <input type="hidden" name="kitchenRequestId" value={k.id} />
              <h2>Issue from the store</h2>
              <p className="k" style={{ margin: 0 }}>Enter what you hand over now. It moves from the store to <Link href="/kitchen/stock">kitchen stock</Link>, oldest batch first, and comes out when dishes sold or kitchen use are recorded.</p>
              <div className="fields">
                {canIssue.map(({ l, st, plan }) => (
                  <label key={l.id} className="f">{l.product} ({l.unit}) <span className="hint">{qty(plan.remaining)} to go, {qty(st!.onHand)} in store</span>
                    <input type="hidden" name={`item_${l.id}`} value={st!.id} />
                    <input type="number" name={`issue_${l.id}`} id={`issue_${l.id}`} min="0" max={Math.min(plan.remaining, st!.onHand)} step="any" defaultValue={plan.issueNow} />
                  </label>
                ))}
              </div>
              <label className="f">Collected by <span className="hint">optional</span><input type="text" name="collectedBy" id="collectedBy" placeholder="e.g. Chef Musa" /></label>
              <div><button className="btn" type="submit">Issue and update stock</button></div>
            </form>
          ) : null}

          {k.status === "APPROVED" && !store && canIssue.length ? <div className="alert info">The store can issue {canIssue.length} item{canIssue.length > 1 ? "s" : ""} now.</div> : null}

          {k.status === "APPROVED" && toBuy.length ? (
            <div className="card stack">
              <h2>Not enough in the store</h2>
              <p className="k" style={{ margin: 0 }}>{toBuy.map((r) => `${qty(r.plan.toBuy)} ${r.l.unit} ${r.l.product}`).join(", ")}. Send these to suppliers for quotes. When the goods arrive, check them in on the order and then issue them here.</p>
              {buyer ? <div><Link className="btn" href={buyHref}>Send to suppliers</Link></div> : <div className="k">Procurement sends these to suppliers.</div>}
            </div>
          ) : null}

          {k.status === "APPROVED" && reviewer ? (
            <form action={closeKitchenRequest} className="btns" style={{ alignItems: "flex-end" }}>
              <input type="hidden" name="kitchenRequestId" value={k.id} />
              <label className="f" style={{ minWidth: 220 }}>Close without issuing the rest <span className="hint">optional reason</span><input type="text" name="closeNote" id="closeNote" /></label>
              <button className="btn sec small" type="submit">Close request</button>
            </form>
          ) : null}

          {k.status === "SUBMITTED" && (k.raisedById === user.id || reviewer) ? (
            <form action={cancelKitchenRequest}>
              <input type="hidden" name="kitchenRequestId" value={k.id} />
              <button className="btn sec small" type="submit">Cancel this request</button>
            </form>
          ) : null}
        </div>

        <aside className="stack">
          <div className="card">
            <h2 style={{ marginBottom: 8 }}>Sent to suppliers</h2>
            {k.rfqs.length === 0 ? <div className="k">Nothing yet.</div> : (
              <table className="list">
                <tbody>
                  {k.rfqs.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <Link className="mono" href={`/requests/${r.id}`}>{rfqNo(r.number)}</Link> <span className="k">· {r.category.name}</span>
                        {r.orders.map((o) => <div key={o.id}><Link className="mono" href={`/orders/${o.id}`}>{poNo(o.number)}</Link> <span className="k">{o.supplier.name}</span> <OrderStatusPill status={o.status} /></div>)}
                        {r.orders.length === 0 ? <div className="k">{r.status === "OPEN" ? "Waiting for quotes" : r.status.toLowerCase()}</div> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className="card">
            <h2 style={{ marginBottom: 8 }}>Issued from the store</h2>
            {k.movements.length === 0 ? <div className="k">Nothing issued yet.</div> : (
              <table className="list">
                <tbody>
                  {k.movements.map((m) => (
                    <tr key={m.id}>
                      <td>{m.item.name}<div className="k">{day(m.at)} {m.at.toTimeString().slice(0, 5)} · {m.user.name}{m.reason?.includes("collected by") ? ` · ${m.reason.split("collected by ")[1]}` : ""}</div></td>
                      <td className="r">{qty(-m.quantity)} {m.item.unit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}
