"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = { href: string; label: string; count?: number };

export function NavLinks({ items, className }: { items: NavItem[]; className?: string }) {
  const path = usePathname();
  // Highlight only the most specific match, so /admin/audit doesn't also light up /admin.
  const matches = (href: string) => path === href || (href !== "/" && path.startsWith(href + "/"));
  const current = items.filter((i) => matches(i.href)).sort((a, b) => b.href.length - a.href.length)[0]?.href;
  return (
    <nav className={className}>
      {items.map((i) => {
        const active = i.href === current;
        return (
          <Link key={i.href} href={i.href} aria-current={active ? "page" : undefined}>
            <span>{i.label}</span>
            {i.count ? <span className="count">{i.count}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
