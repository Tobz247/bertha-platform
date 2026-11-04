import { saveRecipe } from "@/app/actions/buyer";
import { IngredientEditor } from "@/components/IngredientEditor";

type Item = { id: string; name: string; unit: string; lastUnitPrice: number | null };

export function RecipeForm({
  items,
  recipe,
}: {
  items: Item[];
  recipe?: { id: string; name: string; menuPrice: number; portions: number; notes: string | null; ingredients: { itemId: string; quantity: number }[] };
}) {
  return (
    <form action={saveRecipe} className="card stack" style={{ maxWidth: 680 }}>
      {recipe ? <input type="hidden" name="recipeId" value={recipe.id} /> : null}
      <label className="f">Dish<input type="text" name="name" id="name" required defaultValue={recipe?.name} placeholder="e.g. Jollof rice with chicken" /></label>
      <div className="fields">
        <label className="f">Menu price a plate (₦)<input type="number" name="menuPrice" id="menuPrice" min="1" step="1" required defaultValue={recipe?.menuPrice} /></label>
        <label className="f">Plates these ingredients make<input type="number" name="portions" id="portions" min="0.1" step="any" required defaultValue={recipe?.portions ?? 1} /></label>
      </div>
      <fieldset>
        <legend>Ingredients, from your stock</legend>
        {items.length === 0 ? <p className="k">Add stock items first: ingredients come from your stock list.</p> : (
          <IngredientEditor
            items={items.map((i) => ({ id: i.id, name: i.name, unit: i.unit, price: i.lastUnitPrice }))}
            initial={(recipe?.ingredients ?? []).map((i) => ({ itemId: i.itemId, quantity: String(i.quantity) }))}
            portions={recipe?.portions}
          />
        )}
      </fieldset>
      <label className="f">Notes <span className="hint">optional</span><input type="text" name="notes" id="notes" defaultValue={recipe?.notes ?? ""} /></label>
      <div><button className="btn" type="submit">{recipe ? "Save dish" : "Add dish"}</button></div>
    </form>
  );
}
