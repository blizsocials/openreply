"use client";

/**
 * Top Bar
 *
 * Page title, mobile hamburger, and connection status.
 */

import type { StaticMessageKey } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/provider";
import { usePathname } from "next/navigation";

const subtitles: Record<string, string> = {
  "/dashboard": "How every client is doing, in one place",
  "/overview": "Followers, reach and posts for each client",
  "/schedule": "Plan and publish to every platform at once",
  "/inbox": "Every DM and comment, answered by the right person",
  "/campaigns": "Comment a keyword, get the DM. Running 24/7",
  "/logs": "Every automated DM, and why any failed",
  "/clients": "Who is connected, and what each connection can do",
  "/settings": "Team, workspace and preferences",
  "/diagnostics": "Check that comments and DMs are flowing",
};

const plainTitles: Record<string, string> = {
  "/logs": "DM logs",
  "/inbox": "Inbox",
  "/settings": "Settings",
  "/diagnostics": "Diagnostics",
  "/dashboard": "Results",
  "/campaigns": "Automations",
  "/campaigns/new": "New automation",
  "/automations": "Automations",
  "/automations/new": "New automation",
  "/overview": "Metrics",
  "/clients": "Clients",
  "/schedule": "Schedule",
};

const pageTitles: Record<string, StaticMessageKey> = {
  "/dashboard": "Dashboard",
  "/overview": "Overview",
  "/inbox": "Inbox",
  "/campaigns/import": "Import campaigns",
  "/campaigns": "Campaigns",
  "/campaigns/new": "New Campaign",
  "/automations": "Campaigns",
  "/automations/new": "New Campaign",
  "/logs": "DM Logs",
  "/settings": "Settings",
  "/diagnostics": "Diagnostics",
};

interface TopBarProps {
  onMenuClick: () => void;
  instagramUsername: string | null;
  instagramAccountCount: number;
}

export default function TopBar({
  onMenuClick,
  instagramAccountCount,
}: TopBarProps) {
  const { t } = useI18n();
  const pathname = usePathname();
  const title: StaticMessageKey = pageTitles[pathname] ?? (
    pathname.endsWith("/edit") ? "Edit campaign"
      : pathname.startsWith("/campaigns/") ? "Campaign details" : "Dashboard"
  );

  return (
    <header
      className="sticky top-0 z-30 flex items-center justify-between gap-3 px-4 lg:px-8 border-b border-border bg-background"
      // Installed to the home screen the app starts at the very top of the
      // display, so without this the title sits under the clock and battery.
      // The inset is 0 in a browser tab and on desktop.
      style={{
        height: "calc(4rem + env(safe-area-inset-top))",
        paddingTop: "env(safe-area-inset-top)",
      }}
    >
      <div className="flex min-w-0 items-center gap-3">
        <button
          onClick={onMenuClick}
          className="lg:hidden flex shrink-0 items-center"
          aria-label={t("Toggle sidebar")}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/bliz-app-logo.png" alt="" width={32} height={32} className="rounded-lg" style={{ width: 32, height: 32 }} />
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-base font-semibold sm:text-lg" style={{ fontFamily: "var(--font-display)" }}>{plainTitles[pathname] ?? t(title)}</h1>
          {subtitles[pathname] && <p className="hidden truncate text-xs text-muted sm:block">{subtitles[pathname]}</p>}
        </div>
      </div>

      {instagramAccountCount === 0 && (
        <a
          href="/api/facebook/connect"
          className="shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold"
          style={{ background: "#0E0E0E", color: "#FFD701" }}
        >
          Connect clients
        </a>
      )}
    </header>
  );
}
