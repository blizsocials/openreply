"use client";

/**
 * Clients grid (matches the approved preview): one row per client with a
 * coloured icon per platform. Green = connected, dashed = not connected.
 */

import { useEffect, useState } from "react";
import { PlatformIcon } from "@/components/platform-icon";

type Acc = { id: string; username: string; provider?: string };
type Conn = { platform: string; instagramAccountId: string | null; clientName: string; name: string };
const PLATFORMS = ["instagram", "facebook", "youtube", "tiktok", "linkedin", "pinterest"] as const;
const COLORS = [["#FFE0D6", "#B23A12"], ["#DDF0FF", "#0B5C9E"], ["#E3F6E8", "#1E7A3C"], ["#F0E6FF", "#6B2FC4"], ["#FFF3C4", "#7A6300"], ["#EEEEEE", "#444444"]];

export default function ClientConnections() {
  const [accounts, setAccounts] = useState<Acc[]>([]);
  const [conns, setConns] = useState<Conn[]>([]);
  const [q, setQ] = useState("");
  useEffect(() => {
    fetch("/api/instagram/accounts").then((r) => r.json()).then((p) => setAccounts(p?.data?.instagramAccounts ?? [])).catch(() => {});
    fetch("/api/connect-links").then((r) => r.json()).then((p) => setConns(p?.data?.connections ?? [])).catch(() => {});
  }, []);
  const status = (a: Acc, pl: (typeof PLATFORMS)[number]) => {
    if (pl === "instagram") return "ok";
    if (pl === "facebook") return a.provider === "ZERNIO" ? "none" : "ok";
    return conns.some((c) => c.platform === pl && (c.instagramAccountId === a.id || c.clientName.toLowerCase().replace(/[^a-z0-9]/g, "") === a.username.toLowerCase().replace(/[^a-z0-9]/g, ""))) ? "ok" : "none";
  };
  const shown = accounts.filter((a) => a.username.toLowerCase().includes(q.toLowerCase()));
  return (
    <section className="rounded-2xl border border-border bg-white">
      <div className="flex flex-wrap items-center gap-3 px-4 pt-4">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search clients" className="h-9 w-full max-w-xs rounded-lg border border-border px-3 text-sm" />
        <div className="flex-1" />
        <span className="flex gap-3 text-[11.5px] text-muted">
          <span className="flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-sm bg-[#BFE8CF]" />Connected</span>
          <span className="flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-sm border border-dashed border-[#bbb]" />Not connected</span>
        </span>
      </div>
      <div className="overflow-x-auto px-2 pb-2">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr><th className="px-3 py-2 text-left text-xs font-semibold text-muted">Client</th>{PLATFORMS.map((p) => <th key={p} className="w-14 py-2"><span className="flex justify-center"><PlatformIcon id={p as never} size={16} /></span></th>)}</tr>
          </thead>
          <tbody>
            {shown.map((a, i) => {
              const [bg, fg] = COLORS[i % COLORS.length];
              return (
                <tr key={a.id} className="border-t border-[#F0EEE8]">
                  <td className="px-3 py-2.5"><span className="flex items-center gap-2.5"><span className="flex h-8 w-8 items-center justify-center rounded-full text-[10px] font-bold" style={{ background: bg, color: fg }}>{a.username.slice(0, 2).toUpperCase()}</span><b>@{a.username}</b></span></td>
                  {PLATFORMS.map((p) => {
                    const st = status(a, p);
                    return (
                      <td key={p} className="py-2">
                        <span title={st === "ok" ? "Connected" : "Not connected. Send a connect link below"} className="mx-auto flex h-7 w-7 items-center justify-center rounded-lg" style={st === "ok" ? { background: "#E5F5EC" } : { border: "1px dashed #DDD9CE", opacity: 0.55 }}>
                          <PlatformIcon id={p as never} size={14} />
                        </span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
