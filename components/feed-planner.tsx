"use client";

/**
 * Blizsocials: Instagram-style 3-column grid for one client. Upcoming posts
 * sit on top in the order they will appear; drag one onto another to swap
 * their publish times. Published posts below are locked (Instagram cannot
 * reorder them).
 */

import { useEffect, useState } from "react";

type Post = {
  id: string;
  instagramAccountId: string;
  caption: string;
  mediaAssetIds: string[];
  mediaKind?: string;
  coverAssetId?: string | null;
  scheduledAt: string;
  platforms?: string[];
  status: string;
};
type Live = { id: string; media_url?: string; thumbnail_url?: string; permalink?: string; caption?: string };

export default function FeedPlanner({ accountId, posts, onMoved }: { accountId: string; posts: Post[]; onMoved: () => void }) {
  const [live, setLive] = useState<Live[]>([]);
  const [dragId, setDragId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!accountId) return;
    let alive = true;
    fetch(`/api/instagram/posts?instagramAccountId=${accountId}&limit=12`)
      .then((r) => r.json())
      .then((p) => alive && setLive(p.success ? p.data : []))
      .catch(() => alive && setLive([]));
    return () => {
      alive = false;
    };
  }, [accountId]);

  // Newest at the top-left, like the real profile grid.
  const upcoming = posts
    .filter((p) => p.instagramAccountId === accountId && p.status === "SCHEDULED" && (p.platforms ?? []).includes("instagram"))
    .sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt));

  async function swap(a: Post, b: Post) {
    if (a.id === b.id) return;
    setSaving(true);
    await Promise.all([
      fetch(`/api/scheduled-posts/${a.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scheduledAt: b.scheduledAt }) }),
      fetch(`/api/scheduled-posts/${b.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scheduledAt: a.scheduledAt }) }),
    ]);
    setSaving(false);
    onMoved();
  }

  const thumb = (p: Post) => {
    const id = p.coverAssetId ?? p.mediaAssetIds[0];
    return id ? `/api/media/${id}` : null;
  };

  return (
    <section className="panel p-5 flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">Feed planner</h2>
        <span className="text-xs text-muted">{saving ? "Saving new order…" : "Drag an upcoming post onto another to swap their times"}</span>
      </div>
      <div className="mx-auto grid w-full max-w-[420px] grid-cols-3 gap-1">
        {upcoming.map((p) => {
          const src = thumb(p);
          return (
            <div
              key={p.id}
              draggable
              onDragStart={() => setDragId(p.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                const from = upcoming.find((x) => x.id === dragId);
                setDragId(null);
                if (from) void swap(from, p);
              }}
              title={`${new Date(p.scheduledAt).toLocaleString()}\n${p.caption}`}
              className={`relative aspect-[4/5] cursor-grab overflow-hidden bg-[#F0EEE6] ring-2 ${dragId === p.id ? "ring-[#FFD701] opacity-60" : "ring-transparent"}`}
            >
              {src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={src} alt="" className="h-full w-full object-cover" draggable={false} />
              ) : (
                <span className="flex h-full items-center justify-center text-xs font-bold">Reel</span>
              )}
              <span className="absolute left-1 top-1 rounded bg-[#0E0E0E] px-1.5 py-0.5 text-[10px] font-bold text-[#FFD701]">
                {new Date(p.scheduledAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
              </span>
            </div>
          );
        })}
        {live.map((m) => (
          <a key={m.id} href={m.permalink} target="_blank" rel="noopener noreferrer" className="relative aspect-[4/5] overflow-hidden bg-[#F0EEE6]" title={m.caption ?? ""}>
            {(m.thumbnail_url || m.media_url) && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={m.thumbnail_url || m.media_url} alt="" className="h-full w-full object-cover" />
            )}
            <span className="absolute left-1 top-1 rounded bg-white/90 px-1.5 py-0.5 text-[10px] font-semibold">Live</span>
          </a>
        ))}
      </div>
      {upcoming.length === 0 && <p className="text-center text-sm text-muted">Schedule Instagram posts for this client to plan the grid.</p>}
    </section>
  );
}
