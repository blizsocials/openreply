"use client";

/**
 * Blizsocials: post performance charts for the Metrics page. Organic only:
 * these numbers come from Instagram media insights for the client's own posts
 * and never include paid (ad) reach.
 */

type Post = {
  id: string;
  caption?: string | null;
  permalink?: string | null;
  mediaType?: string | null;
  timestamp: string;
  reach: number | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  saved: number | null;
  shares: number | null;
};

const BLACK = "#0E0E0E";
const YELLOW = "#FFD701";

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function interactions(p: Post) {
  return (p.likes ?? 0) + (p.comments ?? 0) + (p.saved ?? 0) + (p.shares ?? 0);
}

export default function PostPerformanceCharts({ posts }: { posts: Post[] }) {
  const recent = [...posts]
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    .slice(-20);
  if (recent.length === 0) return null;

  const maxReach = Math.max(1, ...recent.map((p) => p.reach ?? 0));
  const withReach = posts.filter((p) => (p.reach ?? 0) > 0);
  const totalReach = withReach.reduce((s, p) => s + (p.reach ?? 0), 0);
  const totalInteractions = withReach.reduce((s, p) => s + interactions(p), 0);
  const engagementRate = totalReach ? (totalInteractions / totalReach) * 100 : null;
  const best = [...posts].sort((a, b) => interactions(b) - interactions(a))[0];

  const byType = new Map<string, { count: number; reach: number }>();
  for (const p of posts) {
    const type = p.mediaType === "REELS" || p.mediaType === "VIDEO" ? "Reels and video" : p.mediaType === "CAROUSEL_ALBUM" ? "Carousels" : "Photos";
    const cur = byType.get(type) ?? { count: 0, reach: 0 };
    cur.count++;
    cur.reach += p.reach ?? 0;
    byType.set(type, cur);
  }
  const typeRows = [...byType.entries()].map(([type, v]) => ({ type, count: v.count, avg: v.count ? Math.round(v.reach / v.count) : 0 }));
  const maxAvg = Math.max(1, ...typeRows.map((r) => r.avg));

  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
      <section className="panel p-5 flex flex-col gap-3" style={{ gridColumn: "1 / -1" }}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold">Reach per post (organic)</h2>
          <span className="text-xs text-muted">Last {recent.length} posts, oldest to newest</span>
        </div>
        <div role="img" aria-label="Bar chart of organic reach for each recent post" className="flex items-end gap-1.5" style={{ height: 180, borderBottom: "1px solid var(--color-border)" }}>
          {recent.map((p) => {
            const h = Math.max(2, Math.round(((p.reach ?? 0) / maxReach) * 100));
            const isBest = best && p.id === best.id;
            return (
              <a
                key={p.id}
                href={p.permalink ?? undefined}
                target="_blank"
                rel="noopener noreferrer"
                title={`${new Date(p.timestamp).toLocaleDateString()} · reach ${fmt(p.reach ?? 0)} · ${fmt(interactions(p))} interactions`}
                className="flex-1 rounded-t-md"
                style={{ height: `${h}%`, background: isBest ? YELLOW : BLACK, minWidth: 6 }}
              />
            );
          })}
        </div>
        <p className="text-xs text-muted">Yellow is the post with the most interactions. Hover a bar for details, click to open the post.</p>
      </section>

      <section className="panel p-5 flex flex-col gap-2">
        <h2 className="text-base font-semibold">Engagement rate</h2>
        <span className="text-4xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
          {engagementRate === null ? "—" : `${engagementRate.toFixed(1)}%`}
        </span>
        <p className="text-sm text-muted">Likes, comments, saves and shares divided by reach, across these posts.</p>
      </section>

      {best && (
        <section className="panel p-5 flex flex-col gap-2">
          <h2 className="text-base font-semibold">Top post</h2>
          <span className="text-sm line-clamp-3">{best.caption || "No caption"}</span>
          <span className="text-sm text-muted">
            {fmt(interactions(best))} interactions · {fmt(best.reach ?? 0)} reach · {new Date(best.timestamp).toLocaleDateString()}
          </span>
          {best.permalink && (
            <a href={best.permalink} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold underline">Open on Instagram</a>
          )}
        </section>
      )}

      <section className="panel p-5 flex flex-col gap-3">
        <h2 className="text-base font-semibold">Average reach by format</h2>
        {typeRows.map((r) => (
          <div key={r.type} className="flex flex-col gap-1">
            <div className="flex justify-between text-sm"><span>{r.type} ({r.count})</span><b>{fmt(r.avg)}</b></div>
            <div className="h-3 rounded-full overflow-hidden" style={{ background: "#F0EEE6" }}>
              <div className="h-full rounded-full" style={{ width: `${Math.round((r.avg / maxAvg) * 100)}%`, background: BLACK }} />
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
