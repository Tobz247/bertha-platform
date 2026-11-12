import Link from "next/link";
import { notFound } from "next/navigation";
import { cutPortions, recordMovement, updateStockItem } from "@/app/actions/buyer";
import { Flash } from "@/components/Flash";
import { PageHead, Pill } from "@/components/ui";
import { can, requireBuyer } from "@/lib/auth";
import { db } from "@/lib/db";
import { day, LOCATION_LABEL, naira, poNo, qty } from "@/lib/format";
import { areaOnHand } from "@/lib/kitchen-rules";
import { expiringBatches, isKg, isLow, portionResult, stockOnHand } from "@/lib/rules";

export const metadata = { title: "Stock item" };

const MOVE_LABEL: Record<string, string> = { RECEIVED: "Received", ADDED: "Added", USED: "Used", WASTED: "Wasted", COUNT_ADJUST: "Count", SOLD: "Dishes sold", PORTIONED: "Portioning", ISSUED: "Issued to kitchen" };

export default async function StockItemPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const { user, business } = await requireBuyer();
  const canEdit = can(user, "stock");
  const kitchenOnly = !canEdit && can(user, "kitchen_request");
  const item = await db.stockItem.findFirst({
    where: { id, buyerId: business.id },
    include: {
      batches: { where: { quantity: { gt: 0 } }, orderBy: [{ expiresAt: "asc" }, { receivedAt: "asc" }] },
      movements: { orderBy: { at: "desc" }, take: 40, include: { user: true, order: true, kitchenRequest: true } },
      cutFrom: { orderBy: { at: "desc" }, take: 20, include: { toItem: true, user: true } },
      cutInto: { orderBy: { at: "desc" }, take: 20, include: { fromItem: true, user: true } },
    },
  });
  if (!item) notFound();
  const onHand = stockOnHand(item.batches);
  const inStore = areaOnHand(item.batches, "STORE");
  const inKitchen = areaOnHand(item.batches, "KITCHEN");
  const expiring = new Set(expiringBatches(item.batches, 3).map((b) => b.id));

  return (
    <>
      <PageHead
        title={item.name}
        eyebrow={`${item.unit} · ${LOCATION_LABEL[item.location]}`}
        backHref="/stock"
        backLabel="Stock"
        action={isLow(onHand, item.reorderLevel) && can(user, "requests") ? <Link className="btn" href={`/requests/new?items=${item.id}`}>Reorder</Link> : null}
      />
      <Flash sp={sp} />
      <div className="grid2">
        <div className="stack">
          <div className="card row">
            <div><div className="k">On hand</div><div className="big">{qty(onHand)} {item.unit}</div>{inKitchen > 0 ? <div className="k">{qty(inStore)} in the store · {qty(inKitchen)} issued to the kitchen</div> : null}</div>
            <div style={{ textAlign: "right" }} className="k">{item.lastUnitPrice ? `Last bought at ${naira(item.lastUnitPrice)}/${item.unit}` : "No purchase price yet"}<br />{isLow(onHand, item.reorderLevel) ? <Pill tone="red">Low</Pill> : null}</div>
          </div>

          {canEdit || kitchenOnly ? (
          <form action={recordMovement} className="card stack">
            <input type="hidden" name="itemId" value={item.id} />
            <h2>Record a change</h2>
            <div className="fields">
              <label className="f">What happened
                <select name="type" id="type" defaultValue="USED">
                  <option value="USED">Used in the kitchen</option>
                  <option value="WASTED">Wasted</option>
                  {canEdit ? <option value="ADDED">Bought or added (goes into the store)</option> : null}
                  <option value="COUNT">Stock count (set the real amount)</option>
                </select>
              </label>
              {kitchenOnly ? <input type="hidden" name="area" value="KITCHEN" /> : (
                <label className="f">Where
                  <select name="area" id="area" defaultValue={inKitchen > 0 ? "KITCHEN" : "STORE"}>
                    <option value="STORE">Store</option>
                    <option value="KITCHEN">Kitchen</option>
                  </select>
                </label>
              )}
              <label className="f">Quantity ({item.unit})<input type="number" name="quantity" id="quantity" min="0" step="any" required /></label>
            </div>
            <div className="fields">
              <label className="f">Waste reason <span className="hint">if wasted</span>
                <select name="reason" id="reason" defaultValue="Spoiled"><option>Spoiled</option><option>Expired</option><option>Damaged</option><option>Other</option></select>
              </label>
              <label className="f">Use by <span className="hint">if added</span><input type="date" name="expiresAt" id="expiresAt" /></label>
            </div>
            <p className="k" style={{ margin: 0 }}>Usage and waste come out of the batch that expires first, from the place you choose (then the other one if it runs out). A count sets the amount in that place only.</p>
            <div><button className="btn" type="submit">Save</button></div>
          </form>
          ) : null}

          {canEdit ? <>

          {item.unit !== "piece" ? (
            <form action={cutPortions} className="card stack" id="portion">
              <input type="hidden" name="itemId" value={item.id} />
              <h2>Cut into portions</h2>
              <p className="k" style={{ margin: 0 }}>For meat, chicken and fish: cut, count and weigh the pieces. The kitchen then draws pieces, so any missing piece shows up in counts.</p>
              <div className="fields">
                <label className="f">Amount cut ({item.unit})<input type="number" name="inputQty" id="inputQty" min="0" step="any" max={onHand} required /></label>
                <label className="f">Pieces it made<input type="number" name="pieces" id="pieces" min="1" step="1" required /></label>
                <label className="f">Weight of all pieces (kg) <span className="hint">after trimming</span><input type="number" name="totalWeight" id="totalWeight" min="0" step="any" /></label>
              </div>
              <div className="fields">
                <label className="f">Name for the pieces<input type="text" name="portionName" id="portionName" defaultValue={item.cutFrom[0]?.toItem.name ?? `${item.name}, pieces`} /></label>
                <label className="f">Note <span className="hint">optional</span><input type="text" name="note" id="note" placeholder="e.g. cut for Saturday banquet" /></label>
              </div>
              <div><button className="btn" type="submit">Record portioning</button></div>
            </form>
          ) : null}

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
          </> : kitchenOnly ? null : <div className="alert info">Your role can see stock but not change it. A store keeper or manager records changes.</div>}
        </div>

        <div className="stack">
          {item.cutFrom.length || item.cutInto.length ? (
            <div className="card">
              <h2 style={{ marginBottom: 8 }}>Portioning</h2>
              <table className="list">
                <thead><tr><th>Date</th><th className="r">Cut</th><th className="r">Pieces</th><th className="r">Avg piece</th><th className="r">Yield</th><th className="r">Cost a piece</th></tr></thead>
                <tbody>
                  {[...item.cutFrom.map((r) => ({ r, from: item, to: r.toItem })), ...item.cutInto.map((r) => ({ r, from: r.fromItem, to: item }))]
                    .sort((a, b) => b.r.at.getTime() - a.r.at.getTime())
                    .map(({ r, from, to }) => {
                      const x = portionResult({ inputQty: r.inputQty, inputUnit: from.unit, pieces: r.pieces, totalWeightKg: r.totalWeight, unitPrice: null });
                      return (
                        <tr key={r.id}>
                          <td>{day(r.at)}<div className="k">{r.user.name}{from.id !== item.id ? ` · from ${from.name}` : to.id !== item.id ? ` · into ${to.name}` : ""}</div></td>
                          <td className="r">{qty(r.inputQty)} {from.unit}</td>
                          <td className="r t">{r.pieces}</td>
                          <td className="r">{x.avgPieceGrams ? `${x.avgPieceGrams} g` : "—"}</td>
                          <td className="r">{x.yieldPct != null ? <Pill tone={x.yieldPct < 75 ? "red" : x.yieldPct < 85 ? "amber" : "green"}>{x.yieldPct}%</Pill> : "—"}</td>
                          <td className="r">{r.cost ? naira(r.cost / r.pieces) : "—"}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
              {isKg(item.unit) ? <p className="k" style={{ marginBottom: 0 }}>Yield is the weight of the pieces against the weight cut. A falling yield means more is lost to trimming, or pieces are going missing before weighing.</p> : null}
            </div>
          ) : null}

          <div className="card">
            <h2 style={{ marginBottom: 8 }}>Batches</h2>
            {item.batches.length === 0 ? <p className="k">None in stock.</p> : (
              <table className="list">
                <thead><tr><th>Received</th><th>Where</th><th>Use by</th><th className="r">Left</th></tr></thead>
                <tbody>{item.batches.map((b) => <tr key={b.id}><td>{day(b.receivedAt)}</td><td>{b.area === "KITCHEN" ? "Kitchen" : "Store"}</td><td>{b.expiresAt ? day(b.expiresAt) : "—"} {expiring.has(b.id) ? <Pill tone="amber">Soon</Pill> : null}</td><td className="r">{qty(b.quantity)}</td></tr>)}</tbody>
              </table>
            )}
          </div>
          <div className="card">
            <h2 style={{ marginBottom: 8 }}>History</h2>
            <table className="list">
              <tbody>
                {item.movements.map((m) => (
                  <tr key={m.id}>
                    <td>{MOVE_LABEL[m.type]}{m.reason ? <span className="k"> · {m.reason}</span> : null}{m.order ? <> · <Link className="mono" href={`/orders/${m.order.id}`}>{poNo(m.order.number)}</Link></> : null}{m.kitchenRequest ? <> · <Link href={`/kitchen/${m.kitchenRequest.id}`}>view request</Link></> : null}<div className="k">{day(m.at)} · {m.user.name}</div></td>
                    {m.type === "ISSUED" ? <td className="r k">{qty(-m.quantity)} to kitchen</td> : <td className="r" style={{ color: m.quantity < 0 ? "var(--red)" : undefined }}>{m.quantity > 0 ? "+" : ""}{qty(m.quantity)}</td>}
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
