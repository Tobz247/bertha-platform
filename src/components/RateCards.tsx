import { day } from "@/lib/format";
import { RATE_CARD_MAX_BYTES, fileSize } from "@/lib/supplier-rules";

export type RateCardRow = { id: string; fileName: string; size: number; validFrom: Date | null; note: string | null; uploadedBy: string; createdAt: Date };

/** Uploaded rate cards, newest first. Pass `remove` (a server action) to show a Remove button. */
export function RateCardList({ cards, remove, hidden }: { cards: RateCardRow[]; remove?: (fd: FormData) => Promise<void>; hidden?: Record<string, string> }) {
  if (!cards.length) return <div className="k">No rate cards uploaded yet.</div>;
  return (
    <div className="table-wrap">
      <table className="list">
        <tbody>
          {cards.map((c, n) => (
            <tr key={c.id}>
              <td>
                <a className="t" href={`/rate-cards/${c.id}`} target="_blank" rel="noreferrer">{c.fileName}</a>
                {n === 0 ? <> <span className="pill green">Latest</span></> : null}
                <div className="k">{c.validFrom ? `Prices from ${day(c.validFrom)} · ` : ""}uploaded {day(c.createdAt)} by {c.uploadedBy} · {fileSize(c.size)}</div>
                {c.note ? <div className="k">{c.note}</div> : null}
              </td>
              {remove ? (
                <td className="r">
                  <form action={remove}>
                    {Object.entries(hidden ?? {}).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
                    <input type="hidden" name="rateCardId" value={c.id} />
                    <button className="btn small sec" type="submit">Remove</button>
                  </form>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Upload form for a rate card. */
export function RateCardUpload({ action, hidden }: { action: (fd: FormData) => Promise<void>; hidden?: Record<string, string> }) {
  return (
    <form action={action} className="stack" style={{ maxWidth: "none" }}>
      {Object.entries(hidden ?? {}).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <label className="f">File <span className="hint">PDF, photo, Excel, CSV or Word, up to {fileSize(RATE_CARD_MAX_BYTES)}</span>
        <input type="file" name="file" id="file" required accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,.csv,.txt,.xlsx,.xls,.docx" />
      </label>
      <div className="fields">
        <label className="f">Prices valid from <span className="hint">optional</span><input type="date" name="validFrom" id="validFrom" /></label>
        <label className="f">Note <span className="hint">optional</span><input type="text" name="note" id="note" placeholder="e.g. December rates" /></label>
      </div>
      <label className="check"><input type="checkbox" name="apply" /> Update the price list from this file (CSV only: one line per item as Item, unit, price)</label>
      <div><button className="btn sec" type="submit">Upload rate card</button></div>
    </form>
  );
}
