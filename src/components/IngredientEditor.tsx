"use client";

import { useState } from "react";

type Item = { id: string; name: string; unit: string; price: number | null };
type Row = { itemId: string; quantity: string };

const naira = (n: number) => "₦" + Math.round(n).toLocaleString("en-NG");

/** Ingredient rows for a recipe, with a running cost. Posts itemId[] and quantity[]. */
export function IngredientEditor({ items, initial, portions }: { items: Item[]; initial: Row[]; portions?: number }) {
  const [rows, setRows] = useState<Row[]>(initial.length ? initial : [{ itemId: "", quantity: "" }]);
  const byId = new Map(items.map((i) => [i.id, i]));
  const set = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const cost = rows.reduce((s, r) => s + (Number(r.quantity) || 0) * (byId.get(r.itemId)?.price ?? 0), 0);
  return (
    <div className="lines">
      <div className="line ing k" aria-hidden="true"><span>Stock item</span><span>Amount</span><span>Cost</span><span /></div>
      {rows.map((r, i) => {
        const it = byId.get(r.itemId);
        return (
          <div className="line ing" key={i}>
            <select name="itemId" id={`itemId-${i}`} aria-label="Stock item" value={r.itemId} onChange={(e) => set(i, { itemId: e.target.value })}>
              <option value="">Choose…</option>
              {items.map((o) => <option key={o.id} value={o.id}>{o.name} ({o.unit})</option>)}
            </select>
            <input type="number" name="quantity" id={`iq-${i}`} aria-label={`Amount${it ? ` in ${it.unit}` : ""}`} min="0" step="any" placeholder={it?.unit ?? ""} value={r.quantity} onChange={(e) => set(i, { quantity: e.target.value })} />
            <span className="k" style={{ textAlign: "right" }}>{it ? (it.price == null ? "no price" : naira((Number(r.quantity) || 0) * it.price)) : ""}</span>
            <button type="button" className="x" aria-label="Remove ingredient" disabled={rows.length === 1} onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>×</button>
          </div>
        );
      })}
      <div className="row">
        <button type="button" className="btn sec small" onClick={() => setRows((rs) => [...rs, { itemId: "", quantity: "" }])}>Add ingredient</button>
        <span className="k">Batch cost {naira(cost)}{portions && portions > 1 ? ` · ${naira(cost / portions)} a portion` : ""}</span>
      </div>
    </div>
  );
}
