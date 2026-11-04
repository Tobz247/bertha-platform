import { Shell } from "@/components/Shell";
import { requireAdmin } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin();
  const items = [
    { href: "/admin", label: "Supplier checks" },
    { href: "/admin/categories", label: "Categories" },
  ];
  return (
    <Shell items={items} businessName="Platform admin" userName={user.name}>
      {children}
    </Shell>
  );
}
