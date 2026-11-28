"use client";

/**
 * Sidebar Navigation
 *
 * Text-only nav with active state and workspace section.
 */

import LanguageSwitcher from "@/components/language-switcher";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { onClientChange, readClient, writeClient } from "@/lib/client-selection";

const navItems = [
  { label: "Results", href: "/dashboard" },
  { label: "Clients", href: "/clients" },
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
  const [clients, setClients] = useState<Array<{ id: string; username: string }>>([]);
  const [client, setClient] = useState("all");
  const [logos, setLogos] = useState<Record<string, string>>({});
  const [switcherOpen, setSwitcherOpen] = useState(false);

  // Each client's Instagram profile picture doubles as their logo.
  useEffect(() => {
    for (const c of clients) {
      fetch(`/api/instagram/profile?instagramAccountId=${c.id}`)
        .then((r) => r.json())
        .then((p) => {
          const url = p?.data?.profilePictureUrl;
          if (url) setLogos((m) => ({ ...m, [c.id]: url }));
        })
        .catch(() => {});
    }
  }, [clients]);

  useEffect(() => {
    fetch("/api/instagram/accounts")
      .then((r) => r.json())
      .then((p) => setClients(p?.data?.instagramAccounts ?? []))
      .catch(() => {});
    const saved = readClient();
    if (saved) void Promise.resolve().then(() => setClient(saved));
    return onClientChange(setClient);
  }, []);

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
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/bliz-app-logo.png" alt="" width={36} height={36} className="rounded-lg" style={{ width: 36, height: 36 }} />
            <span className="flex flex-col leading-tight">
              <span className="text-base font-semibold" style={{ fontFamily: "var(--font-display)" }}>Blizsocials</span>
              <span className="text-xs" style={{ color: "#B8B8B8" }}>Automations</span>
            </span>
          </Link>
        </div>

        <div className="px-4 pb-2">
          <span className="block text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "#B8B8B8" }}>
            Working on
          </span>
          <div className="relative" id="client-switch">
            <button
              type="button"
              onClick={() => setSwitcherOpen((o) => !o)}
              aria-expanded={switcherOpen}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-white"
              style={{ background: "#1C1C1C", border: "1px solid #333333" }}
            >
              <ClientLogo url={client === "all" ? undefined : logos[client]} label={client === "all" ? "All" : clients.find((c) => c.id === client)?.username ?? "?"} size={32} />
              <span className="min-w-0 flex-1 truncate font-semibold">
                {client === "all" ? "All clients" : `@${clients.find((c) => c.id === client)?.username ?? ""}`}
              </span>
              <span aria-hidden style={{ color: "#B8B8B8" }}>▾</span>
            </button>
            {switcherOpen && (
              <div className="absolute left-0 right-0 z-50 mt-1 max-h-80 overflow-y-auto rounded-lg py-1 shadow-xl" style={{ background: "#1C1C1C", border: "1px solid #333333" }}>
                {[{ id: "all", username: "" }, ...clients].map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setClient(c.id);
                      writeClient(c.id);
                      setSwitcherOpen(false);
                    }}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-[#2A2A2A]"
                    style={c.id === client ? { color: "#FFD701" } : undefined}
                  >
                    <ClientLogo url={c.id === "all" ? undefined : logos[c.id]} label={c.id === "all" ? "All" : c.username} size={28} />
                    <span className="truncate">{c.id === "all" ? "All clients" : `@${c.username}`}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
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

        <div className="px-4 py-3">
          <a
            href="/api/facebook/connect"
            title="Pulls in every Instagram account linked to a Page in your Business Manager"
            className="flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold"
            style={{ background: "#1C1C1C", color: "#FFD701", border: "1px solid #333333" }}
          >
            <span aria-hidden>⟳</span> Add or refresh clients
          </a>
          <p className="mt-3 text-xs truncate" style={{ color: "#B8B8B8" }}>{workspaceName}</p>
          <div className="mt-2 hidden"><LanguageSwitcher /></div>
        </div>
      </aside>
    </>
  );
}

function ClientLogo({ url, label, size }: { url?: string; label: string; size: number }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" width={size} height={size} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size, border: "2px solid #FFD701" }} />;
  }
  return (
    <span className="flex shrink-0 items-center justify-center rounded-full text-[11px] font-bold" style={{ width: size, height: size, background: "#FFD701", color: "#0E0E0E" }}>
      {label === "All" ? "All" : label.slice(0, 2).toUpperCase()}
    </span>
  );
}
