"use client";

/**
 * Blizsocials: combined organic totals across every client for the chosen
 * range. Fetches each account's overview and adds them up.
 */

import { useEffect, useState } from "react";

type Totals = { posts: number; views: number; reach: number; likes: number; comments: number; saved: number; shares: number; interactions: number };
type Row = { username: string; totals: Totals; followers: number | null };

const KEYS: Array<[keyof Totals, string]> = [
  ["posts", "Posts"],
  ["reach", "Reach"],
  ["views", "Views"],
  ["likes", "Likes"],
  ["comments", "Comments"],
  ["shares", "Shares"],
  ["saved", "Saves"],
  ["interactions", "Interactions"],
];

const fmt = (n: number) => n.toLocaleString("en-GB");

export default function AllClientsTotals({ accounts, rangeQuery }: { accounts: Array<{ id: string; username: string }>; rangeQuery: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all(
      accounts.map((a) =>
        fetch(`/api/instagram/overview?instagramAccountId=${a.id}&${rangeQuery}`)
          .then((r) => r.json())
          .then((res) => (res.success ? { username: a.username, totals: res.data.totals as Totals, followers: res.data.followers as number | null } : null))
          .catch(() => null)
      )
    ).then((list) => {
      if (alive) setRows(list.filter(Boolean) as Row[]);
    });
    return () => {
      alive = false;
    };
  }, [accounts, rangeQuery]);

  const sum = (k: keyof Totals) => (rows ?? []).reduce((s, r) => s + (r.totals[k] ?? 0), 0);
  const followers = (rows ?? []).reduce((s, r) => s + (r.followers ?? 0), 0);

  return (
    <section className="panel rounded-2xl p-5 space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold">All clients combined</h2>
        <span className="text-xs text-muted">Instagram, organic only · {accounts.length} clients</span>
      </div>
      {!rows ? (
        <p className="text-sm text-muted">Adding up every client…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <div className="rounded-xl bg-[#0E0E0E] p-3 text-[#FFD701]">
              <div className="text-xs font-semibold">Followers</div>
              <div className="text-xl font-bold">{fmt(followers)}</div>
            </div>
            {KEYS.map(([k, label]) => (
              <div key={k} className="rounded-xl border border-border p-3">
                <div className="text-xs font-semibold text-muted">{label}</div>
                <div className="text-xl font-bold">{fmt(sum(k))}</div>
              </div>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="py-2">Client</th><th>Followers</th><th>Posts</th><th>Reach</th><th>Likes</th><th>Comments</th><th>Shares</th>
                </tr>
              </thead>
              <tbody>
                {[...rows].sort((a, b) => b.totals.reach - a.totals.reach).map((r) => (
                  <tr key={r.username} className="border-t border-border">
                    <td className="py-2 font-semibold">@{r.username}</td>
                    <td>{r.followers == null ? "n/a" : fmt(r.followers)}</td>
                    <td>{fmt(r.totals.posts)}</td>
                    <td>{fmt(r.totals.reach)}</td>
                    <td>{fmt(r.totals.likes)}</td>
                    <td>{fmt(r.totals.comments)}</td>
                    <td>{fmt(r.totals.shares ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
