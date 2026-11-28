"use client";

/**
 * Phone bottom tab bar: the five places people go most, like Instagram or
 * WhatsApp, so the team can find their way without training. "More" opens
 * the full menu (Clients, Settings, Diagnostics, DM logs, Metrics).
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavIcon } from "@/components/nav-icons";

const tabs = [
  { label: "Results", href: "/dashboard", icon: "results" },
  { label: "Schedule", href: "/schedule", icon: "schedule" },
  { label: "Inbox", href: "/inbox", icon: "inbox" },
  { label: "Automate", href: "/campaigns", icon: "automations" },
] as const;

export default function MobileTabBar({ onMore }: { onMore: () => void }) {
  const pathname = usePathname();
  const inTabs = tabs.some((t) => pathname === t.href || pathname.startsWith(t.href + "/"));
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-border bg-white lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Main"
    >
      {tabs.map((t) => {
        const on = pathname === t.href || pathname.startsWith(t.href + "/");
        return (
          <Link key={t.href} href={t.href} aria-current={on ? "page" : undefined} className="flex flex-col items-center gap-1 py-2 text-[10.5px] font-semibold" style={{ color: on ? "#0E0E0E" : "#7A7A7A" }}>
            <span className="flex h-7 w-11 items-center justify-center rounded-xl" style={on ? { background: "#FFD701" } : undefined}><NavIcon name={t.icon} size={20} /></span>
            {t.label}
          </Link>
        );
      })}
      <button type="button" onClick={onMore} className="flex flex-col items-center gap-1 py-2 text-[10.5px] font-semibold" style={{ color: !inTabs ? "#0E0E0E" : "#7A7A7A" }}>
        <span className="flex h-7 w-11 items-center justify-center rounded-xl" style={!inTabs ? { background: "#FFD701" } : undefined}><NavIcon name="more" size={20} /></span>
        More
      </button>
    </nav>
  );
}
