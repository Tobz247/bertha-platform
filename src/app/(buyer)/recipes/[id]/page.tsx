import { notFound } from "next/navigation";
import { deleteRecipe } from "@/app/actions/buyer";
import { Flash } from "@/components/Flash";
import { PageHead, Pill } from "@/components/ui";
import { requireBuyer } from "@/lib/auth";
import { db } from "@/lib/db";
import { naira, qty } from "@/lib/format";
import { costedRecipes } from "@/lib/recipes";
import { FOOD_COST_TARGET } from "@/lib/rules";
import { RecipeForm } from "../RecipeForm";

export const metadata = { title: "Dish" };

export default async function RecipePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const { business } = await requireBuyer();
  const [all, items] = await Promise.all([
    costedRecipes(business.id),
    db.stockItem.findMany({ where: { buyerId: business.id }, orderBy: { name: "asc" } }),
  ]);
  const r = all.find((x) => x.id === id);
  if (!r) notFound();
  const p = r.portions > 0 ? r.portions : 1;
  return (
    <>
      <PageHead
        title={r.name}
        eyebrow="Recipe and plate cost"
        backHref="/recipes"
        backLabel="Recipes"
        action={<form action={deleteRecipe}><input type="hidden" name="recipeId" value={r.id} /><button className="btn sec small" type="submit">Remove dish</button></form>}
      />
      <Flash sp={sp} />
      <div className="tiles" style={{ marginBottom: 16 }}>
        <div className="tile"><div className="k">Cost a plate</div><div className="n">{naira(r.cost.perPortion)}</div></div>
        <div className="tile"><div className="k">Menu price</div><div className="n">{naira(r.menuPrice)}</div></div>
        <div className={`tile ${r.pct != null && r.pct > FOOD_COST_TARGET ? "red" : "green"}`}><div className="k">Food cost</div><div className="n">{r.pct == null ? "—" : `${r.pct}%`}</div></div>
        <div className="tile"><div className="k">Margin a plate</div><div className="n">{naira(r.margin)}</div></div>
      </div>
      {r.cost.missing ? <div className="alert warn" style={{ marginBottom: 16 }}>{r.cost.missing} ingredient{r.cost.missing > 1 ? "s have" : " has"} no purchase price yet, so the cost is too low. It fills in after your first delivery.</div> : null}
      <div className="grid2">
        <div className="card">
          <h2 style={{ marginBottom: 8 }}>Cost breakdown, one plate</h2>
          <table className="list">
            <tbody>
              {r.ingredients.map((i) => (
                <tr key={i.id}>
                  <td>{i.item.name}<div className="k">{qty(i.quantity / p)} {i.item.unit} a plate</div></td>
                  <td className="r">{i.item.lastUnitPrice == null ? <Pill tone="amber">no price</Pill> : naira((i.quantity / p) * i.item.lastUnitPrice)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <RecipeForm items={items} recipe={r} />
      </div>
    </>
  );
}
