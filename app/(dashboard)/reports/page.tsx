"use client";

/**
 * Client reports: Zoho-depth detail for one client and any period, compared
 * HubSpot-style with another period. Instagram is live; other platforms show
 * as not connected until their APIs are approved. Paid is never mixed in.
 */

import { useEffect, useMemo, useState } from "react";
import { onClientChange, readClient, writeClient } from "@/lib/client-selection";
import { PlatformIcon } from "@/components/platform-icon";

type Post = { id: string; caption: string | null; permalink: string | null; thumbnailUrl: string | null; mediaType: string; timestamp: string; views: number | null; reach: number | null; likes: number; comments: number; saved: number | null; shares: number | null };
type Overview = { account: { id: string; username: string }; followers: number | null; followerHistory: Array<{ date: string; followers: number }>; insightsAvailable: boolean; totals: { posts: number; views: number; reach: number; likes: number; comments: number; saved: number; shares: number; interactions: number }; posts: Post[] };
type Range = { from: string; to: string };

const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const days = (r: Range) => Math.round((Date.parse(r.to) - Date.parse(r.from)) / DAY) + 1;
const fmt = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(2).replace(/\.?0+$/, "")}M` : n >= 1e4 ? `${(n / 1e3).toFixed(1).replace(/\.0$/, "")}K` : n.toLocaleString("en-NG"));
const label = (r: Range) => {
  const o: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  return `${new Date(r.from + "T12:00:00Z").toLocaleDateString("en-GB", o)} to ${new Date(r.to + "T12:00:00Z").toLocaleDateString("en-GB", { ...o, year: "numeric" })}`;
};
const interactions = (p: Post) => p.likes + p.comments + (p.saved ?? 0) + (p.shares ?? 0);
const kind = (p: Post) => (p.mediaType === "REELS" || p.mediaType === "VIDEO" ? "Reels" : p.mediaType === "CAROUSEL_ALBUM" ? "Carousels" : p.mediaType === "STORY" ? "Stories" : "Images");

type DayRow = { date: string; posts: number; eng: number; likes: number; comments: number; saved: number; shares: number; reach: number; views: number };
function daily(posts: Post[], r: Range): DayRow[] {
  const out: DayRow[] = [];
  for (let t = Date.parse(r.from + "T12:00:00Z"); t <= Date.parse(r.to + "T12:00:00Z"); t += DAY) out.push({ date: iso(t), posts: 0, eng: 0, likes: 0, comments: 0, saved: 0, shares: 0, reach: 0, views: 0 });
  const idx = new Map(out.map((d, i) => [d.date, i]));
  for (const p of posts) {
    const i = idx.get(iso(new Date(p.timestamp).getTime() + 3_600_000));
    if (i == null) continue;
    const d = out[i];
    d.posts += 1; d.eng += interactions(p); d.likes += p.likes; d.comments += p.comments; d.saved += p.saved ?? 0; d.shares += p.shares ?? 0; d.reach += p.reach ?? 0; d.views += p.views ?? 0;
  }
  return out;
}
const short = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short" });

const PRESETS = ["7 days", "30 days", "This month", "Last month", "Custom"] as const;
const COMPARE = ["Previous period", "Same period last year"] as const;
type Preset = (typeof PRESETS)[number];

function presetRange(p: Preset, today: string, custom: Range): Range {
  const t = Date.parse(today + "T12:00:00Z");
  const d = new Date(t);
  if (p === "7 days") return { from: iso(t - 6 * DAY), to: today };
  if (p === "30 days") return { from: iso(t - 29 * DAY), to: today };
  if (p === "This month") return { from: `${today.slice(0, 8)}01`, to: today };
  if (p === "Last month") {
    const first = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1);
    const last = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 0);
    return { from: iso(first), to: iso(last) };
  }
  return custom;
}
function compareRange(r: Range, mode: (typeof COMPARE)[number]): Range {
  if (mode === "Same period last year") {
    const shift = (s: string) => `${Number(s.slice(0, 4)) - 1}${s.slice(4)}`;
    return { from: shift(r.from), to: shift(r.to) };
  }
  const n = days(r);
  const end = Date.parse(r.from + "T12:00:00Z") - DAY;
  return { from: iso(end - (n - 1) * DAY), to: iso(end) };
}

export default function ReportsPage() {
  const [today] = useState(() => iso(Date.now()));
  const [accounts, setAccounts] = useState<Array<{ id: string; username: string }>>([]);
  const [client, setClient] = useState<string>("");
  const [preset, setPreset] = useState<Preset>("30 days");
  const [compare, setCompare] = useState<(typeof COMPARE)[number]>("Previous period");
  const [custom, setCustom] = useState<Range>(() => ({ from: iso(Date.now() - 29 * DAY), to: iso(Date.now()) }));
  const [view, setView] = useState<"summary" | "detailed" | "compare">("detailed");
  const [platform, setPlatform] = useState("instagram");
  const [a, setA] = useState<Overview | null>(null);
  const [b, setB] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(false);
  const [sortBy, setSortBy] = useState<"eng" | "reach" | "views" | "date">("eng");
  const [error, setError] = useState<string | null>(null);

  const range = useMemo(() => presetRange(preset, today, custom), [preset, today, custom]);
  const prev = useMemo(() => compareRange(range, compare), [range, compare]);

  useEffect(() => {
    fetch("/api/instagram/accounts").then((r) => r.json()).then((p) => {
      const list = p?.data?.instagramAccounts ?? [];
      setAccounts(list);
      const saved = readClient();
      const pick = saved && saved !== "all" && list.some((x: { id: string }) => x.id === saved) ? saved : list[0]?.id ?? "";
      setClient(pick);
    }).catch(() => {});
    return onClientChange((id) => { if (id !== "all") setClient(id); });
  }, []);

  useEffect(() => {
    if (!client) return;
    let live = true;
    void Promise.resolve().then(() => { setLoading(true); setError(null); });
    const get = (r: Range) => fetch(`/api/instagram/overview?instagramAccountId=${client}&since=${r.from}&until=${r.to}`).then((x) => x.json()).then((p) => { if (!p.success) throw new Error(p.error || "Could not load"); return p.data as Overview; });
    Promise.all([get(range), get(prev).catch(() => null)])
      .then(([x, y]) => { if (live) { setA(x); setB(y); } })
      .catch((e) => live && setError(e instanceof Error ? e.message : "Could not load"))
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [client, range, prev]);

  const name = accounts.find((x) => x.id === client)?.username ?? "";
  const n = days(range);
  const followersAt = (o: Overview | null, r: Range) => {
    const h = o?.followerHistory?.filter((p) => p.date <= r.to) ?? [];
    return h.length ? h[h.length - 1].followers : null;
  };
  const gained = (o: Overview | null, r: Range) => {
    const h = o?.followerHistory?.filter((p) => p.date >= r.from && p.date <= r.to) ?? [];
    return h.length > 1 ? h[h.length - 1].followers - h[0].followers : null;
  };
  const byType = (o: Overview | null) => {
    const m: Record<string, number> = {};
    for (const p of o?.posts ?? []) m[kind(p)] = (m[kind(p)] ?? 0) + interactions(p);
    return Object.entries(m).sort((x, y) => y[1] - x[1]);
  };
  const top = [...(a?.posts ?? [])].sort((x, y) => interactions(y) - interactions(x));
  const reels = (o: Overview | null) => (o?.posts ?? []).filter((p) => kind(p) === "Reels");
  const sum = (ps: Post[], f: (p: Post) => number) => ps.reduce((s, p) => s + f(p), 0);

  const rows: Array<[string, number | null, number | null]> = a ? [
    ["Followers at period end", followersAt(a, range) ?? a.followers, followersAt(b, prev)],
    ["Net follower growth", gained(a, range), gained(b, prev)],
    ["Posts published", a.totals.posts, b?.totals.posts ?? null],
    ["Reach (sum of post reach)", a.totals.reach, b?.totals.reach ?? null],
    ["Views", a.totals.views, b?.totals.views ?? null],
    ["Engagement on posts", a.totals.interactions, b?.totals.interactions ?? null],
    ["Likes", a.totals.likes, b?.totals.likes ?? null],
    ["Comments", a.totals.comments, b?.totals.comments ?? null],
    ["Saves", a.totals.saved, b?.totals.saved ?? null],
    ["Shares", a.totals.shares, b?.totals.shares ?? null],
    ["Reels published", reels(a).length, b ? reels(b).length : null],
    ["Reel engagement", sum(reels(a), interactions), b ? sum(reels(b), interactions) : null],
  ] : [];

  const bestType = byType(a)[0];
  const reachChange = a && b && b.totals.reach ? Math.round(((a.totals.reach - b.totals.reach) / b.totals.reach) * 100) : null;
  const summary = a ? `In ${label(range)}, @${name} published ${a.totals.posts} post${a.totals.posts === 1 ? "" : "s"} that reached ${fmt(a.totals.reach)} accounts${reachChange != null ? ` (${reachChange >= 0 ? "up" : "down"} ${Math.abs(reachChange)}% on the period before)` : ""} and earned ${fmt(a.totals.interactions)} engagements.${top[0] ? ` The best post earned ${fmt(interactions(top[0]))} engagements.` : ""}${bestType ? ` ${bestType[0]} brought the most engagement.` : ""}` : "";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <select value={client} onChange={(e) => { setClient(e.target.value); writeClient(e.target.value); }} className="h-9 rounded-lg border border-border bg-white px-3 text-sm font-semibold">
          {accounts.map((x) => <option key={x.id} value={x.id}>@{x.username}</option>)}
        </select>
        <Seg options={PRESETS} value={preset} onChange={setPreset} />
        {preset === "Custom" && (
          <span className="flex items-center gap-1 text-sm">
            <input type="date" value={custom.from} max={custom.to} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} className="h-9 rounded-lg border border-border bg-white px-2" />
            <span className="text-muted">to</span>
            <input type="date" value={custom.to} min={custom.from} max={today} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} className="h-9 rounded-lg border border-border bg-white px-2" />
          </span>
        )}
        <span className="text-xs text-muted">compared with</span>
        <Seg options={COMPARE} value={compare} onChange={setCompare} />
        <div className="flex-1" />
        <Seg options={["summary", "detailed", "compare"] as const} labels={{ summary: "Summary", detailed: "Full detailed report", compare: "Compare periods" }} value={view} onChange={setView} />
      </div>

      <section className="overflow-hidden rounded-2xl border border-border bg-white">
        <header className="flex flex-wrap items-end gap-4 px-6 py-6 text-white" style={{ background: "#0E0E0E" }}>
          <div>
            <p className="text-[11px] font-bold tracking-widest" style={{ color: "#FFD701" }}>BLIZSOCIALS · CLIENT REPORT</p>
            <h2 className="mt-1 text-2xl font-semibold sm:text-3xl" style={{ fontFamily: "var(--font-display)" }}>{name ? `@${name}` : "Choose a client"}</h2>
            <p className="mt-1 text-xs text-zinc-300">{label(range)} · compared with {label(prev)} · Lagos time</p>
          </div>
          <div className="flex-1" />
          <button type="button" onClick={() => window.print()} className="h-9 rounded-lg px-4 text-sm font-bold print:hidden" style={{ background: "#FFD701", color: "#0E0E0E" }}>Save as PDF</button>
        </header>

        <div className="space-y-4 p-4 sm:p-6">
          <div className="flex flex-wrap gap-2 print:hidden">
            {[["instagram", "Instagram"], ["facebook", "Facebook"], ["tiktok", "TikTok"], ["youtube", "YouTube"], ["linkedin", "LinkedIn"], ["x", "X"], ["pinterest", "Pinterest"]].map(([id, nm]) => (
              <button key={id} type="button" onClick={() => setPlatform(id)} className="flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold" style={platform === id ? { background: "#0E0E0E", color: "#fff", borderColor: "#0E0E0E" } : { borderColor: "var(--color-border, #E8E6DF)" }}>
                <PlatformIcon id={id as never} size={14} />{nm}
              </button>
            ))}
          </div>

          {platform !== "instagram" ? (
            <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted">This platform&apos;s report switches on as soon as its connection is approved for this client. Until then nothing is shown here, so no number is ever guessed.</p>
          ) : error ? (
            <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>
          ) : !a ? (
            <p className="p-6 text-sm text-muted">{loading ? "Loading the report…" : "Choose a client to see their report."}</p>
          ) : (
            <div className={`space-y-4 ${loading ? "opacity-60" : ""}`}>
              {!a.insightsAvailable && <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">Instagram did not share reach and views for this account, so those show as 0. Reconnect the client with insights permission to fill them in.</p>}
              <div className="rounded-xl p-4 text-sm leading-relaxed" style={{ background: "#FFFBE3", border: "1px solid #F3E3A0" }}><b>In one minute.</b> {summary}</div>

              <Block title="Audience summary">
                <Metric label="Total followers" value={followersAt(a, range) ?? a.followers} prev={followersAt(b, prev)} />
                <Metric label="Net follower growth" value={gained(a, range)} prev={gained(b, prev)} perDay={n} />
                <Metric label="Profile and website taps" value={null} note="Not shared per period by Instagram" />
              </Block>

              {view !== "compare" && (
                <div className="grid gap-4 lg:grid-cols-3">
                  <Block title="Post and engagement summary" cols={1}>
                    <Metric label="Engagement on posts published" value={a.totals.interactions} prev={b?.totals.interactions} perDay={n} />
                    <Metric label="Total posts" value={a.totals.posts} prev={b?.totals.posts} perDay={n} />
                  </Block>
                  <div className="rounded-xl border border-border p-4">
                    <p className="text-[10.5px] font-bold uppercase tracking-wider text-[#555]">Top-performing post</p>
                    {top[0] ? (
                      <a href={top[0].permalink ?? "#"} target="_blank" rel="noreferrer" className="mt-2 block space-y-2">
                        <p className="text-xs text-muted">{new Date(top[0].timestamp).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · {kind(top[0])}</p>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {top[0].thumbnailUrl && <img src={top[0].thumbnailUrl} alt="" className="h-28 w-full rounded-lg object-cover" />}
                        <p className="line-clamp-3 text-sm">{top[0].caption}</p>
                        {[["Likes", top[0].likes], ["Comments", top[0].comments], ["Saves", top[0].saved], ["Shares", top[0].shares], ["Reach", top[0].reach], ["Views", top[0].views]].map(([k, v]) => (
                          <div key={k as string} className="flex justify-between border-b border-[#F4F2EC] py-1 text-xs"><span>{k}</span><b>{v == null ? "n/a" : fmt(v as number)}</b></div>
                        ))}
                      </a>
                    ) : <p className="mt-2 text-sm text-muted">No posts in this period.</p>}
                  </div>
                  <div className="rounded-xl border border-border p-4">
                    <p className="text-[10.5px] font-bold uppercase tracking-wider text-[#555]">Engagement by post type</p>
                    <Donut items={byType(a)} />
                  </div>
                </div>
              )}

              <Block title="Reach and views">
                <Metric label="Reach" value={a.totals.reach} prev={b?.totals.reach} perDay={n} />
                <Metric label="Views" value={a.totals.views} prev={b?.totals.views} perDay={n} />
                <Metric label="Saves" value={a.totals.saved} prev={b?.totals.saved} />
                <Metric label="Shares" value={a.totals.shares} prev={b?.totals.shares} />
              </Block>

              <Block title="Reels">
                <Metric label="Reels published" value={reels(a).length} prev={b ? reels(b).length : null} />
                <Metric label="Reel engagement" value={sum(reels(a), interactions)} prev={b ? sum(reels(b), interactions) : null} />
                <Metric label="Reel views" value={sum(reels(a), (p) => p.views ?? 0)} prev={b ? sum(reels(b), (p) => p.views ?? 0) : null} />
                <Metric label="Paid views" value={null} note="Kept separate. No paid data connected" />
              </Block>

              {view === "detailed" && (
                <>
                  <ChartCard title="Posts published vs engagement received over time" note={`Avg. posts per day: ${(a.totals.posts / n).toFixed(1)}`}>
                    <Combo rows={daily(a.posts, range)} />
                  </ChartCard>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <ChartCard title="Engagement actions received over time">
                      <Stacked rows={daily(a.posts, range)} />
                    </ChartCard>
                    <ChartCard title="Engagement breakdown">
                      <Donut items={([["Likes", a.totals.likes], ["Comments", a.totals.comments], ["Saves", a.totals.saved], ["Shares", a.totals.shares]] as Array<[string, number]>).filter((x) => x[1] > 0)} />
                    </ChartCard>
                  </div>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <ChartCard title="Posts by type">
                      <Donut items={Object.entries((a.posts ?? []).reduce<Record<string, number>>((m, p) => { m[kind(p)] = (m[kind(p)] ?? 0) + 1; return m; }, {})).sort((x, y) => y[1] - x[1])} />
                    </ChartCard>
                    <ChartCard title="Reach: this period vs the period before" note="Day 1 of each period lined up">
                      <Overlay a={daily(a.posts, range).map((d) => d.reach)} b={b ? daily(b.posts, prev).map((d) => d.reach) : []} labels={daily(a.posts, range).map((d) => short(d.date))} />
                    </ChartCard>
                  </div>
                  <div className="rounded-xl border border-border p-4">
                    <p className="mb-3 text-sm font-semibold" style={{ fontFamily: "var(--font-display)" }}>Followers over time</p>
                    <Spark points={(a.followerHistory ?? []).filter((p) => p.date >= range.from && p.date <= range.to)} />
                  </div>
                  <div className="rounded-xl border border-border p-4">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold" style={{ fontFamily: "var(--font-display)" }}>Every post in this period</p>
                      <div className="flex-1" />
                      <Seg options={["eng", "reach", "views", "date"] as const} labels={{ eng: "Engagement", reach: "Reach", views: "Views", date: "Newest" }} value={sortBy} onChange={setSortBy} />
                    </div>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                      {[...a.posts].sort((x, y) => sortBy === "date" ? y.timestamp.localeCompare(x.timestamp) : sortBy === "eng" ? interactions(y) - interactions(x) : ((y[sortBy] ?? 0) - (x[sortBy] ?? 0))).map((p) => (
                        <a key={p.id} href={p.permalink ?? "#"} target="_blank" rel="noreferrer" className="flex flex-col gap-1.5 rounded-xl border border-border p-2 text-xs hover:border-[#0E0E0E]">
                          <p className="text-[10.5px] text-muted">{new Date(p.timestamp).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · {kind(p)}</p>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          {p.thumbnailUrl ? <img src={p.thumbnailUrl} alt="" className="aspect-[4/5] w-full rounded-lg object-cover" /> : <div className="aspect-[4/5] rounded-lg bg-[#F1EFE8]" />}
                          <p className="line-clamp-2">{p.caption}</p>
                          {[["Likes", p.likes], ["Comments", p.comments], ["Saves", p.saved], ["Shares", p.shares], ["Reach", p.reach], ["Views", p.views], ["Engagement", interactions(p)]].map(([k, v]) => (
                            <div key={k as string} className="flex justify-between border-b border-[#F4F2EC] py-0.5"><span className="text-muted">{k}</span><b>{v == null ? "n/a" : fmt(v as number)}</b></div>
                          ))}
                          <div className="flex justify-between"><span className="text-muted">Engagement rate</span><b>{p.reach ? `${((interactions(p) / p.reach) * 100).toFixed(1)}%` : "n/a"}</b></div>
                        </a>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-xl border border-border p-4">
                    <p className="mb-1 text-sm font-semibold" style={{ fontFamily: "var(--font-display)" }}>Best time to post</p>
                    <p className="mb-3 text-xs text-muted">Engagement earned by posts published at each day and hour (Lagos time). Darker means more.</p>
                    <Heat posts={a.posts} />
                  </div>
                </>
              )}

              {view !== "summary" && (
                <div className="overflow-x-auto rounded-xl border border-border p-4">
                  <p className="mb-3 text-sm font-semibold" style={{ fontFamily: "var(--font-display)" }}>Side by side</p>
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-xs text-muted"><th className="py-2">Metric</th><th className="py-2 text-right">{label(range)}</th><th className="py-2 text-right">{label(prev)}</th><th className="py-2 text-right">Change</th></tr></thead>
                    <tbody>
                      {rows.map(([k, x, y]) => {
                        const d = x != null && y ? Math.round(((x - y) / Math.abs(y)) * 1000) / 10 : null;
                        return <tr key={k} className="border-t border-[#F0EEE8]"><td className="py-2">{k}</td><td className="py-2 text-right font-semibold">{x == null ? "n/a" : x.toLocaleString("en-NG")}</td><td className="py-2 text-right text-muted">{y == null ? "n/a" : y.toLocaleString("en-NG")}</td><td className="py-2 text-right font-semibold" style={{ color: d == null ? "#999" : d < 0 ? "#E0433A" : "#1F9D55" }}>{d == null ? "n/a" : `${d < 0 ? "▼" : "▲"} ${Math.abs(d)}%`}</td></tr>;
                      })}
                    </tbody>
                  </table>
                  <p className="mt-2 text-xs text-muted">Organic only. Reach is the sum of each post&apos;s reach, so one person reached by two posts counts twice. Follower history starts from the day the tool first saved it.</p>
                </div>
              )}
              <p className="border-t border-border pt-3 text-xs text-muted">Prepared by Blizsocials. No customer names or messages appear in this report.<br /><i>Seest thou a man diligent in his business? he shall stand before kings. Proverbs 22:29</i></p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function ChartCard({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border p-4">
      <div className="mb-3 flex flex-wrap items-baseline gap-2"><p className="text-sm font-semibold" style={{ fontFamily: "var(--font-display)" }}>{title}</p><div className="flex-1" />{note && <p className="text-[11px] font-semibold" style={{ color: "#E0433A" }}>{note}</p>}</div>
      {children}
    </div>
  );
}

function axisTicks(rows: DayRow[]) {
  const step = Math.max(1, Math.ceil(rows.length / 8));
  return rows.map((r, i) => (i % step === 0 ? short(r.date) : ""));
}

function Combo({ rows }: { rows: DayRow[] }) {
  const W = 700, H = 200, pad = 28;
  const mp = Math.max(1, ...rows.map((r) => r.posts)), me = Math.max(1, ...rows.map((r) => r.eng));
  const bw = (W - pad * 2) / rows.length;
  const x = (i: number) => pad + i * bw + bw / 2;
  const line = rows.map((r, i) => `${i ? "L" : "M"}${x(i)},${H - pad - (r.eng / me) * (H - pad * 2)}`).join(" ");
  const ticks = axisTicks(rows);
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-52 w-full min-w-[520px]" aria-label="Posts and engagement by day">
        {[0, 0.5, 1].map((f) => <g key={f}><line x1={pad} x2={W - pad} y1={H - pad - f * (H - pad * 2)} y2={H - pad - f * (H - pad * 2)} stroke="#EEE" /><text x={4} y={H - pad - f * (H - pad * 2) + 3} fontSize="9" fill="#888">{Math.round(mp * f)}</text><text x={W - 4} textAnchor="end" y={H - pad - f * (H - pad * 2) + 3} fontSize="9" fill="#888">{fmt(Math.round(me * f))}</text></g>)}
        <path d={`${line} L${x(rows.length - 1)},${H - pad} L${x(0)},${H - pad}Z`} fill="#FFF3B0" opacity="0.7" />
        {rows.map((r, i) => <rect key={r.date} x={x(i) - bw * 0.3} width={bw * 0.6} y={H - pad - (r.posts / mp) * (H - pad * 2)} height={(r.posts / mp) * (H - pad * 2)} fill="#0E0E0E" rx="2"><title>{`${short(r.date)}: ${r.posts} posts, ${r.eng} engagements`}</title></rect>)}
        <path d={line} fill="none" stroke="#E0B800" strokeWidth="2.5" />
        {ticks.map((t, i) => t && <text key={i} x={x(i)} y={H - 8} fontSize="9" textAnchor="middle" fill="#888">{t}</text>)}
      </svg>
      <div className="flex gap-4 text-[11px] text-muted"><span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-[#0E0E0E]" />Posts published (left)</span><span><i className="mr-1 inline-block h-2 w-2 rounded-sm" style={{ background: "#E0B800" }} />Engagement received (right)</span></div>
    </div>
  );
}

function Stacked({ rows }: { rows: DayRow[] }) {
  const W = 700, H = 200, pad = 24;
  const keys: Array<[keyof DayRow, string, string]> = [["likes", "Likes", "#0E0E0E"], ["comments", "Comments", "#FFD701"], ["saved", "Saves", "#B8B4A8"], ["shares", "Shares", "#E9A23B"]];
  const max = Math.max(1, ...rows.map((r) => r.likes + r.comments + r.saved + r.shares));
  const bw = (W - pad * 2) / rows.length;
  const ticks = axisTicks(rows);
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-52 w-full min-w-[480px]" aria-label="Engagement actions by day">
        {rows.map((r, i) => {
          let y = H - pad;
          return <g key={r.date}>{keys.map(([k, , c]) => { const h = ((r[k] as number) / max) * (H - pad * 2); y -= h; return <rect key={k as string} x={pad + i * bw + bw * 0.2} width={bw * 0.6} y={y} height={h} fill={c}><title>{`${short(r.date)} ${k}: ${r[k]}`}</title></rect>; })}</g>;
        })}
        {ticks.map((t, i) => t && <text key={i} x={pad + i * bw + bw / 2} y={H - 6} fontSize="9" textAnchor="middle" fill="#888">{t}</text>)}
      </svg>
      <div className="flex flex-wrap gap-3 text-[11px] text-muted">{keys.map(([, l, c]) => <span key={l}><i className="mr-1 inline-block h-2 w-2 rounded-sm" style={{ background: c }} />{l}</span>)}</div>
    </div>
  );
}

function Overlay({ a, b, labels }: { a: number[]; b: number[]; labels: string[] }) {
  const W = 700, H = 200, pad = 24;
  const max = Math.max(1, ...a, ...b);
  const n = Math.max(a.length, 2);
  const path = (v: number[]) => v.map((y, i) => `${i ? "L" : "M"}${pad + (i / (n - 1)) * (W - pad * 2)},${H - pad - (y / max) * (H - pad * 2)}`).join(" ");
  const step = Math.max(1, Math.ceil(labels.length / 8));
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-52 w-full min-w-[480px]" aria-label="Reach comparison">
        {b.length > 0 && <path d={path(b.slice(0, n))} fill="none" stroke="#B8B4A8" strokeWidth="2" strokeDasharray="5 4" />}
        <path d={`${path(a)} L${W - pad},${H - pad} L${pad},${H - pad}Z`} fill="#FFF3B0" opacity="0.6" />
        <path d={path(a)} fill="none" stroke="#0E0E0E" strokeWidth="2.5" />
        {labels.map((t, i) => i % step === 0 && <text key={i} x={pad + (i / (n - 1)) * (W - pad * 2)} y={H - 6} fontSize="9" textAnchor="middle" fill="#888">{t}</text>)}
      </svg>
      <div className="flex gap-4 text-[11px] text-muted"><span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-[#0E0E0E]" />This period</span><span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-[#B8B4A8]" />Period before</span></div>
    </div>
  );
}

function Seg<T extends string>({ options, value, onChange, labels }: { options: readonly T[]; value: T; onChange: (v: T) => void; labels?: Record<string, string> }) {
  return (
    <div className="flex max-w-full overflow-x-auto rounded-lg bg-[#F1EFE8] p-0.5">
      {options.map((o) => (
        <button key={o} type="button" onClick={() => onChange(o)} className="h-8 whitespace-nowrap rounded-md px-3 text-xs font-semibold" style={value === o ? { background: "#fff", boxShadow: "0 1px 2px #0002" } : { color: "#555" }}>{labels?.[o] ?? o}</button>
      ))}
    </div>
  );
}

function Block({ title, children, cols }: { title: string; children: React.ReactNode; cols?: number }) {
  return (
    <div className="rounded-xl border border-border">
      <p className="px-4 pt-3 text-sm font-semibold" style={{ fontFamily: "var(--font-display)" }}>{title}</p>
      <div className={`grid ${cols === 1 ? "grid-cols-1" : "grid-cols-2 md:grid-cols-4"}`}>{children}</div>
    </div>
  );
}

function Metric({ label, value, prev, perDay, note }: { label: string; value: number | null | undefined; prev?: number | null; perDay?: number; note?: string }) {
  const d = value != null && prev ? Math.round(((value - prev) / Math.abs(prev)) * 1000) / 10 : null;
  return (
    <div className="px-4 py-3">
      <p className="text-[10.5px] font-bold uppercase tracking-wider text-[#555]">{label}</p>
      {value == null ? (
        <p className="mt-2 text-sm text-[#aaa]">{note ?? "Not available yet"}</p>
      ) : (
        <>
          <p className="mt-1 flex items-baseline gap-2 text-2xl font-semibold sm:text-3xl" style={{ fontFamily: "var(--font-display)" }}>
            {fmt(value)}
            {d != null && <span className="text-xs font-bold" style={{ color: d < 0 ? "#E0433A" : "#1F9D55", fontFamily: "inherit" }}>{d < 0 ? "↓" : "↑"} {Math.abs(d)}%</span>}
          </p>
          {perDay ? <p className="text-xs text-muted">Avg. per day: <b className="text-foreground">{value / perDay < 1 && value > 0 ? "<1" : Math.round(value / perDay).toLocaleString("en-NG")}</b></p> : null}
          {prev != null && <p className="text-[11px] text-[#999]">Before: {fmt(prev)}</p>}
        </>
      )}
    </div>
  );
}

function Donut({ items }: { items: Array<[string, number]> }) {
  const total = items.reduce((s, x) => s + x[1], 0);
  if (!total) return <p className="mt-3 text-sm text-muted">No engagement in this period.</p>;
  const C = 2 * Math.PI * 36;
  const cols = ["#0E0E0E", "#FFD701", "#B8B4A8", "#E9C46A"];
  const offsets = items.map((_, i) => items.slice(0, i).reduce((s, x) => s + x[1] / total, 0));
  return (
    <div className="mt-3 flex items-center gap-4">
      <svg width="110" height="110" viewBox="0 0 100 100" aria-hidden>
        {items.map(([k, v], i) => <circle key={k} r="36" cx="50" cy="50" fill="none" stroke={cols[i % 4]} strokeWidth="16" strokeDasharray={`${(v / total) * C} ${C}`} strokeDashoffset={-offsets[i] * C} transform="rotate(-90 50 50)" />)}
        <text x="50" y="53" textAnchor="middle" fontSize="12" fontWeight="700">{fmt(total)}</text>
      </svg>
      <table className="text-xs">
        <tbody>{items.map(([k, v], i) => <tr key={k}><td className="pr-2"><span className="mr-1.5 inline-block h-2 w-2 rounded-sm" style={{ background: cols[i % 4] }} />{k}</td><td className="pr-2 text-right font-semibold">{fmt(v)}</td><td className="text-right text-muted">{((v / total) * 100).toFixed(1)}%</td></tr>)}</tbody>
      </table>
    </div>
  );
}

function Spark({ points }: { points: Array<{ date: string; followers: number }> }) {
  if (points.length < 2) return <p className="text-sm text-muted">Not enough history yet. The tool saves followers daily, so this fills in over the coming days.</p>;
  const min = Math.min(...points.map((p) => p.followers)), max = Math.max(...points.map((p) => p.followers));
  const w = 600, h = 120;
  const d = points.map((p, i) => `${i ? "L" : "M"}${(i / (points.length - 1)) * w},${h - ((p.followers - min) / (max - min || 1)) * (h - 10) - 5}`).join(" ");
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-32 w-full" preserveAspectRatio="none" aria-hidden><path d={`${d} L${w},${h} L0,${h}Z`} fill="#FFF3B0" /><path d={d} fill="none" stroke="#0E0E0E" strokeWidth="2" /></svg>
      <div className="flex justify-between text-[11px] text-muted"><span>{points[0].date} · {fmt(points[0].followers)}</span><span>{points[points.length - 1].date} · {fmt(points[points.length - 1].followers)}</span></div>
    </div>
  );
}

function Heat({ posts }: { posts: Post[] }) {
  const grid = Array.from({ length: 7 }, () => Array(24).fill(0) as number[]);
  for (const p of posts) {
    const t = new Date(new Date(p.timestamp).getTime() + 3_600_000);
    grid[t.getUTCDay()][t.getUTCHours()] += interactions(p);
  }
  const max = Math.max(1, ...grid.flat());
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[640px] gap-0.5 text-[9.5px]" style={{ gridTemplateColumns: "40px repeat(24, 1fr)" }}>
        <span />
        {Array.from({ length: 24 }, (_, i) => <span key={i} className="text-center text-muted">{i % 3 === 0 ? `${i % 12 || 12}${i < 12 ? "a" : "p"}` : ""}</span>)}
        {grid.map((row, di) => [
          <span key={`l${di}`} className="text-muted">{names[di]}</span>,
          ...row.map((v, hi) => <span key={`${di}-${hi}`} title={`${names[di]} ${hi}:00 · ${v} engagements`} className="h-4 rounded-sm" style={{ background: v ? `rgba(255,215,1,${0.2 + (0.8 * v) / max})` : "#F4F2EC" }} />),
        ])}
      </div>
    </div>
  );
}
