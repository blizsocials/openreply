"use client";

/**
 * Blizsocials: month content calendar. Every scheduled, published and failed
 * post sits on its day with its platforms; click one for full details.
 */

import { useState } from "react";
import { PlatformIcon } from "@/components/platform-icon";

type Post = {
  id: string;
  instagramAccountId: string;
  caption: string;
  mediaAssetIds: string[];
  mediaKind?: string;
  coverAssetId?: string | null;
  scheduledAt: string;
  platforms?: string[];
  socialConnectionIds?: string[];
  status: string;
  permalink: string | null;
  errorMessage: string | null;
};

const DOT: Record<string, string> = { SCHEDULED: "#E0B800", PUBLISHING: "#3B6FE0", PUBLISHED: "#2E8B2E", FAILED: "#C0392B" };
const LABEL: Record<string, string> = { SCHEDULED: "Scheduled", PUBLISHING: "Publishing", PUBLISHED: "Published", FAILED: "Failed" };
const key = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

export default function ContentCalendar({ posts, usernameOf, onlyAccount }: { posts: Post[]; usernameOf: Map<string, string>; onlyAccount?: string }) {
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [allClients, setAllClients] = useState(false);
  const [open, setOpen] = useState<Post | null>(null);

  const shown = posts.filter((p) => allClients || !onlyAccount || p.instagramAccountId === onlyAccount);
  const byDay = new Map<string, Post[]>();
  for (const p of shown) {
    const k = key(new Date(p.scheduledAt));
    byDay.set(k, [...(byDay.get(k) ?? []), p].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)));
  }

  const lead = (month.getDay() + 6) % 7;
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [...Array(lead).fill(null)];
  for (let i = 1; i <= days; i++) cells.push(new Date(month.getFullYear(), month.getMonth(), i));
  const todayKey = key(new Date());
  const inMonth = shown.filter((p) => {
    const d = new Date(p.scheduledAt);
    return d.getMonth() === month.getMonth() && d.getFullYear() === month.getFullYear();
  });

  return (
    <section className="panel p-5 flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button type="button" aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="rounded-lg border border-border px-3 py-1">‹</button>
          <h2 className="text-lg font-semibold w-44 text-center">{month.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</h2>
          <button type="button" aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="rounded-lg border border-border px-3 py-1">›</button>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="font-semibold">{inMonth.length} posts this month</span>
          {Object.entries(LABEL).map(([k, l]) => (
            <span key={k} className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: DOT[k] }} />{l}</span>
          ))}
          <label className="flex items-center gap-1 font-semibold">
            <input type="checkbox" checked={allClients} onChange={(e) => setAllClients(e.target.checked)} /> All clients
          </label>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="grid min-w-[720px] grid-cols-7 gap-1">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <div key={d} className="py-1 text-center text-xs font-semibold text-muted">{d}</div>
          ))}
          {cells.map((d, i) => {
            if (!d) return <div key={`b${i}`} />;
            const list = byDay.get(key(d)) ?? [];
            const isToday = key(d) === todayKey;
            return (
              <div key={i} className={`min-h-[110px] rounded-lg border p-1.5 ${isToday ? "border-[#0E0E0E] bg-[#FFFBE0]" : "border-border"}`}>
                <div className="mb-1 text-xs font-bold">{d.getDate()}</div>
                <div className="flex flex-col gap-1">
                  {list.map((p) => {
                    const img = p.coverAssetId ?? p.mediaAssetIds[0];
                    return (
                      <button key={p.id} type="button" onClick={() => setOpen(p)} className="flex items-center gap-1 rounded-md bg-surface p-1 text-left text-[10px] shadow-sm hover:bg-zinc-50">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: DOT[p.status] ?? "#999" }} />
                        {img ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={`/api/media/${img}`} alt="" className="h-6 w-6 shrink-0 rounded object-cover" />
                        ) : (
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-[#0E0E0E] text-[7px] font-bold text-[#FFD701]">Reel</span>
                        )}
                        <span className="min-w-0 flex-1 truncate">
                          {new Date(p.scheduledAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          {allClients ? ` @${usernameOf.get(p.instagramAccountId) ?? ""}` : ""}
                        </span>
                        {(p.platforms ?? []).map((pl) => <PlatformIcon key={pl} id={pl === "facebook" ? "facebook" : "instagram"} size={10} />)}
                        {(p.socialConnectionIds?.length ?? 0) > 0 && <PlatformIcon id="youtube" size={10} />}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(null)}>
          <div className="w-full max-w-md rounded-2xl bg-surface p-5 flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-bold">@{usernameOf.get(open.instagramAccountId) ?? "account"}</div>
                <div className="text-xs text-muted">{new Date(open.scheduledAt).toLocaleString("en-GB", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}</div>
              </div>
              <button type="button" onClick={() => setOpen(null)} aria-label="Close" className="text-lg">×</button>
            </div>
            {(open.coverAssetId || open.mediaAssetIds[0]) && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/media/${open.coverAssetId ?? open.mediaAssetIds[0]}`} alt="" className="max-h-72 w-full rounded-xl object-cover" />
            )}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full px-2 py-0.5 font-bold text-white" style={{ background: DOT[open.status] ?? "#999" }}>{LABEL[open.status] ?? open.status}</span>
              <span className="font-semibold">{open.mediaKind === "REEL" ? "Reel / video" : open.mediaAssetIds.length > 1 ? `Carousel of ${open.mediaAssetIds.length}` : "Single post"}</span>
              {(open.platforms ?? []).map((pl) => <PlatformIcon key={pl} id={pl === "facebook" ? "facebook" : "instagram"} size={16} />)}
              {(open.socialConnectionIds?.length ?? 0) > 0 && <PlatformIcon id="youtube" size={16} />}
            </div>
            <p className="max-h-48 overflow-y-auto whitespace-pre-line text-sm">{open.caption || "No caption"}</p>
            {open.errorMessage && <p className="text-xs" style={{ color: "#B42318" }}>{open.errorMessage}</p>}
            {open.permalink && <a href={open.permalink} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold underline">View on Instagram</a>}
          </div>
        </div>
      )}
    </section>
  );
}
