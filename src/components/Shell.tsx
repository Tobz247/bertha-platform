import { logout } from "@/app/actions/auth";
import { NavLinks, type NavItem } from "./NavLinks";

export function Shell({
  items,
  businessName,
  userName,
  children,
}: {
  items: NavItem[];
  businessName: string;
  userName: string;
  children: React.ReactNode;
}) {
  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">Bertha</div>
        <div className="brand-sub">{businessName}</div>
        <NavLinks items={items} className="nav" />
        <div className="me">
          <div className="t">{userName}</div>
          <form action={logout}><button type="submit">Sign out</button></form>
        </div>
      </aside>
      <div style={{ minWidth: 0 }}>
        <NavLinks items={items} className="mobile-bar" />
        <main className="main">{children}</main>
      </div>
    </div>
  );
}
