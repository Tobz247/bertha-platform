import Link from "next/link";
import { recordDishSales } from "@/app/actions/buyer";
import { Flash } from "@/components/Flash";
import { Empty, PageHead, Pill } from "@/components/ui";
import { can, requireBuyer } from "@/lib/auth";
import { db } from "@/lib/db";
import { dateInput, naira, qty } from "@/lib/format";
import { costedRecipes } from "@/lib/recipes";
import { addDays, FOOD_COST_TARGET, usageBreakdown } from "@/lib/rules";

export const metadata = { title: "Recipes" };

export default async function Recipes({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { user, business } = await requireBuyer();
  const since = addDays(new Date(), -7);
  const [recipes, moves, soldWeek] = await Promise.all([
    costedRecipes(business.id),
    db.stockMovement.findMany({
      where: { item: { buyerId: business.id }, at: { gte: since }, type: { in: ["SOLD", "USED", "ISSUED", "WASTED", "COUNT_ADJUST"] } },
      include: { item: true },
    }),
    db.dishSale.groupBy({ by: ["recipeId"], where: { recipe: { buyerId: business.id }, soldOn: { gte: since } }, _sum: { quantity: true } }),
  ]);
  const soldBy = new Map(soldWeek.map((s) => [s.recipeId, s._sum.quantity ?? 0]));

  const byItem = new Map<string, { name: string; unit: string; price: number | null; moves: { type: string; quantity: number }[] }>();
  for (const m of moves) {
    const g = byItem.get(m.itemId) ?? { name: m.item.name, unit: m.item.unit, price: m.item.lastUnitPrice, moves: [] };
    g.moves.push(m);
    byItem.set(m.itemId, g);
  }
  const usage = [...byItem.values()]
    .map((g) => ({ ...g, u: usageBreakdown(g.moves) }))
    .map((g) => ({ ...g, lost: g.u.wasted + Math.max(0, g.u.unexplained) }))
    .sort((a, b) => b.lost * (b.price ?? 0) - a.lost * (a.price ?? 0));
  const lostValue = usage.reduce((s, g) => s + g.lost * (g.price ?? 0), 0);

  return (
    <>
      <PageHead title="Recipes" eyebrow="What each dish costs to make, and where your stock goes" action={can(user, "recipes") ? <Link className="btn sec" href="/recipes/new">Add a dish</Link> : null} />
      <Flash sp={sp} />

      {recipes.length === 0 ? (
        <Empty>Add your dishes and their ingredients from stock. Bertha works out the cost of each plate from what you last paid, and takes ingredients out of stock when you record sales.</Empty>
      ) : (
        <form action={recordDishSales}>
          <div className="card table-wrap" style={{ padding: 0 }}>
            <table className="list">
              <thead><tr><th>Dish</th><th className="r">Cost a plate</th><th className="r">Menu price</th><th className="r">Food cost</th><th className="r">Sold, 7 days</th><th className="r">Sold today</th></tr></thead>
              <tbody>
                {recipes.map((r) => (
                  <tr key={r.id}>
                    <td><Link className="t" href={`/recipes/${r.id}`}>{r.name}</Link><div className="k">{r.ingredients.length} ingredient{r.ingredients.length === 1 ? "" : "s"}{r.cost.missing ? ` · ${r.cost.missing} with no price yet` : ""}</div></td>
                    <td className="r">{naira(r.cost.perPortion)}</td>
                    <td className="r">{naira(r.menuPrice)}<div className="k">{naira(r.margin)} margin</div></td>
                    <td className="r">{r.pct == null ? "—" : <Pill tone={r.pct > FOOD_COST_TARGET ? "red" : "green"}>{r.pct}%</Pill>}</td>
                    <td className="r">{soldBy.get(r.id) ?? 0}</td>
                    <td className="r"><input type="number" name={`sold_${r.id}`} min="0" step="1" placeholder="0" aria-label={`Portions of ${r.name} sold`} style={{ width: 80, textAlign: "right" }} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row" style={{ marginTop: 12, gap: 12, flexWrap: "wrap" }}>
            <span className="k">Food cost above {FOOD_COST_TARGET}% is flagged. Recording sales takes the ingredients out of stock, oldest batch first.</span>
            <span className="btns" style={{ alignItems: "center" }}>
              <label className="k" htmlFor="soldOn">Sold on</label>
              <input type="date" name="soldOn" id="soldOn" defaultValue={dateInput(new Date())} max={dateInput(new Date())} style={{ width: 160 }} />
              <button className="btn" type="submit" disabled={!can(user, "recipes")}>Record sales</button>
            </span>
          </div>
        </form>
      )}

      <h2 style={{ margin: "28px 0 4px" }}>Where stock went, last 7 days</h2>
      <p className="k" style={{ marginTop: 0 }}>
        Dishes sold is what your recipes say you should have used. Wasted and missing in counts is stock you paid for that never reached a plate{lostValue ? <>: about <b>{naira(lostValue)}</b> this week</> : ""}.
      </p>
      {usage.length === 0 ? <Empty>Nothing yet. Record sales, usage, waste and stock counts to see this.</Empty> : (
        <div className="card table-wrap" style={{ padding: 0 }}>
          <table className="list">
            <thead><tr><th>Item</th><th className="r">Dishes sold</th><th className="r">Used, other</th><th className="r">Wasted</th><th className="r">Missing in counts</th><th className="r">Lost value</th></tr></thead>
            <tbody>
              {usage.map((g) => (
                <tr key={g.name + g.unit}>
                  <td className="t">{g.name}<div className="k">{g.unit}</div></td>
                  <td className="r">{qty(g.u.sold)}</td>
                  <td className="r">{qty(g.u.used)}</td>
                  <td className="r">{g.u.wasted ? qty(g.u.wasted) : "—"}</td>
                  <td className="r">{g.u.unexplained > 0 ? <span style={{ color: "var(--red)" }}>{qty(g.u.unexplained)}</span> : g.u.unexplained < 0 ? <span className="k">+{qty(-g.u.unexplained)} found</span> : "—"}</td>
                  <td className="r">{g.lost && g.price ? naira(g.lost * g.price) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
