import { Shell } from "@/components/Shell";
import { canApprove, requireBuyer } from "@/lib/auth";
import { db } from "@/lib/db";

export default async function BuyerLayout({ children }: { children: React.ReactNode }) {
  const { user, business } = await requireBuyer();
  const [quotesWaiting, approvals] = await Promise.all([
    db.request.count({ where: { buyerId: business.id, status: "OPEN", quotes: { some: { status: "SUBMITTED" } } } }),
    canApprove(user) ? db.purchaseOrder.count({ where: { buyerId: business.id, status: "AWAITING_APPROVAL" } }) : 0,
  ]);
  const items = [
    { href: "/dashboard", label: "Home" },
    { href: "/requests", label: "Requests", count: quotesWaiting },
    { href: "/suppliers", label: "Suppliers" },
    { href: "/orders", label: "Orders" },
    { href: "/received", label: "Goods received" },
    ...(canApprove(user) ? [{ href: "/approvals", label: "Approvals", count: approvals }] : []),
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
