"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/dashboard", label: "Automation results" },
  { href: "/overview", label: "Account growth" },
] as const;

/** One Results area, two views of the numbers. */
export default function ResultsTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Results sections" className="print:hidden">
      <ul className="flex gap-1 border-b border-border">
        {TABS.map((tab) => {
          const active = pathname === tab.href;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`inline-flex min-h-11 items-center border-b-2 px-4 text-sm font-medium ${
                  active
                    ? "border-black text-foreground"
                    : "border-transparent text-muted hover:text-foreground"
                }`}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
