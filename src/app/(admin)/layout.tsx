import { Shell } from "@/components/Shell";
import { requireAdmin } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin();
  const items = [
    { href: "/admin", label: "Supplier checks" },
    { href: "/admin/suppliers/new", label: "Add a supplier" },
    { href: "/admin/categories", label: "Categories" },
    { href: "/admin/users", label: "People and roles" },
    { href: "/admin/audit", label: "Audit log" },
    ...(user.business ? [{ href: "/", label: `Back to ${user.business.name}` }] : []),
  ];
  return (
    <Shell items={items} businessName="Platform admin" userName={user.name}>
      {children}
    </Shell>
  );
}
