"use client";

/**
 * Blizsocials: clients and their non-Meta platform connections. Staff create a
 * connect link per client; the client opens it and connects YouTube (and later
 * Pinterest, TikTok, LinkedIn) themselves. Meta accounts come through the
 * agency's Facebook login instead.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

type Account = { id: string; username: string };
type Link = { id: string; clientName: string; instagramAccountId: string | null; url: string; expiresAt: string; createdAt: string };
type Connection = { id: string; clientName: string; instagramAccountId: string | null; platform: string; name: string; handle: string | null; avatarUrl: string | null };

const BLACK = "#0E0E0E";
const YELLOW = "#FFD701";
const PLATFORM_NAMES: Record<string, string> = { youtube: "YouTube", pinterest: "Pinterest", tiktok: "TikTok", linkedin: "LinkedIn" };

const NOTICES: Record<string, string> = {
  connected: "YouTube channel connected.",
  denied: "The YouTube connection was cancelled.",
  no_channel: "That Google account has no YouTube channel.",
  not_configured: "YouTube is not switched on yet: the Google app settings are missing.",
  invalid: "The connection timed out. Please try again.",
  failed: "The YouTube connection failed.",
};

export default function ClientsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [links, setLinks] = useState<Link[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [name, setName] = useState("");
  const [igId, setIgId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/connect-links")
      .then((r) => r.json())
      .then((p) => {
        if (p.success) {
          setLinks(p.data.links);
          setConnections(p.data.connections);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/instagram/accounts")
      .then((r) => r.json())
      .then((p) => setAccounts(p?.data?.instagramAccounts ?? []))
      .catch(() => {});
    load();
    const q = new URLSearchParams(window.location.search);
    const yt = q.get("youtube");
    if (yt) {
      const reason = q.get("reason");
      void Promise.resolve().then(() => setMessage(`${NOTICES[yt] ?? yt}${reason ? ` (${reason})` : ""}`));
    }
  }, [load]);

  const usernameOf = useMemo(() => new Map(accounts.map((a) => [a.id, a.username])), [accounts]);

  async function createLink() {
    if (!name.trim()) return setMessage("Enter the client's name");
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/connect-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientName: name.trim(), instagramAccountId: igId || null }),
      });
      const p = await res.json();
      if (!p.success) throw new Error(p.error ?? "Could not create the link");
      setName("");
      setIgId("");
      load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not create the link");
    } finally {
      setBusy(false);
    }
  }

  async function copy(url: string, id: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setMessage(url);
    }
  }

  function whatsappText(l: Link) {
    return encodeURIComponent(
      `Hi ${l.clientName}, please use this secure link to connect your YouTube and other accounts to Blizsocials, so our team can post and report for you. You sign in yourself, so we never see your password: ${l.url}`
    );
  }

  const clientsWithConnections = useMemo(() => {
    const map = new Map<string, Connection[]>();
    for (const c of connections) {
      const key = c.clientName || "Unassigned";
      map.set(key, [...(map.get(key) ?? []), c]);
    }
    return [...map.entries()];
  }, [connections]);

  const field = "w-full rounded-xl border border-border bg-surface px-3 py-3 text-sm outline-none focus:border-accent";

  return (
    <div className="p-4 sm:p-8 max-w-5xl mx-auto flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Clients</h1>
        <p className="text-sm text-muted">
          Instagram and Facebook connect through your Business Manager. For YouTube and other platforms, send each client a connect link.
        </p>
      </div>

      {message && <p role="status" className="panel p-4 text-sm font-semibold">{message}</p>}

      <section className="panel p-5 flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Create a connect link</h2>
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          <label className="flex flex-col gap-2 text-sm font-semibold">
            Client name
            <input value={name} onChange={(e) => setName(e.target.value)} className={field} placeholder="e.g. Schoolhub" />
          </label>
          <label className="flex flex-col gap-2 text-sm font-semibold">
            Their Instagram (optional)
            <select value={igId} onChange={(e) => setIgId(e.target.value)} className={field}>
              <option value="">Not on Instagram yet</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>@{a.username}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          <button type="button" disabled={busy} onClick={() => void createLink()} className="rounded-xl px-5 py-3 text-sm font-bold disabled:opacity-50" style={{ background: YELLOW, color: BLACK }}>
            Create link
          </button>
          <a href="/api/connect/youtube/start" className="rounded-xl px-5 py-3 text-sm font-semibold border border-border bg-surface">
            Connect a YouTube channel myself
          </a>
        </div>
        <p className="text-xs text-muted">Links stay valid for 7 days. The client signs in to each platform themselves.</p>
      </section>

      <section className="panel p-5 flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Connect links</h2>
        {links.length === 0 && <p className="text-sm text-muted">No links yet.</p>}
        {links.map((l) => {
          const expired = new Date(l.expiresAt) < new Date();
          return (
            <div key={l.id} className="flex flex-wrap items-center gap-3 border-t border-border pt-3">
              <div className="flex flex-col min-w-0" style={{ flex: "1 1 240px" }}>
                <span className="text-sm font-semibold">
                  {l.clientName}
                  {l.instagramAccountId && usernameOf.get(l.instagramAccountId) ? ` · @${usernameOf.get(l.instagramAccountId)}` : ""}
                </span>
                <span className="text-xs text-muted truncate">{expired ? "Expired" : `Valid until ${new Date(l.expiresAt).toLocaleDateString()}`} · {l.url}</span>
              </div>
              {!expired && (
                <>
                  <button type="button" onClick={() => void copy(l.url, l.id)} className="rounded-xl px-4 py-2 text-sm font-semibold border border-border bg-surface">
                    {copied === l.id ? "Copied" : "Copy link"}
                  </button>
                  <a href={`https://wa.me/?text=${whatsappText(l)}`} target="_blank" rel="noopener noreferrer" className="rounded-xl px-4 py-2 text-sm font-semibold" style={{ background: BLACK, color: YELLOW }}>
                    Send on WhatsApp
                  </a>
                </>
              )}
            </div>
          );
        })}
      </section>

      <section className="panel p-5 flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Connected accounts outside Meta</h2>
        {clientsWithConnections.length === 0 && <p className="text-sm text-muted">Nothing connected yet.</p>}
        {clientsWithConnections.map(([client, list]) => (
          <div key={client} className="flex flex-col gap-2 border-t border-border pt-3">
            <span className="text-sm font-semibold">{client}</span>
            <div className="flex flex-wrap gap-2">
              {list.map((c) => (
                <span key={c.id} className="rounded-full px-3 py-1 text-xs font-semibold" style={{ background: "#F0EEE6" }}>
                  {PLATFORM_NAMES[c.platform] ?? c.platform}: {c.name}
                </span>
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
