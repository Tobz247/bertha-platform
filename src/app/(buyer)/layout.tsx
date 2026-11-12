import { Shell } from "@/components/Shell";
import { can, requireBuyer } from "@/lib/auth";
import { db } from "@/lib/db";

export default async function BuyerLayout({ children }: { children: React.ReactNode }) {
  const { user, business } = await requireBuyer();
  const [quotesWaiting, approvals, kitchenWaiting] = await Promise.all([
    !can(user, "requests") ? 0 : db.request.count({ where: { buyerId: business.id, status: "OPEN", quotes: { some: { status: "SUBMITTED" } } } }),
    can(user, "approve") ? db.purchaseOrder.count({ where: { buyerId: business.id, status: "AWAITING_APPROVAL" } }) : 0,
    // Reviewers see requests waiting for review; the store sees approved ones still to issue.
    db.kitchenRequest.count({
      where: {
        buyerId: business.id,
        status: { in: [...(can(user, "review_kitchen_request") ? ["SUBMITTED" as const] : []), ...(can(user, "stock") ? ["APPROVED" as const] : [])] },
      },
    }),
  ]);
  const items = [
    { href: "/dashboard", label: "Home" },
    { href: "/kitchen", label: "Kitchen requests", count: kitchenWaiting },
    ...(can(user, "requests") ? [{ href: "/requests", label: "Requests", count: quotesWaiting }] : []),
    { href: "/suppliers", label: "Suppliers" },
    ...(can(user, "view_orders") ? [{ href: "/orders", label: "Orders" }, { href: "/received", label: "Goods received" }] : []),
    ...(can(user, "approve") ? [{ href: "/approvals", label: "Approvals", count: approvals }] : []),
    { href: "/stock", label: "Stock" },
    { href: "/recipes", label: "Recipes" },
    { href: "/prices", label: "Prices" },
    { href: "/settings", label: "Settings" },
    ...(user.isPlatformAdmin ? [{ href: "/admin", label: "Platform admin" }] : []),
  ];
  return (
    <Shell items={items} businessName={business.name} userName={user.name}>
      {children}
    </Shell>
  );
}
