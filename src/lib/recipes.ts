import "server-only";
import { db } from "./db";
import { foodCostPct, recipeCost } from "./rules";

export async function costedRecipes(buyerId: string) {
  const recipes = await db.recipe.findMany({
    where: { buyerId },
    include: { ingredients: { include: { item: true } } },
    orderBy: { name: "asc" },
  });
  return recipes.map((r) => {
    const cost = recipeCost(r.ingredients.map((i) => ({ quantity: i.quantity, unitPrice: i.item.lastUnitPrice })), r.portions);
    const pct = foodCostPct(cost.perPortion, r.menuPrice);
    return { ...r, cost, pct, margin: r.menuPrice - cost.perPortion };
  });
}
