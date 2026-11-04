import { Flash } from "@/components/Flash";
import { PageHead } from "@/components/ui";
import { requireBuyer } from "@/lib/auth";
import { db } from "@/lib/db";
import { RecipeForm } from "../RecipeForm";

export const metadata = { title: "Add a dish" };

export default async function NewRecipe({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { business } = await requireBuyer();
  const items = await db.stockItem.findMany({ where: { buyerId: business.id }, orderBy: { name: "asc" } });
  return (
    <>
      <PageHead title="Add a dish" backHref="/recipes" backLabel="Recipes" />
      <Flash sp={sp} />
      <p className="k">Enter the ingredients for one batch and how many plates it makes. Costs use the last price you paid for each item.</p>
      <RecipeForm items={items} />
    </>
  );
}
