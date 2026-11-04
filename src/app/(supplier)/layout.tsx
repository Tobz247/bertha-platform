import { Shell } from "@/components/Shell";
import { requireSupplier } from "@/lib/auth";
import { db } from "@/lib/db";

export default async function SupplierLayout({ children }: { children: React.ReactNode }) {
  const { user, business } = await requireSupplier();
  const toAccept = await db.purchaseOrder.count({ where: { supplierId: business.id, status: "AWAITING_SUPPLIER" } });
  const items = [
    { href: "/supplier", label: "Requests for quotes" },
    { href: "/supplier/orders", label: "Orders", count: toAccept },
    { href: "/supplier/profile", label: "Business profile" },
    ...(user.isPlatformAdmin ? [{ href: "/admin", label: "Platform admin" }] : []),
  ];
  return (
    <Shell items={items} businessName={business.name} userName={user.name}>
      {children}
    </Shell>
  );
}
