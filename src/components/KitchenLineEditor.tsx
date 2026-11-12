"use client";

import { useState } from "react";

type Line = { product: string; quantity: string; unit: string };
type StockOption = { name: string; unit: string; onHand: number };

/**
 * Items for a kitchen request. Suggests items already in the store (with what's on hand)
 * and fills in the unit when one is picked. Posts product[], quantity[] and unit[].
 */
export function KitchenLineEditor({ stock, units }: { stock: StockOption[]; units: string[] }) {
  const blank = { product: "", quantity: "1", unit: "" };
  const [lines, setLines] = useState<Line[]>([blank]);
  const set = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const find = (name: string) => stock.find((s) => s.name.toLowerCase() === name.trim().toLowerCase());
  return (
    <div className="lines">
      <datalist id="stock-options">{stock.map((s) => <option key={`${s.name}|${s.unit}`} value={s.name}>{`${s.onHand} ${s.unit} in store`}</option>)}</datalist>
      <datalist id="unit-options">{units.map((u) => <option key={u} value={u} />)}</datalist>
      <div className="line k" aria-hidden="true"><span>Item</span><span>Quantity</span><span>Unit</span><span /></div>
      {lines.map((l, i) => {
        const s = find(l.product);
        return (
          <div key={i}>
            <div className="line">
              <input type="text" name="product" id={`product-${i}`} aria-label="Item" placeholder="e.g. Rice" list="stock-options" value={l.product}
                onChange={(e) => {
                  const hit = find(e.target.value);
                  set(i, hit && !l.unit ? { product: e.target.value, unit: hit.unit } : { product: e.target.value });
                }} />
              <input type="number" name="quantity" id={`quantity-${i}`} aria-label="Quantity" min="0" step="any" value={l.quantity} onChange={(e) => set(i, { quantity: e.target.value })} />
              <input type="text" name="unit" id={`unit-${i}`} aria-label="Unit" list="unit-options" value={l.unit} onChange={(e) => set(i, { unit: e.target.value })} />
              <button type="button" className="x" aria-label="Remove item" disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>×</button>
            </div>
            {s ? <div className="k" style={{ marginTop: 2 }}>{s.onHand} {s.unit} in the store now</div> : l.product.trim() ? <div className="k" style={{ marginTop: 2 }}>Not in the store list yet, procurement will buy it</div> : null}
          </div>
        );
      })}
      <div><button type="button" className="btn sec small" onClick={() => setLines((ls) => [...ls, blank])}>Add item</button></div>
    </div>
  );
}
