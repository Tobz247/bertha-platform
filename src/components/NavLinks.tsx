"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = { href: string; label: string; count?: number };

export function NavLinks({ items, className }: { items: NavItem[]; className?: string }) {
  const path = usePathname();
  return (
    <nav className={className}>
      {items.map((i) => {
        const active = path === i.href || (i.href !== "/" && path.startsWith(i.href + "/"));
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
