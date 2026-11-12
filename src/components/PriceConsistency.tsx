import Link from "next/link";
import type { ConsistencyReport, Difference, ItemReport } from "@/lib/consistency";
import { day, naira } from "@/lib/format";
import { CONSISTENCY_DAYS, DIFFERENCE_PCT, STEADINESS, changeTone } from "@/lib/supplier-rules";
import { Pill } from "./ui";

/** Supplier-level consistency: green consistent, amber some changes, red inconsistent. */
export function ConsistencyPill({ report }: { report: ConsistencyReport | undefined }) {
  if (!report?.score) return <Pill tone="grey">No price history yet</Pill>;
  const s = report.score;
  return <Pill tone={s.tone}>{s.label} · {s.score}/100</Pill>;
}

/** The last change to a list price, coloured red (up) or green (down), or grey when unchanged. */
export function ChangeTag({ item, days = 30, quiet = false }: { item: ItemReport | undefined; days?: number; quiet?: boolean }) {
  const c = item?.lastChange;
  const none = quiet ? null : <Pill tone="grey">No change</Pill>;
  if (!c || Date.now() - c.at.getTime() > days * 86400000) return none;
  const tone = changeTone(c.pct);
  if (tone === "grey") return none;
  return (
    <span title={`${naira(c.from)} → ${naira(c.to)} on ${day(c.at)}`}>
      <Pill tone={tone}>{c.pct > 0 ? "▲" : "▼"} {Math.abs(c.pct)}% · {day(c.at)}</Pill>
    </span>
  );
}

function SteadinessPill({ item }: { item: ItemReport }) {
  const s = STEADINESS[item.spread.level];
  return <Pill tone={s.tone}>{s.label}{item.spread.level !== "new" ? ` · ${item.spread.spreadPct}%` : ""}</Pill>;
}

/**
 * Item-by-item consistency table, with the prices that differed from the supplier's own list.
 * `differences` should already be filtered to what the viewer may see.
 */
export function ConsistencyPanel({ report, differences, otherDifferences = 0, linkRefs = false }: { report: ConsistencyReport | undefined; differences: Difference[]; otherDifferences?: number; linkRefs?: boolean }) {
  if (!report || report.items.length === 0) return <div className="k">No prices to compare yet.</div>;
  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: "flex-start" }}>
        <ConsistencyPill report={report} />
        <span className="k">Last {CONSISTENCY_DAYS} days · {report.recentChanges} price change{report.recentChanges === 1 ? "" : "s"} in the last 2 weeks</span>
      </div>
      <div className="table-wrap">
        <table className="list">
          <thead><tr><th>Item</th><th className="r">List price</th><th>Last change</th><th className="r">Range</th><th>Consistency</th></tr></thead>
          <tbody>
            {report.items.map((i) => (
              <tr key={i.key}>
                <td><span className="t">{i.name}</span><div className="k">per {i.unit}{i.changes ? ` · ${i.changes} change${i.changes > 1 ? "s" : ""}` : ""}{i.itemId ? "" : " · not on list now"}</div></td>
                <td className="r">{i.current != null ? naira(i.current) : "—"}</td>
                <td><ChangeTag item={i} /></td>
                <td className="r k">{i.spread.level === "new" ? "—" : i.spread.low === i.spread.high ? naira(i.spread.low) : `${naira(i.spread.low)}–${naira(i.spread.high)}`}</td>
                <td><SteadinessPill item={i} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {differences.length || otherDifferences ? (
        <div className="stack" style={{ gap: 6 }}>
          <h3>Price differences</h3>
          <p className="k" style={{ margin: 0 }}>Prices charged or quoted more than {DIFFERENCE_PCT}% away from this supplier&apos;s own list price at the time.</p>
          {differences.length ? (
            <div className="table-wrap">
              <table className="list">
                <thead><tr><th>Item</th><th>Where</th><th className="r">Their list</th><th className="r">Charged / quoted</th><th className="r">Difference</th></tr></thead>
                <tbody>
                  {differences.map((d, n) => (
                    <tr key={n}>
                      <td><span className="t">{d.name}</span><div className="k">per {d.unit} · {day(d.at)}</div></td>
                      <td style={{ whiteSpace: "nowrap" }}>{linkRefs ? <Link href={d.href}>{d.ref}</Link> : d.ref} <span className="k">{d.kind === "quote" ? "quote" : "order"}</span></td>
                      <td className="r">{naira(d.listed)}</td>
                      <td className="r">{naira(d.charged)}</td>
                      <td className="r"><Pill tone={d.tone}>{d.pct > 0 ? "+" : ""}{d.pct}%</Pill></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {otherDifferences ? <div className="k">{otherDifferences} more with other buyers on Bertha.</div> : null}
        </div>
      ) : null}
    </div>
  );
}
