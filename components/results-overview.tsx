"use client";

/**
 * Results hero (matches the approved preview): range and platform controls,
 * four headline cards, organic reach by day (this period vs the one before)
 * and a by-client table. Instagram organic only; paid never mixed in.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PlatformIcon } from "@/components/platform-icon";

type Post = { timestamp: string; reach: number | null; likes: number; comments: number; saved: number | null; shares: number | null };
type Ov = { followers: number | null; followerHistory: Array<{ date: string; followers: number }>; totals: { posts: number; reach: number; interactions: number }; posts: Post[] };
type Account = { id: string; username: string; name?: string | null };

const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const fmt = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(2).replace(/\.?0+$/, "")}M` : n >= 1e4 ? `${(n / 1e3).toFixed(1).replace(/\.0$/, "")}K` : n.toLocaleString("en-NG"));
const pct = (a: number, b: number) => (b ? Math.round(((a - b) / b) * 1000) / 10 : null);
const COLORS = [["#FFE0D6", "#B23A12"], ["#DDF0FF", "#0B5C9E"], ["#E3F6E8", "#1E7A3C"], ["#F0E6FF", "#6B2FC4"], ["#FFF3C4", "#7A6300"], ["#EEEEEE", "#444444"]];

export default function ResultsOverview({ accounts, range, dmsDelivered, dmsChange }: { accounts: Account[]; range: 7 | 30 | 90; dmsDelivered: number; dmsChange: number | null }) {
  const [today] = useState(() => Date.now());
  const cur = useMemo(() => ({ from: iso(today - (range - 1) * DAY), to: iso(today) }), [today, range]);
  const prev = useMemo(() => ({ from: iso(today - (2 * range - 1) * DAY), to: iso(today - range * DAY) }), [today, range]);
  const [data, setData] = useState<Record<string, { a: Ov | null; b: Ov | null }>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    void Promise.resolve().then(() => setLoading(true));
    const get = (id: string, r: { from: string; to: string }) =>
      fetch(`/api/instagram/overview?instagramAccountId=${id}&since=${r.from}&until=${r.to}`).then((x) => x.json()).then((p) => (p.success ? (p.data as Ov) : null)).catch(() => null);
    Promise.all(accounts.map(async (acc) => [acc.id, { a: await get(acc.id, cur), b: await get(acc.id, prev) }] as const)).then((rows) => {
      if (!live) return;
      setData(Object.fromEntries(rows));
      setLoading(false);
    });
    return () => { live = false; };
  }, [accounts, cur, prev]);

  const rows = accounts.map((acc, i) => {
    const d = data[acc.id];
    const a = d?.a, b = d?.b;
    const reach = a?.totals.reach ?? 0, prevReach = b?.totals.reach ?? 0;
    const eng = a?.totals.interactions ?? 0;
    return { acc, i, followers: a?.followers ?? 0, reach, prevReach, eng, prevEng: b?.totals.interactions ?? 0, posts: a?.totals.posts ?? 0, rate: reach ? (eng / reach) * 100 : 0, change: pct(reach, prevReach), a, b };
  }).sort((x, y) => y.reach - x.reach);

  const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((s, r) => s + f(r), 0);
  const followers = sum((r) => r.followers);
  const gained = rows.reduce((s, r) => {
    const h = r.a?.followerHistory?.filter((p) => p.date >= cur.from) ?? [];
    return s + (h.length > 1 ? h[h.length - 1].followers - h[0].followers : 0);
  }, 0);

  const days = Array.from({ length: Math.min(range, 30) }, (_, i) => iso(today - (Math.min(range, 30) - 1 - i) * DAY));
  const byDay = (which: "a" | "b") => {
    const shift = which === "b" ? range * DAY : 0;
    const m = new Map(days.map((d) => [d, 0]));
    for (const r of rows) for (const p of (which === "a" ? r.a : r.b)?.posts ?? []) {
      const d = iso(new Date(p.timestamp).getTime() + 3_600_000 + shift);
      if (m.has(d)) m.set(d, (m.get(d) ?? 0) + (p.reach ?? 0));
    }
    return days.map((d) => m.get(d) ?? 0);
  };
  const thisWeek = byDay("a"), lastWeek = byDay("b");
  const max = Math.max(1, ...thisWeek, ...lastWeek);
  const step = Math.max(1, Math.ceil(days.length / 10));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex h-9 items-center gap-2 rounded-xl border border-border bg-white px-3 text-[13px] font-medium">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#777" strokeWidth="2"><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
          {new Date(cur.from + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short" })} to {new Date(cur.to + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
          <span className="text-xs text-muted">vs previous {range} days</span>
        </span>
        <div className="flex-1" />
        <div className="flex rounded-xl bg-[#F1EFE8] p-0.5">
          {[["instagram", "Instagram", true], ["facebook", "Facebook", false], ["youtube", "YouTube", false], ["tiktok", "TikTok", false]].map(([id, nm, on]) => (
            <span key={id as string} title={on ? "" : "Per-platform totals come in the client report"} className="flex h-8 items-center gap-1.5 rounded-lg px-3 text-[12.5px] font-semibold" style={on ? { background: "#fff", boxShadow: "0 1px 2px #0002" } : { color: "#999" }}>
              <PlatformIcon id={id as never} size={14} />{nm as string}
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Card dark label="Followers" value={loading ? "…" : fmt(followers)} sub={loading ? "" : `${gained >= 0 ? "▲" : "▼"} ${fmt(Math.abs(gained))} this period`} up={gained >= 0} />
        <Card label="Organic reach" value={loading ? "…" : fmt(sum((r) => r.reach))} change={loading ? null : pct(sum((r) => r.reach), sum((r) => r.prevReach))} />
        <Card label="Engagements" value={loading ? "…" : fmt(sum((r) => r.eng))} change={loading ? null : pct(sum((r) => r.eng), sum((r) => r.prevEng))} />
        <Card label="DMs delivered by automations" value={fmt(dmsDelivered)} change={dmsChange} />
      </div>

      <div className="rounded-2xl border border-border bg-white">
        <div className="flex flex-wrap items-center gap-3 px-5 pt-4">
          <h3 className="text-[15px] font-semibold" style={{ fontFamily: "var(--font-display)" }}>Organic reach by day</h3>
          <div className="flex-1" />
          <span className="flex gap-3 text-[11.5px] text-muted"><span className="flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-sm bg-[#FFD701]" />This period</span><span className="flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-sm bg-[#D9D6CC]" />Period before</span></span>
        </div>
        <div className="px-5 pb-4 pt-3">
          <div className="flex h-44 items-end gap-1.5 border-b border-border sm:gap-2.5">
            {days.map((d, i) => (
              <div key={d} className="flex h-full flex-1 items-end gap-[2px]" title={`${d}: ${thisWeek[i]} (before: ${lastWeek[i]})`}>
                <i className="block flex-1 rounded-t" style={{ height: `${(lastWeek[i] / max) * 100}%`, background: "#D9D6CC" }} />
                <i className="block flex-1 rounded-t" style={{ height: `${(thisWeek[i] / max) * 100}%`, background: "#FFD701" }} />
              </div>
            ))}
          </div>
          <div className="mt-1.5 flex gap-1.5 sm:gap-2.5">{days.map((d, i) => <span key={d} className="flex-1 text-center text-[10.5px] text-muted">{i % step === 0 ? new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", range === 7 ? { weekday: "short" } : { day: "numeric", month: "short" }) : ""}</span>)}</div>
          <p className="mt-2 text-[11.5px] text-muted">Organic only. Paid results are reported separately and never added to these numbers.</p>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-white">
        <div className="flex flex-wrap items-center gap-2 px-5 pt-4">
          <h3 className="text-[15px] font-semibold" style={{ fontFamily: "var(--font-display)" }}>By client</h3>
          <span className="text-[11.5px] text-muted">Instagram · organic · sorted by reach</span>
          <div className="flex-1" />
          <Link href="/reports" className="flex h-8 items-center rounded-lg border border-border px-3 text-xs font-semibold">Client report</Link>
        </div>
        <div className="overflow-x-auto px-3 pb-3">
          <table className="w-full min-w-[560px] text-[13px]">
            <thead><tr className="text-left text-[11.5px] text-muted"><th className="px-2 py-2 font-semibold">Client</th><th className="px-2 py-2 text-right font-semibold">Followers</th><th className="px-2 py-2 text-right font-semibold">Reach</th><th className="px-2 py-2 text-right font-semibold">Engagement</th><th className="px-2 py-2 text-right font-semibold">Posts</th><th className="px-2 py-2 text-right font-semibold">Change</th></tr></thead>
            <tbody>
              {rows.map((r) => {
                const [bg, fg] = COLORS[r.i % COLORS.length];
                return (
                  <tr key={r.acc.id} className="border-t border-[#F0EEE8]">
                    <td className="px-2 py-2.5"><span className="flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-full text-[9px] font-bold" style={{ background: bg, color: fg }}>{r.acc.username.slice(0, 2).toUpperCase()}</span><b>@{r.acc.username}</b></span></td>
                    <td className="px-2 text-right">{loading ? "…" : fmt(r.followers)}</td>
                    <td className="px-2 text-right">{loading ? "…" : fmt(r.reach)}</td>
                    <td className="px-2 text-right">{loading ? "…" : `${r.rate.toFixed(1)}%`}</td>
                    <td className="px-2 text-right">{loading ? "…" : r.posts}</td>
                    <td className="px-2 text-right font-semibold" style={{ color: r.change == null ? "#999" : r.change < 0 ? "#E0433A" : "#1F9D55" }}>{loading || r.change == null ? "–" : `${r.change > 0 ? "+" : ""}${r.change}%`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Card({ label, value, change, sub, up, dark }: { label: string; value: string; change?: number | null; sub?: string; up?: boolean; dark?: boolean }) {
  return (
    <div className="rounded-2xl border p-4" style={dark ? { background: "#0E0E0E", borderColor: "#0E0E0E", color: "#fff" } : { background: "#fff", borderColor: "#E8E6DF" }}>
      <p className="text-xs font-medium" style={{ color: dark ? "#aaa" : "#6B6A66" }}>{label}</p>
      <p className="my-1 text-2xl font-semibold" style={{ fontFamily: "var(--font-display)", color: dark ? "#FFD701" : undefined }}>{value}</p>
      {sub != null ? <p className="text-xs font-semibold" style={{ color: up ? "#1F9D55" : "#E0433A" }}>{sub}</p> : change != null ? <p className="text-xs font-semibold" style={{ color: change < 0 ? "#E0433A" : "#1F9D55" }}>{change < 0 ? "▼" : "▲"} {Math.abs(change)}%</p> : <p className="text-xs text-muted">&nbsp;</p>}
    </div>
  );
}
