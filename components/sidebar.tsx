"use client";

/**
 * Sidebar Navigation
 *
 * Text-only nav with active state and workspace section.
 */

import LanguageSwitcher from "@/components/language-switcher";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Clients", href: "/overview" },
  { label: "Automations", href: "/campaigns" },
  { label: "Schedule", href: "/schedule" },
  { label: "Inbox", href: "/inbox" },
  { label: "DM Logs", href: "/logs" },
  { label: "Settings", href: "/settings" },
  { label: "Diagnostics", href: "/diagnostics" },
] as const;

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceName: string;
}

export default function Sidebar({
  isOpen,
  onClose,
  workspaceName,
}: SidebarProps) {
  const pathname = usePathname();

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        style={{ background: "#0E0E0E" }}
        className={`
          fixed top-0 left-0 z-50 h-dvh w-64 max-w-[85vw] shrink-0 flex flex-col text-white
          transition-transform duration-200 ease-out
          lg:h-full lg:translate-x-0 lg:static lg:z-auto
          ${isOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        {/* Same reason as the top bar: the drawer is full height, so the
            wordmark would otherwise land under the status bar. */}
        <div
          className="px-5 py-5"
          style={{ paddingTop: "calc(1.25rem + env(safe-area-inset-top))" }}
        >
          <Link href="/dashboard" className="flex items-center gap-3">
            <span
              className="flex items-center justify-center rounded-lg text-lg font-bold"
              style={{ width: 36, height: 36, background: "#FFD701", color: "#0E0E0E", fontFamily: "var(--font-display)" }}
            >
              b
            </span>
            <span className="flex flex-col leading-tight">
              <span className="text-base font-semibold" style={{ fontFamily: "var(--font-display)" }}>Blizsocials</span>
              <span className="text-xs" style={{ color: "#B8B8B8" }}>Automations</span>
            </span>
          </Link>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                aria-current={isActive ? "page" : undefined}
                className={`
                  block px-3 py-3 rounded-lg text-sm font-semibold
                  ${
                    isActive
                      ? "text-[#0E0E0E]"
                      : "text-white hover:bg-white/10"
                  }
                `}
                style={isActive ? { background: "#FFD701" } : undefined}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="px-4 py-4">
          <div className="rounded-xl p-4 flex flex-col gap-2" style={{ background: "#1C1C1C" }}>
            <span className="text-sm font-semibold">Connected through Facebook</span>
            <span className="text-xs leading-relaxed" style={{ color: "#B8B8B8" }}>
              Every Instagram account linked to a Page in your Business Manager shows up here.
            </span>
            <a href="/api/facebook/connect" className="text-sm font-semibold" style={{ color: "#FFD701" }}>
              Add or refresh clients
            </a>
          </div>
          <p className="mt-4 text-sm truncate">{workspaceName}</p>
          <div className="mt-2 hidden"><LanguageSwitcher /></div>
        </div>
      </aside>
    </>
  );
}
