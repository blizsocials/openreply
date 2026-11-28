"use client";

/**
 * Blizsocials unified inbox (Business Suite style).
 *
 * Channels per client: Instagram DMs, Facebook Messenger, Instagram comments
 * and Facebook comments. Team workflow (assign, Priority, Follow up, internal
 * note) is stored per thread in InboxThreadState so every staff member sees
 * the same state with their own login. Unread and saved replies stay per
 * browser.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AccountSelect, { type AccountOption } from "@/components/account-select";
import { PlatformIcon } from "@/components/platform-icon";
import { onClientChange, readClient } from "@/lib/client-selection";

const YELLOW = "#FFD701";
const BLACK = "#0E0E0E";
const WINDOW_MS = 24 * 3_600_000;
const EMOJIS = ["🙏", "❤️", "😊", "😂", "🔥", "👏", "🎉", "✨", "👍", "🤗", "💛", "📩"];
const AVATAR_COLORS = ["#F4D35E", "#EE964B", "#9BC1BC", "#C3B1E1", "#F7A9A8", "#A8D5BA", "#FFD6A5", "#BDE0FE"];

type Platform = "ig" | "fb";
type Tab = "all" | "ig" | "fb" | "igc" | "fbc";
type Thread = {
  key: string;
  platform: Platform;
  kind: "dm" | "comment";
  id: string;
  name: string;
  contactId: string;
  time: string | null;
  preview: string;
  fromMe: boolean;
  replied?: boolean;
  media?: { id: string; thumb: string | null; permalink: string | null; caption: string | null };
  fullText?: string;
};
type Msg = { id: string; text: string; fromMe: boolean; createdTime: string | null };
type State = { key: string; assigneeId: string | null; priority: boolean; followUp: boolean; note: string | null };
type Mate = { id: string; name: string };

function ago(iso: string | null, now: number): string {
  if (!iso) return "";
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = s / 60, h = m / 60, d = h / 24;
  if (m < 60) return `${Math.round(m)} min ago`;
  if (h < 24) return `about ${Math.round(h)} hour${Math.round(h) === 1 ? "" : "s"} ago`;
  if (d < 30) return `${Math.round(d)} day${Math.round(d) === 1 ? "" : "s"} ago`;
  return `about ${Math.round(d / 30)} month${Math.round(d / 30) === 1 ? "" : "s"} ago`;
}

function friendlyError(raw: string): string {
  if (/administrator, editor, or moderator|Two Factor/i.test(raw))
    return "Meta is blocking this client because your Facebook profile does not have full access to their Page, or the Page needs two-factor authentication. Give your profile full control of the Page in their Business Manager, turn on two-factor authentication, then click Add or refresh clients.";
  if (/disabled access to Instagram messages/i.test(raw))
    return "The client has switched off message access. On their Instagram app: Settings, Messages and story replies, Message controls, Connected tools, then turn on Allow access to messages. Then press Sync.";
  if (/pages_messaging|pages_read_user_content|pages_manage_engagement|permission|\(#10\)|\(#200\)/i.test(raw))
    return "Facebook needs one more permission for this. Click Add or refresh clients in the sidebar and approve the new Messenger and comments access.";
  if (/not connected through Facebook/i.test(raw)) return raw;
  if (/timeout|aborted|Failed to load/i.test(raw)) return "The platform took too long to answer. Press Sync to try again.";
  return raw;
}

function Avatar({ name, size = 44, platform }: { name: string; size?: number; platform?: Platform }) {
  const n = name.replace(/^@/, "") || "?";
  const color = AVATAR_COLORS[n.charCodeAt(0) % AVATAR_COLORS.length];
  return (
    <span className="relative shrink-0">
      <span className="flex items-center justify-center rounded-full font-bold" style={{ width: size, height: size, background: color, color: BLACK, fontSize: size * 0.38 }}>
        {n[0].toUpperCase()}
      </span>
      {platform && (
        <span className="absolute -bottom-0.5 -right-0.5 flex items-center justify-center rounded-full bg-white p-0.5 shadow">
          <PlatformIcon id={platform === "ig" ? "instagram" : "facebook"} size={13} />
        </span>
      )}
    </span>
  );
}

function readLocal<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const v = window.localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeLocal(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

// A slow answer from Instagram must not hold the screen hostage, so every read
// gives up after 30 seconds and reports a failure for that one source.
async function getJson(url: string) {
  const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(30_000) });
  return r.json();
}

export default function InboxPage() {
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [accountId, setAccountId] = useState("");
  const [tab, setTab] = useState<Tab>("all");
  const [now, setNow] = useState(() => Date.now());

  const [igDms, setIgDms] = useState<Thread[]>([]);
  const [fbDms, setFbDms] = useState<Thread[]>([]);
  const [igComments, setIgComments] = useState<Thread[]>([]);
  const [fbComments, setFbComments] = useState<Thread[]>([]);
  const [errors, setErrors] = useState<Partial<Record<Tab, string>>>({});
  const [loading, setLoading] = useState(false);

  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "unread" | "priority" | "follow" | "mine" | "open">("all");
  const [showInfo, setShowInfo] = useState(true);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [seen, setSeen] = useState<Record<string, string>>(() => readLocal("inbox:seen", {}));
  const [savedReplies, setSavedReplies] = useState<string[]>(() =>
    readLocal("inbox:savedReplies", ["Thank you so much! 🙏", "Please check your DM, we just sent you the details.", "We'll get back to you shortly."])
  );

  const [states, setStates] = useState<Record<string, State>>({});
  const [team, setTeam] = useState<Mate[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  // Clients + team state.
  useEffect(() => {
    getJson("/api/instagram/accounts")
      .then((p) => {
        const list: AccountOption[] = p?.data?.instagramAccounts ?? [];
        setAccounts(list);
        const saved = readClient();
        setAccountId((prev) => prev || (saved && saved !== "all" && list.some((a) => a.id === saved) ? saved : list[0]?.id ?? ""));
      })
      .catch(() => {});
    getJson("/api/inbox/state")
      .then((p) => {
        if (!p.success) return;
        setMe(p.data.me);
        setTeam(p.data.team);
        setStates(Object.fromEntries((p.data.states as State[]).map((s) => [s.key, s])));
      })
      .catch(() => {});
    return onClientChange((id) => {
      if (id && id !== "all") setAccountId(id);
    });
  }, []);

  const load = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    const q = `instagramAccountId=${accountId}`;
    type IgConv = { id: string; contact: { id: string; username: string | null }; updatedTime: string | null; lastMessage: { text: string; fromMe: boolean } | null; detailsUnavailable?: boolean };
    type FbConv = { id: string; contact: { id: string; name: string | null }; updatedTime: string | null; lastMessage: { text: string; fromMe: boolean } | null };
    type Cm = { id: string; text: string; username: string | null; timestamp: string; replied: boolean; media: Thread["media"] };
    const failed = { success: false, error: "Failed to load" };
    // Each source shows up as soon as it arrives. One slow source (Instagram
    // messages can take a long time) no longer keeps the others waiting.
    const settle = (key: Tab, res: { success?: boolean; error?: string }, apply: () => void) => {
      if (res.success) {
        apply();
        setErrors((prev) => {
          const { [key]: _removed, ...rest } = prev;
          void _removed;
          return rest;
        });
      } else {
        setErrors((prev) => ({ ...prev, [key]: res.error ?? "Failed to load" }));
      }
    };
    await Promise.all([
      getJson(`/api/instagram/conversations?${q}`).catch(() => failed).then((ig) =>
        settle("ig", ig, () =>
          setIgDms((ig.data.conversations as IgConv[]).map((c) => ({
            key: `ig:${c.id}`, platform: "ig", kind: "dm", id: c.id,
            name: c.detailsUnavailable ? "Details unavailable" : `@${c.contact.username ?? "unknown"}`,
            contactId: c.contact.id, time: c.updatedTime,
            preview: c.lastMessage ? c.lastMessage.text || "📎 Attachment" : "No messages", fromMe: !!c.lastMessage?.fromMe,
          })))
        )
      ),
      getJson(`/api/instagram/comments?${q}`).catch(() => failed).then((igc) =>
        settle("igc", igc, () =>
          setIgComments((igc.data.comments as Cm[]).map((c) => ({
            key: `igc:${c.id}`, platform: "ig", kind: "comment", id: c.id, name: `@${c.username ?? "unknown"}`, contactId: "",
            time: c.timestamp, preview: c.text, fullText: c.text, fromMe: false, replied: c.replied, media: c.media,
          })))
        )
      ),
      getJson(`/api/facebook/inbox?kind=messenger&${q}`).catch(() => failed).then((fb) =>
        settle("fb", fb, () =>
          setFbDms((fb.data.conversations as FbConv[]).map((c) => ({
            key: `fb:${c.id}`, platform: "fb", kind: "dm", id: c.id, name: c.contact.name ?? "Facebook user",
            contactId: c.contact.id, time: c.updatedTime,
            preview: c.lastMessage ? c.lastMessage.text || "📎 Attachment" : "No messages", fromMe: !!c.lastMessage?.fromMe,
          })))
        )
      ),
      getJson(`/api/facebook/inbox?kind=comments&${q}`).catch(() => failed).then((fbc) =>
        settle("fbc", fbc, () =>
          setFbComments((fbc.data.comments as Cm[]).map((c) => ({
            key: `fbc:${c.id}`, platform: "fb", kind: "comment", id: c.id, name: c.username ?? "Facebook user", contactId: "",
            time: c.timestamp, preview: c.text, fullText: c.text, fromMe: false, replied: c.replied, media: c.media,
          })))
        )
      ),
    ]);
    setLoading(false);
  }, [accountId]);

  useEffect(() => {
    void Promise.resolve().then(() => {
      setIgDms([]); setFbDms([]); setIgComments([]); setFbComments([]); setActiveKey(null);
      void load();
    });
    const t = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(t);
  }, [load]);

  const all = useMemo(() => [...igDms, ...fbDms, ...igComments, ...fbComments], [igDms, fbDms, igComments, fbComments]);
  const active = all.find((t) => t.key === activeKey) ?? null;

  const loadThread = useCallback(async (t: Thread, silent: boolean) => {
    if (t.kind !== "dm") return;
    if (!silent) setThreadLoading(true);
    const url = t.platform === "ig"
      ? `/api/instagram/conversations/${t.id}?instagramAccountId=${accountId}`
      : `/api/facebook/inbox?kind=thread&id=${encodeURIComponent(t.id)}&instagramAccountId=${accountId}`;
    const p = await getJson(url).catch(() => null);
    if (p?.success) setMessages(p.data.messages);
    if (!silent) setThreadLoading(false);
  }, [accountId]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, activeKey]);

  function open(t: Thread) {
    setActiveKey(t.key);
    setMessages([]);
    setSendError(null);
    setDraft("");
    setNoteDraft(states[t.key]?.note ?? "");
    setSeen((prev) => {
      const next = { ...prev, [t.key]: new Date().toISOString() };
      writeLocal("inbox:seen", next);
      return next;
    });
    void loadThread(t, false);
  }

  async function saveState(key: string, patch: Partial<State>) {
    setStates((s) => {
      const base: State = s[key] ?? { key, assigneeId: null, priority: false, followUp: false, note: null };
      return { ...s, [key]: { ...base, ...patch } };
    });
    await fetch("/api/inbox/state", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, ...patch }) }).catch(() => {});
  }

  async function send() {
    const text = draft.trim();
    if (!active || !text || sending) return;
    setSending(true);
    setSendError(null);
    let res: { success?: boolean; error?: string } = {};
    if (active.kind === "dm" && active.platform === "ig")
      res = await fetch("/api/instagram/conversations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ instagramAccountId: accountId, recipientId: active.contactId, text }) }).then((r) => r.json()).catch(() => ({ error: "Send failed" }));
    else if (active.kind === "dm")
      res = await fetch("/api/facebook/inbox", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "message", instagramAccountId: accountId, recipientId: active.contactId, text }) }).then((r) => r.json()).catch(() => ({ error: "Send failed" }));
    else if (active.platform === "ig")
      res = await fetch("/api/instagram/comments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ instagramAccountId: accountId, commentId: active.id, mediaId: active.media?.id, text }) }).then((r) => r.json()).catch(() => ({ error: "Reply failed" }));
    else
      res = await fetch("/api/facebook/inbox", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "comment", instagramAccountId: accountId, commentId: active.id, text }) }).then((r) => r.json()).catch(() => ({ error: "Reply failed" }));
    setSending(false);
    if (res.success) {
      setDraft("");
      if (active.kind === "dm") {
        setMessages((m) => [...m, { id: `local-${Date.now()}`, text, fromMe: true, createdTime: new Date().toISOString() }]);
        void loadThread(active, true);
      } else {
        const mark = (list: Thread[]) => list.map((t) => (t.key === active.key ? { ...t, replied: true } : t));
        if (active.platform === "ig") setIgComments(mark); else setFbComments(mark);
      }
    } else setSendError(friendlyError(res.error ?? "Send failed"));
  }

  const isUnread = (t: Thread) =>
    t.kind === "dm" ? !t.fromMe && !!t.time && (!seen[t.key] || t.time > seen[t.key]) : !t.replied;
  const windowClosed = (t: Thread) => t.kind === "dm" && !t.fromMe && !!t.time && now - new Date(t.time).getTime() > WINDOW_MS;

  const tabLists: Record<Tab, Thread[]> = {
    all: [...igDms, ...fbDms].sort((a, b) => (b.time ?? "").localeCompare(a.time ?? "")),
    ig: igDms,
    fb: fbDms,
    igc: igComments,
    fbc: fbComments,
  };
  const q = query.trim().toLowerCase().replace(/^@/, "");
  const shown = tabLists[tab].filter((t) => {
    if (q && !t.name.toLowerCase().includes(q) && !t.preview.toLowerCase().includes(q)) return false;
    const st = states[t.key];
    if (filter === "unread") return isUnread(t);
    if (filter === "priority") return !!st?.priority;
    if (filter === "follow") return !!st?.followUp;
    if (filter === "mine") return !!me && st?.assigneeId === me;
    if (filter === "open") return t.kind === "dm" && !windowClosed(t);
    return true;
  });
  const count = (list: Thread[]) => list.filter(isUnread).length;
  const tabs: Array<[Tab, string, number, string | null]> = [
    ["all", "All DMs", count(igDms) + count(fbDms), null],
    ["ig", "DMs", count(igDms), "instagram"],
    ["fb", "Messenger", count(fbDms), "facebook"],
    ["igc", "Comments", count(igComments), "instagram"],
    ["fbc", "Comments", count(fbComments), "facebook"],
  ];
  const lastInbound = [...messages].reverse().find((m) => !m.fromMe)?.createdTime ?? null;
  const hoursLeft = lastInbound ? (WINDOW_MS - (now - new Date(lastInbound).getTime())) / 3_600_000 : null;
  const activeState = active ? states[active.key] : undefined;
  const nameOf = (id: string | null | undefined) => team.find((m) => m.id === id)?.name ?? null;
  const err = errors[tab === "all" ? "ig" : tab];

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-border bg-surface">
        <div className="flex items-center gap-2 border-b border-border p-2">
          <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto [scrollbar-width:none]">
            {tabs.map(([id, label, n, icon]) => (
              <button
                key={id}
                type="button"
                title={id === "all" ? "Every DM" : `${icon === "instagram" ? "Instagram" : "Facebook"} ${label}`}
                onClick={() => { setTab(id); setActiveKey(null); if (id.endsWith("c") && filter === "open") setFilter("all"); }}
                className="flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-[13px] font-semibold"
                style={tab === id ? { background: "#0E0E0E", color: "#fff" } : { color: "#5A5A5A", background: "#F4F2EC" }}
              >
                {icon && <PlatformIcon id={icon as never} size={15} />}
                {label}
                {n > 0 && <span className="rounded-full px-1.5 text-[10.5px] font-bold" style={tab === id ? { background: "#FFD701", color: "#0E0E0E" } : { background: "#E5484D", color: "#fff" }}>{n}</span>}
              </button>
            ))}
          </div>
          {accounts.length > 1 && <div className="hidden shrink-0 sm:block"><AccountSelect accounts={accounts} value={accountId} onChange={setAccountId} includeAll={false} /></div>}
          <button type="button" title="Sync now" onClick={() => void load()} disabled={loading} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-white"><span className={loading ? "animate-spin" : ""}>⟳</span></button>
          <button type="button" title="Contact details" onClick={() => setShowInfo((v) => !v)} className="hidden h-9 shrink-0 items-center rounded-lg border border-border px-3 text-[13px] font-semibold lg:flex" style={showInfo ? { background: BLACK, color: "#fff", borderColor: BLACK } : undefined}>Details</button>
        </div>
        {accounts.length > 1 && <div className="border-b border-border p-2 sm:hidden"><AccountSelect accounts={accounts} value={accountId} onChange={setAccountId} includeAll={false} /></div>}

        <div className={`grid h-[calc(100dvh-12rem)] min-h-[440px] grid-cols-1 ${showInfo && active ? "lg:grid-cols-[340px_1fr_300px]" : "md:grid-cols-[340px_1fr]"}`}>
          {/* List */}
          <div className={`min-h-0 flex-col border-r border-border ${active ? "hidden md:flex" : "flex"}`}>
            <div className="space-y-2 border-b border-border p-3">
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search people or messages" className="h-9 w-full rounded-lg border border-border bg-white px-3 text-sm focus:outline-none" />
              <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none]">
                {([["all", "All"], ["unread", tab.endsWith("c") ? "Not replied" : "Unread"], ["priority", "Priority"], ["follow", "Follow up"], ["mine", "Assigned to me"], ...(tab.endsWith("c") ? [] : [["open", "Window open"]])] as Array<[typeof filter, string]>).map(([id, label]) => (
                  <button key={id} type="button" onClick={() => setFilter(id)} className="shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold" style={filter === id ? { background: BLACK, color: "#fff" } : { background: "#F0EEE6" }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {tab === "all" && shown.length > 0 && Object.keys(errors).length > 0 && (
                <p className="border-b border-border bg-[#FFF1E0] px-4 py-2 text-sm text-[#7A3E00]" role="status">
                  Could not load {(Object.keys(errors) as Tab[]).map((k) => ({ ig: "Instagram messages", igc: "Instagram comments", fb: "Messenger", fbc: "Facebook comments", all: "" })[k]).filter(Boolean).join(", ")}. The rest is shown. It will try again on its own.
                </p>
              )}
              {err && shown.length === 0 ? (
                <p className="p-5 text-sm leading-relaxed" style={{ color: "#B42318" }}>{friendlyError(err)}</p>
              ) : loading && shown.length === 0 ? (
                <p className="p-5 text-sm text-muted" role="status">Loading your messages. Instagram can take up to half a minute.</p>
              ) : shown.length === 0 ? (
                <p className="p-5 text-center text-sm text-muted">Nothing here right now.</p>
              ) : (
                shown.map((t) => {
                  const unread = isUnread(t);
                  const st = states[t.key];
                  return (
                    <button key={t.key} type="button" onClick={() => open(t)} className="flex w-full gap-3 border-b border-border px-4 py-3 text-left" style={t.key === activeKey ? { background: "#FFFBE0", boxShadow: `inset 3px 0 0 ${BLACK}` } : undefined}>
                      <Avatar name={t.name} platform={t.platform} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className={`truncate text-[15px] ${unread ? "font-bold" : "font-semibold"}`}>{t.name}</span>
                          <span className="shrink-0 text-[11px] text-muted">{ago(t.time, now)}</span>
                        </span>
                        <span className={`mt-0.5 block truncate text-sm ${unread ? "text-foreground" : "text-muted"}`}>{t.fromMe ? "You: " : ""}{t.preview}</span>
                        <span className="mt-1 flex flex-wrap gap-1">
                          {st?.priority && <span className="rounded-md bg-[#FDE2E1] px-1.5 py-0.5 text-[10px] font-bold text-[#B42318]">Priority</span>}
                          {st?.followUp && <span className="rounded-md bg-[#E1ECFD] px-1.5 py-0.5 text-[10px] font-bold text-[#1D4ED8]">Follow up</span>}
                          {st?.assigneeId && <span className="rounded-md bg-[#F0EEE6] px-1.5 py-0.5 text-[10px] font-semibold">👤 {nameOf(st.assigneeId) ?? "Assigned"}</span>}
                          {t.kind === "comment" && <span className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: t.replied ? "#DFF3DF" : "#FFF1E0", color: t.replied ? "#1E6B1E" : "#C2620A" }}>{t.replied ? "Replied" : "Needs a reply"}</span>}
                          {windowClosed(t) && <span className="rounded-md bg-[#FFF1E0] px-1.5 py-0.5 text-[10px] font-semibold text-[#C2620A]">Reply window closed</span>}
                        </span>
                      </span>
                      {unread && <span className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: "#E5484D" }} />}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Conversation */}
          <div className={`min-h-0 flex-col ${active ? "flex" : "hidden md:flex"}`}>
            {!active ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted">
                <span className="text-4xl">💬</span>
                <span className="text-sm">Select a conversation to view messages</span>
              </div>
            ) : (
              <>
                <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border px-4 py-3">
                  <button type="button" onClick={() => setActiveKey(null)} className="text-muted md:hidden" aria-label="Back">‹</button>
                  <Avatar name={active.name} size={40} platform={active.platform} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{active.name}</div>
                    <select
                      value={activeState?.assigneeId ?? ""}
                      onChange={(e) => void saveState(active.key, { assigneeId: e.target.value || null })}
                      className="mt-0.5 rounded-md bg-transparent text-xs font-semibold text-muted focus:outline-none"
                    >
                      <option value="">Assign this conversation ▾</option>
                      {team.map((m) => <option key={m.id} value={m.id}>Assigned to {m.id === me ? `${m.name} (me)` : m.name}</option>)}
                    </select>
                  </div>
                  <button type="button" onClick={() => void saveState(active.key, { priority: !activeState?.priority })} className="rounded-lg px-2.5 py-1 text-xs font-bold" style={activeState?.priority ? { background: "#FDE2E1", color: "#B42318" } : { background: "#F0EEE6" }}>Priority</button>
                  <button type="button" onClick={() => void saveState(active.key, { followUp: !activeState?.followUp })} className="rounded-lg px-2.5 py-1 text-xs font-bold" style={activeState?.followUp ? { background: "#E1ECFD", color: "#1D4ED8" } : { background: "#F0EEE6" }}>Follow up</button>
                </div>

                <div ref={scrollRef} className="min-h-0 flex-1 space-y-2.5 overflow-y-auto bg-[#FAF9F5] p-4">
                  {active.kind === "comment" ? (
                    <>
                      <a href={active.media?.permalink ?? undefined} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-xl border border-border bg-white p-2.5">
                        {active.media?.thumb && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={active.media.thumb} alt="" className="h-14 w-14 rounded-lg object-cover" />
                        )}
                        <span className="line-clamp-2 text-xs text-muted">{active.media?.caption || "View post"}</span>
                      </a>
                      <div className="flex justify-start">
                        <div className="max-w-[80%] rounded-2xl rounded-bl-md border border-border bg-white px-3.5 py-2.5 text-sm">
                          <p className="whitespace-pre-wrap break-words">{active.fullText}</p>
                          <p className="mt-1 text-[10px] text-muted">{ago(active.time, now)}</p>
                        </div>
                      </div>
                    </>
                  ) : threadLoading && messages.length === 0 ? (
                    <p className="text-sm text-muted">Loading…</p>
                  ) : messages.length === 0 ? (
                    <p className="text-sm text-muted">No messages.</p>
                  ) : (
                    messages.map((m) => (
                      <div key={m.id} className={`flex ${m.fromMe ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[75%] px-3.5 py-2.5 text-sm ${m.fromMe ? "rounded-2xl rounded-br-md" : "rounded-2xl rounded-bl-md border border-border bg-white"}`} style={m.fromMe ? { background: BLACK, color: "#fff" } : undefined}>
                          <p className="whitespace-pre-wrap break-words">{m.text || "📎 Attachment (open in the app to view)"}</p>
                          <p className="mt-1 text-[10px]" style={{ color: m.fromMe ? YELLOW : "#8A8A8A" }}>{ago(m.createdTime, now)}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {active.kind === "dm" && hoursLeft !== null && (
                  <div className="shrink-0 border-t border-border px-4 py-2 text-xs" style={{ color: hoursLeft > 0 ? "#5A5A5A" : "#C2620A" }}>
                    {hoursLeft > 0
                      ? `Reply window open for about ${Math.max(1, Math.round(hoursLeft))} hour${Math.round(hoursLeft) === 1 ? "" : "s"}. Your reply does not extend it.`
                      : "Reply window closed. Replies are only allowed within 24 hours of their last message."}
                  </div>
                )}

                <div className="relative shrink-0 border-t border-border p-3">
                  <div className="mb-2 flex gap-4 text-xs font-semibold text-muted">
                    <button type="button" onClick={() => { setShowEmoji((v) => !v); setShowSaved(false); }}>😊 Emoji</button>
                    <button type="button" onClick={() => { setShowSaved((v) => !v); setShowEmoji(false); }}>🔖 Saved replies</button>
                    <span className="ml-auto font-normal">
                      {active.kind === "comment" ? "Replies post publicly under the comment" : `Replying on ${active.platform === "ig" ? "Instagram" : "Messenger"}`}
                    </span>
                  </div>
                  {showEmoji && (
                    <div className="absolute bottom-full left-3 z-20 mb-2 grid grid-cols-6 gap-1 rounded-xl border border-border bg-white p-2 shadow-lg">
                      {EMOJIS.map((e) => <button key={e} type="button" className="rounded p-1 text-xl hover:bg-zinc-100" onClick={() => { setDraft((d) => d + e); setShowEmoji(false); }}>{e}</button>)}
                    </div>
                  )}
                  {showSaved && (
                    <div className="absolute bottom-full left-3 z-20 mb-2 w-80 rounded-xl border border-border bg-white p-2 shadow-lg">
                      {savedReplies.map((r, i) => (
                        <div key={i} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-zinc-50">
                          <button type="button" className="min-w-0 flex-1 truncate text-left text-sm" onClick={() => { setDraft(r); setShowSaved(false); }}>{r}</button>
                          <button type="button" aria-label="Remove" className="text-xs text-muted" onClick={() => { const n = savedReplies.filter((_, j) => j !== i); setSavedReplies(n); writeLocal("inbox:savedReplies", n); }}>✕</button>
                        </div>
                      ))}
                      <button type="button" disabled={!draft.trim()} onClick={() => { const n = [...savedReplies, draft.trim()]; setSavedReplies(n); writeLocal("inbox:savedReplies", n); }} className="mt-1 w-full rounded-lg px-2 py-1.5 text-left text-xs font-semibold disabled:opacity-40">
                        + Save what I&rsquo;ve typed as a reply
                      </button>
                    </div>
                  )}
                  {sendError && <p className="mb-2 text-xs" style={{ color: "#B42318" }}>{sendError}</p>}
                  <div className="flex items-end gap-2">
                    <textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
                      rows={1}
                      placeholder={`Reply on ${active.platform === "ig" ? "Instagram" : "Facebook"}…`}
                      className="max-h-32 min-h-[46px] flex-1 resize-none rounded-xl border border-border bg-white px-4 py-3 text-sm focus:outline-none"
                    />
                    <button type="button" aria-label="Send" onClick={() => void send()} disabled={sending || !draft.trim()} className="flex h-[46px] w-[46px] items-center justify-center rounded-xl text-lg font-bold disabled:opacity-40" style={{ background: YELLOW, color: BLACK }}>➤</button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Contact + team panel */}
          {showInfo && active && (
            <div className="hidden min-h-0 flex-col overflow-y-auto border-l border-border lg:flex">
              <div className="flex flex-col items-center gap-2 border-b border-border px-4 py-6">
                <span className="rounded-full p-1" style={{ background: `linear-gradient(135deg, ${YELLOW}, #E5484D)` }}>
                  <Avatar name={active.name} size={80} />
                </span>
                <span className="text-lg font-bold">{active.name}</span>
                <span className="flex items-center gap-1.5 text-xs text-muted">
                  <PlatformIcon id={active.platform === "ig" ? "instagram" : "facebook"} size={14} />
                  {active.kind === "comment" ? "Comment" : active.platform === "ig" ? "Instagram DM" : "Messenger"}
                </span>
                {active.platform === "ig" && (
                  <a href={`https://instagram.com/${active.name.replace(/^@/, "")}`} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold underline">View profile ↗</a>
                )}
              </div>
              <div className="grid grid-cols-2 border-b border-border text-center">
                <div className="border-r border-border py-4">
                  <div className="text-2xl font-bold">{active.kind === "dm" ? messages.length : all.filter((t) => t.name === active.name && t.kind === "comment").length}</div>
                  <div className="text-xs text-muted">{active.kind === "dm" ? "Messages" : "Comments"}</div>
                </div>
                <div className="py-4">
                  <div className="truncate px-2 text-sm font-bold">{nameOf(activeState?.assigneeId) ?? "Nobody"}</div>
                  <div className="text-xs text-muted">Assigned to</div>
                </div>
              </div>
              <div className="flex flex-col gap-2 p-4">
                <span className="text-sm font-semibold">Team note</span>
                <span className="text-xs text-muted">Only your team sees this. Useful for handovers.</span>
                <textarea
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  rows={5}
                  placeholder="e.g. Asked for price list, sent on 27 Nov. Follow up Monday."
                  className="rounded-xl border border-border bg-white px-3 py-2 text-sm focus:outline-none"
                />
                <button type="button" onClick={() => void saveState(active.key, { note: noteDraft.trim() || null })} disabled={(activeState?.note ?? "") === noteDraft.trim()} className="self-start rounded-lg px-3 py-1.5 text-xs font-bold disabled:opacity-40" style={{ background: YELLOW, color: BLACK }}>
                  Save note
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
