import Link from "next/link";
import { notFound } from "next/navigation";
import { recordMovement, updateStockItem } from "@/app/actions/buyer";
import { Flash } from "@/components/Flash";
import { PageHead, Pill } from "@/components/ui";
import { requireBuyer } from "@/lib/auth";
import { db } from "@/lib/db";
import { day, LOCATION_LABEL, naira, poNo, qty } from "@/lib/format";
import { expiringBatches, isLow, stockOnHand } from "@/lib/rules";

export const metadata = { title: "Stock item" };

const MOVE_LABEL: Record<string, string> = { RECEIVED: "Received", ADDED: "Added", USED: "Used", WASTED: "Wasted", COUNT_ADJUST: "Count" };

export default async function StockItemPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const { business } = await requireBuyer();
  const item = await db.stockItem.findFirst({
    where: { id, buyerId: business.id },
    include: {
      batches: { where: { quantity: { gt: 0 } }, orderBy: [{ expiresAt: "asc" }, { receivedAt: "asc" }] },
      movements: { orderBy: { at: "desc" }, take: 40, include: { user: true, order: true } },
    },
  });
  if (!item) notFound();
  const onHand = stockOnHand(item.batches);
  const expiring = new Set(expiringBatches(item.batches, 3).map((b) => b.id));

  return (
    <>
      <PageHead
        title={item.name}
        eyebrow={`${item.unit} · ${LOCATION_LABEL[item.location]}`}
        backHref="/stock"
        backLabel="Stock"
        action={isLow(onHand, item.reorderLevel) ? <Link className="btn" href={`/requests/new?items=${item.id}`}>Reorder</Link> : null}
      />
      <Flash sp={sp} />
      <div className="grid2">
        <div className="stack">
          <div className="card row">
            <div><div className="k">On hand</div><div className="big">{qty(onHand)} {item.unit}</div></div>
            <div style={{ textAlign: "right" }} className="k">{item.lastUnitPrice ? `Last bought at ${naira(item.lastUnitPrice)}/${item.unit}` : "No purchase price yet"}<br />{isLow(onHand, item.reorderLevel) ? <Pill tone="red">Low</Pill> : null}</div>
          </div>

          <form action={recordMovement} className="card stack">
            <input type="hidden" name="itemId" value={item.id} />
            <h2>Record a change</h2>
            <div className="fields">
              <label className="f">What happened
                <select name="type" id="type" defaultValue="USED">
                  <option value="USED">Used in the kitchen</option>
                  <option value="WASTED">Wasted</option>
                  <option value="ADDED">Bought or added</option>
                  <option value="COUNT">Stock count (set the real amount)</option>
                </select>
              </label>
              <label className="f">Quantity ({item.unit})<input type="number" name="quantity" id="quantity" min="0" step="any" required /></label>
            </div>
            <div className="fields">
              <label className="f">Waste reason <span className="hint">if wasted</span>
                <select name="reason" id="reason" defaultValue="Spoiled"><option>Spoiled</option><option>Expired</option><option>Damaged</option><option>Other</option></select>
              </label>
              <label className="f">Use by <span className="hint">if added</span><input type="date" name="expiresAt" id="expiresAt" /></label>
            </div>
            <p className="k" style={{ margin: 0 }}>Usage and waste come out of the batch that expires first.</p>
            <div><button className="btn" type="submit">Save</button></div>
          </form>

          <form action={updateStockItem} className="card stack">
            <input type="hidden" name="itemId" value={item.id} />
            <h2>Reorder settings</h2>
            <div className="fields">
              <label className="f">Reorder at or below<input type="number" name="reorderLevel" id="reorderLevel" min="0" step="any" defaultValue={item.reorderLevel} /></label>
              <label className="f">Usual order<input type="number" name="reorderQty" id="reorderQty" min="0" step="any" defaultValue={item.reorderQty} /></label>
              <label className="f">Stored in
                <select name="location" id="location" defaultValue={item.location}><option value="DRY_STORE">Dry store</option><option value="COLD_ROOM">Cold room</option><option value="FREEZER">Freezer</option><option value="OTHER">Other</option></select>
              </label>
            </div>
            <div><button className="btn sec" type="submit">Save settings</button></div>
          </form>
        </div>

        <div className="stack">
          <div className="card">
            <h2 style={{ marginBottom: 8 }}>Batches</h2>
            {item.batches.length === 0 ? <p className="k">None in stock.</p> : (
              <table className="list">
                <thead><tr><th>Received</th><th>Use by</th><th className="r">Left</th></tr></thead>
                <tbody>{item.batches.map((b) => <tr key={b.id}><td>{day(b.receivedAt)}</td><td>{b.expiresAt ? day(b.expiresAt) : "—"} {expiring.has(b.id) ? <Pill tone="amber">Soon</Pill> : null}</td><td className="r">{qty(b.quantity)}</td></tr>)}</tbody>
              </table>
            )}
          </div>
          <div className="card">
            <h2 style={{ marginBottom: 8 }}>History</h2>
            <table className="list">
              <tbody>
                {item.movements.map((m) => (
                  <tr key={m.id}>
                    <td>{MOVE_LABEL[m.type]}{m.reason ? <span className="k"> · {m.reason}</span> : null}{m.order ? <> · <Link className="mono" href={`/orders/${m.order.id}`}>{poNo(m.order.number)}</Link></> : null}<div className="k">{day(m.at)} · {m.user.name}</div></td>
                    <td className="r" style={{ color: m.quantity < 0 ? "var(--red)" : undefined }}>{m.quantity > 0 ? "+" : ""}{qty(m.quantity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
