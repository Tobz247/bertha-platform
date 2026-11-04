"use client";

import { useState } from "react";

type Line = { product: string; quantity: string; unit: string };

/** Editable list of request items. Posts product[], quantity[] and unit[] fields. */
export function LineEditor({ initial, units }: { initial: Line[]; units: string[] }) {
  const [lines, setLines] = useState<Line[]>(initial.length ? initial : [{ product: "", quantity: "1", unit: units[0] ?? "kg" }]);
  const set = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  return (
    <div className="lines">
      <datalist id="unit-options">{units.map((u) => <option key={u} value={u} />)}</datalist>
      <div className="line k" aria-hidden="true"><span>Item</span><span>Quantity</span><span>Unit</span><span /></div>
      {lines.map((l, i) => (
        <div className="line" key={i}>
          <input type="text" name="product" id={`product-${i}`} aria-label="Item" placeholder="e.g. Tomatoes" value={l.product} onChange={(e) => set(i, { product: e.target.value })} />
          <input type="number" name="quantity" id={`quantity-${i}`} aria-label="Quantity" min="0" step="any" value={l.quantity} onChange={(e) => set(i, { quantity: e.target.value })} />
          <input type="text" name="unit" id={`unit-${i}`} aria-label="Unit" list="unit-options" value={l.unit} onChange={(e) => set(i, { unit: e.target.value })} />
          <button type="button" className="x" aria-label="Remove item" disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>×</button>
        </div>
      ))}
      <div><button type="button" className="btn sec small" onClick={() => setLines((ls) => [...ls, { product: "", quantity: "1", unit: units[0] ?? "kg" }])}>Add item</button></div>
    </div>
  );
}
