"use client";

/**
 * Inbox
 *
 * Instagram DM conversations for the selected account, with live message
 * history and a reply composer. Messages are read from the Conversations API
 * (Meta only exposes the 20 most recent per thread) and refreshed by polling.
 * Sending is subject to Instagram's 24-hour messaging window — Meta's error is
 * surfaced verbatim when it applies.
 */

import type { Locale } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/provider";
import { useCallback, useEffect, useRef, useState } from "react";
import AccountSelect, { type AccountOption } from "@/components/account-select";
import { readCache, writeCache } from "@/lib/client-cache";
import type { ConversationListItem } from "@/app/api/instagram/conversations/route";
import type { ThreadMessage } from "@/app/api/instagram/conversations/[id]/route";
import type { InboxComment } from "@/app/api/instagram/comments/route";
import { onClientChange, readClient } from "@/lib/client-selection";

const YELLOW = "#FFD701";
const BLACK = "#0E0E0E";
const WINDOW_MS = 24 * 3_600_000;
const EMOJIS = ["🙏", "❤️", "😊", "😂", "🔥", "👏", "🎉", "✨", "👍", "🤗", "💛", "📩"];
const AVATAR_COLORS = ["#F4D35E", "#EE964B", "#9BC1BC", "#C3B1E1", "#F7A9A8", "#A8D5BA", "#FFD6A5", "#BDE0FE"];

function ago(iso: string | null): string {
  if (!iso) return "";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = s / 60, h = m / 60, d = h / 24;
  if (m < 60) return `${Math.round(m)} min ago`;
  if (h < 24) return `about ${Math.round(h)} hour${Math.round(h) === 1 ? "" : "s"} ago`;
  if (d < 30) return `${Math.round(d)} day${Math.round(d) === 1 ? "" : "s"} ago`;
  return `about ${Math.round(d / 30)} month${Math.round(d / 30) === 1 ? "" : "s"} ago`;
}

function Avatar({ name, size = 44 }: { name: string; size?: number }) {
  const n = name.replace(/^@/, "") || "?";
  const color = AVATAR_COLORS[n.charCodeAt(0) % AVATAR_COLORS.length];
  return (
    <span className="flex shrink-0 items-center justify-center rounded-full font-bold" style={{ width: size, height: size, background: color, color: BLACK, fontSize: size * 0.38 }}>
      {n[0].toUpperCase()}
    </span>
  );
}

function useLocalSet(key: string) {
  const [set, setSet] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try { return new Set(JSON.parse(window.localStorage.getItem(key) ?? "[]")); } catch { return new Set(); }
  });
  const toggle = (id: string) => setSet((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    try { window.localStorage.setItem(key, JSON.stringify([...next])); } catch {}
    return next;
  });
  return [set, toggle] as const;
}

const POLL_MS = 12_000;
// Cached list/threads are shown instantly on revisit, then revalidated in the
// background. The Instagram Conversations API is slow (often several seconds),
// so this is what makes the inbox feel fast after the first load.
const CACHE_MAX_AGE_MS = 60_000;
const convCacheKey = (accountId: string) => `inbox:convs:${accountId}`;
const msgCacheKey = (conversationId: string) => `inbox:msgs:${conversationId}`;

function formatTime(iso: string | null, locale: Locale): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString(locale, { month: "short", day: "numeric" });
}

export default function InboxPage() {
  const { t, locale } = useI18n();
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  // Seed from the last-used account so a revisit can paint the cached
  // conversation list immediately, before the account list even loads.
  const [selectedAccountId, setSelectedAccountId] = useState(() => {
    if (typeof window === "undefined") return "";
    return window.sessionStorage.getItem("inbox:selectedAccount") ?? "";
  });

  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [convLoading, setConvLoading] = useState(true);
  const [convError, setConvError] = useState<string | null>(null);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const conversationRequests = useRef(new Set<string>());

  const active = conversations.find((c) => c.id === activeId) ?? null;

  // Accounts for the selector; default to the first connected account. Uses the
  // lightweight accounts endpoint (one query) rather than the heavy dashboard
  // stats aggregation, so the inbox isn't gated on analytics before it can load.
  useEffect(() => {
    fetch("/api/instagram/accounts")
      .then((r) => r.json())
      .then((payload) => {
        if (!payload.success) return;
        const next: AccountOption[] = payload.data.instagramAccounts ?? [];
        setAccounts(next);
        setSelectedAccountId((prev) => {
          // Keep the seeded account only if it's still connected; otherwise
          // fall back to the default so a removed account can't wedge the inbox.
          const stillValid = prev && next.some((a) => a.id === prev);
          return stillValid
            ? prev
            : payload.data.selectedInstagramAccountId || next[0]?.id || "";
        });
      })
      .catch(() => setAccounts([]));
  }, []);

  // Remember the chosen account for the next visit.
  useEffect(() => {
    if (typeof window === "undefined" || !selectedAccountId) return;
    window.sessionStorage.setItem("inbox:selectedAccount", selectedAccountId);
  }, [selectedAccountId]);

  const loadConversations = useCallback(
    async (silent: boolean) => {
      if (!selectedAccountId || conversationRequests.current.has(selectedAccountId)) return;
      conversationRequests.current.add(selectedAccountId);
      if (!silent) setConvLoading(true);
      try {
        const res = await fetch(
          `/api/instagram/conversations?instagramAccountId=${selectedAccountId}`,
          { cache: "no-store" }
        );
        const data = await res.json();
        if (data.success) {
          setConversations(data.data.conversations);
          writeCache(convCacheKey(selectedAccountId), data.data.conversations);
          setConvError(null);
        } else if (!silent) {
          setConvError(data.error ?? "Failed to load conversations");
        }
      } catch {
        if (!silent) setConvError("Failed to load conversations");
      } finally {
        conversationRequests.current.delete(selectedAccountId);
        if (!silent) setConvLoading(false);
      }
    },
    [selectedAccountId]
  );

  // Load + poll conversations for the selected account. A cached list is shown
  // immediately (so revisits are instant) while a fresh copy loads silently.
  useEffect(() => {
    if (!selectedAccountId) return;
    // Reset the open thread when switching accounts. This is an intentional
    // synchronous reset on a dependency change, not derived render state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActiveId(null);
    setMessages([]);
    const cached = readCache<ConversationListItem[]>(
      convCacheKey(selectedAccountId),
      CACHE_MAX_AGE_MS
    );
    if (cached.data) {
      setConversations(cached.data);
      setConvLoading(false);
    } else {
      setConversations([]);
      setConvLoading(true);
    }
    void loadConversations(Boolean(cached.data));
    const timer = window.setInterval(() => void loadConversations(true), POLL_MS);
    return () => window.clearInterval(timer);
  }, [selectedAccountId, loadConversations]);

  const loadMessages = useCallback(
    async (conversationId: string, silent: boolean) => {
      if (!selectedAccountId) return;
      if (!silent) setThreadLoading(true);
      try {
        const res = await fetch(
          `/api/instagram/conversations/${conversationId}?instagramAccountId=${selectedAccountId}`,
          { cache: "no-store" }
        );
        const data = await res.json();
        if (data.success) {
          setMessages(data.data.messages);
          writeCache(msgCacheKey(conversationId), data.data.messages);
        }
      } catch {
        // keep whatever is shown
      } finally {
        if (!silent) setThreadLoading(false);
      }
    },
    [selectedAccountId]
  );

  // Load + poll the open thread. Cached messages render instantly while a fresh
  // copy loads silently; opening a thread never shows a blank pane on revisit.
  useEffect(() => {
    if (!activeId || active?.detailsUnavailable) return;
    const cached = readCache<ThreadMessage[]>(
      msgCacheKey(activeId),
      CACHE_MAX_AGE_MS
    );
    if (cached.data) {
      // Paint cached messages instantly on thread change; intentional reset.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMessages(cached.data);
      setThreadLoading(false);
    } else {
      setMessages([]);
      setThreadLoading(true);
    }
    void loadMessages(activeId, Boolean(cached.data));
    const timer = window.setInterval(
      () => void loadMessages(activeId, true),
      POLL_MS
    );
    return () => window.clearInterval(timer);
  }, [activeId, active?.detailsUnavailable, loadMessages]);

  // Keep the thread pinned to the latest message.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  function openConversation(id: string) {
    setActiveId(id);
    markSeen(id);
    setSendError(null);
    // Paint any cached thread synchronously so the pane never flashes empty
    // or shows the previously open conversation while the fetch runs.
    const cached = readCache<ThreadMessage[]>(msgCacheKey(id), CACHE_MAX_AGE_MS);
    setMessages(cached.data ?? []);
    setThreadLoading(!cached.data);
  }

  async function handleSend() {
    const text = draft.trim();
    if (!text || !active?.contact.id || sending) return;
    setSending(true);
    setSendError(null);

    // Optimistically show the reply immediately, then confirm with the server.
    const optimistic: ThreadMessage = {
      id: `optimistic-${Date.now()}`,
      text,
      fromMe: true,
      fromUsername: null,
      createdTime: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    setDraft("");

    try {
      const res = await fetch("/api/instagram/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instagramAccountId: selectedAccountId,
          recipientId: active.contact.id,
          text,
        }),
      });
      const data = await res.json();
      if (data.success) {
        await loadMessages(active.id, true);
        void loadConversations(true);
      } else {
        // Roll the optimistic message back and restore the draft so it's not lost.
        setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
        setDraft(text);
        setSendError(data.error ?? t("Failed to send message"));
      }
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setDraft(text);
      setSendError(t("Failed to send message"));
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  const [tab, setTab] = useState<"dms" | "comments">("dms");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "unread" | "open" | "saved">("all");
  const [showInfo, setShowInfo] = useState(true);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [starred, toggleStar] = useLocalSet("inbox:starred");
  const [seen, setSeen] = useState<Record<string, string>>(() => {
    if (typeof window === "undefined") return {};
    try { return JSON.parse(window.localStorage.getItem("inbox:seen") ?? "{}"); } catch { return {}; }
  });
  const [savedReplies, setSavedReplies] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(window.localStorage.getItem("inbox:savedReplies") ?? "null") ?? ["Thank you so much! 🙏", "Please check your DM, we just sent you the details.", "We'll get back to you shortly."]; } catch { return []; }
  });
  const [comments, setComments] = useState<InboxComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [activeComment, setActiveComment] = useState<string | null>(null);

  function markSeen(id: string) {
    setSeen((prev) => {
      const next = { ...prev, [id]: new Date().toISOString() };
      try { window.localStorage.setItem("inbox:seen", JSON.stringify(next)); } catch {}
      return next;
    });
  }
  function persistSaved(list: string[]) {
    setSavedReplies(list);
    try { window.localStorage.setItem("inbox:savedReplies", JSON.stringify(list)); } catch {}
  }

  // Follow the sidebar client switcher.
  useEffect(() => {
    const apply = (id: string) => { if (id && id !== "all") setSelectedAccountId(id); };
    const saved = readClient();
    if (saved) void Promise.resolve().then(() => apply(saved));
    return onClientChange(apply);
  }, []);

  const loadComments = useCallback(async () => {
    if (!selectedAccountId) return;
    setCommentsLoading(true);
    try {
      const res = await fetch(`/api/instagram/comments?instagramAccountId=${selectedAccountId}`, { cache: "no-store" });
      const data = await res.json();
      if (data.success) setComments(data.data.comments);
    } finally {
      setCommentsLoading(false);
    }
  }, [selectedAccountId]);

  useEffect(() => {
    void Promise.resolve().then(() => {
      setComments([]);
      setActiveComment(null);
      void loadComments();
    });
  }, [loadComments]);

  async function sync() {
    setSyncing(true);
    await Promise.all([loadConversations(false), loadComments(), activeId ? loadMessages(activeId, true) : Promise.resolve()]);
    setSyncing(false);
  }

  const isUnread = (c: ConversationListItem) =>
    !!c.lastMessage && !c.lastMessage.fromMe && (!seen[c.id] || (c.updatedTime ?? "") > seen[c.id]);
  const windowClosed = (c: ConversationListItem) =>
    !!c.lastMessage && !c.lastMessage.fromMe && !!c.lastMessage.createdTime && now - new Date(c.lastMessage.createdTime).getTime() > WINDOW_MS;

  const q = query.trim().toLowerCase().replace(/^@/, "");
  const shownConvs = conversations.filter((c) => {
    if (q && !(c.contact.username ?? "").toLowerCase().includes(q) && !(c.lastMessage?.text ?? "").toLowerCase().includes(q)) return false;
    if (filter === "unread") return isUnread(c);
    if (filter === "open") return !!c.lastMessage && !windowClosed(c);
    if (filter === "saved") return starred.has(c.id);
    return true;
  });
  const shownComments = comments.filter((c) => {
    if (q && !(c.username ?? "").toLowerCase().includes(q) && !c.text.toLowerCase().includes(q)) return false;
    if (filter === "unread") return !c.replied;
    if (filter === "saved") return starred.has(c.id);
    return true;
  });
  const unreadCount = conversations.filter(isUnread).length;
  const unrepliedComments = comments.filter((c) => !c.replied).length;
  const comment = comments.find((c) => c.id === activeComment) ?? null;
  const lastInbound = [...messages].reverse().find((m) => !m.fromMe)?.createdTime ?? null;
  const hoursLeft = lastInbound ? (WINDOW_MS - (now - new Date(lastInbound).getTime())) / 3_600_000 : null;

  async function replyToComment() {
    const text = draft.trim();
    if (!comment || !text || sending) return;
    setSending(true);
    setSendError(null);
    const res = await fetch("/api/instagram/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instagramAccountId: selectedAccountId, commentId: comment.id, mediaId: comment.media.id, text }),
    }).then((r) => r.json()).catch(() => ({ success: false, error: "Reply failed" }));
    setSending(false);
    if (res.success) {
      setDraft("");
      setComments((list) => list.map((c) => (c.id === comment.id ? { ...c, replied: true } : c)));
    } else setSendError(res.error ?? "Reply failed");
  }

  const chipBtn = "flex items-center gap-2 rounded-xl border border-border bg-surface px-3.5 py-2 text-sm font-semibold hover:bg-surface-hover";
  const contactName = tab === "dms" ? (active ? `@${active.contact.username ?? "unknown"}` : "") : comment ? `@${comment.username ?? "unknown"}` : "";
  const hasSelection = tab === "dms" ? !!active : !!comment;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--font-display)" }}>Inbox</h1>
        <p className="text-sm text-muted">Instagram DMs and comments for each client, in one place.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {accounts.length > 1 && (
          <AccountSelect accounts={accounts} value={selectedAccountId} onChange={setSelectedAccountId} includeAll={false} />
        )}
        <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} className={chipBtn} aria-label="Filter">
          <option value="all">All</option>
          <option value="unread">{tab === "dms" ? "Unread" : "Not replied"}</option>
          {tab === "dms" && <option value="open">Reply window open</option>}
          <option value="saved">Saved ⭐</option>
        </select>
        <button type="button" onClick={() => void sync()} className={chipBtn} disabled={syncing}>
          <span className={syncing ? "animate-spin" : ""}>⟳</span> {syncing ? "Syncing…" : "Sync"}
        </button>
        <button type="button" onClick={() => setShowInfo((v) => !v)} className={chipBtn} style={showInfo ? { background: BLACK, color: "#fff", borderColor: BLACK } : undefined}>
          👤 Info
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-xl bg-[#F0EEE6] p-1">
          {([["dms", "DMs", unreadCount], ["comments", "Comments", unrepliedComments]] as const).map(([id, label, n]) => (
            <button
              key={id}
              type="button"
              onClick={() => { setTab(id); setSendError(null); setDraft(""); if (filter === "open" && id === "comments") setFilter("all"); }}
              className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold"
              style={tab === id ? { background: "#fff", boxShadow: "0 1px 2px rgba(0,0,0,.08)" } : { color: "#6B6B6B" }}
            >
              {label}
              {n > 0 && <span className="rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: YELLOW, color: BLACK }}>{n}</span>}
            </button>
          ))}
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="🔍  Search conversations…"
          className="w-full max-w-sm rounded-xl border border-border bg-surface px-4 py-2.5 text-sm focus:outline-none"
        />
      </div>

      <div className={`grid h-[calc(100dvh-17rem)] min-h-[480px] grid-cols-1 gap-3 ${showInfo && hasSelection ? "lg:grid-cols-[320px_1fr_280px]" : "md:grid-cols-[320px_1fr]"}`}>
        {/* List */}
        <div className={`min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-surface ${hasSelection ? "hidden md:flex" : "flex"}`}>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {tab === "dms" ? (
              convLoading ? <p className="p-6 text-sm text-muted">Loading conversations…</p>
              : convError ? <p className="p-6 text-sm text-error">{convError}</p>
              : shownConvs.length === 0 ? <p className="p-6 text-center text-sm text-muted">No conversations here. Tap Sync to check again.</p>
              : shownConvs.map((c) => {
                  const name = c.detailsUnavailable ? "Details unavailable" : `@${c.contact.username ?? "unknown"}`;
                  const unread = isUnread(c);
                  return (
                    <button key={c.id} type="button" onClick={() => openConversation(c.id)} className="flex w-full gap-3 border-b border-border px-4 py-3.5 text-left" style={c.id === activeId ? { background: "#FFFBE0" } : undefined}>
                      <span className="relative">
                        <Avatar name={name} />
                        {unread && <span className="absolute right-0 top-0 h-3 w-3 rounded-full border-2 border-white" style={{ background: "#E5484D" }} />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className={`truncate text-[15px] ${unread ? "font-bold" : "font-semibold"}`}>{name}</span>
                          <span className="shrink-0 text-[11px] text-muted">{ago(c.updatedTime)}</span>
                        </span>
                        <span className={`mt-0.5 block truncate text-sm ${unread ? "text-foreground" : "text-muted"}`}>
                          {c.lastMessage ? `${c.lastMessage.fromMe ? "You: " : ""}${c.lastMessage.text || "📎 Attachment"}` : "No messages"}
                        </span>
                        {windowClosed(c) && <span className="mt-0.5 block text-[11px] font-semibold" style={{ color: "#C2620A" }}>Reply window closed</span>}
                      </span>
                      <span role="button" tabIndex={0} aria-label="Save" onClick={(e) => { e.stopPropagation(); toggleStar(c.id); }} className="self-start text-base" style={{ color: starred.has(c.id) ? "#E0B800" : "#C9C9C9" }}>★</span>
                    </button>
                  );
                })
            ) : commentsLoading && comments.length === 0 ? <p className="p-6 text-sm text-muted">Loading comments from recent posts…</p>
            : shownComments.length === 0 ? <p className="p-6 text-center text-sm text-muted">No comments in the last 30 days.</p>
            : shownComments.map((c) => (
                <button key={c.id} type="button" onClick={() => { setActiveComment(c.id); setSendError(null); }} className="flex w-full gap-3 border-b border-border px-4 py-3.5 text-left" style={c.id === activeComment ? { background: "#FFFBE0" } : undefined}>
                  <span className="relative">
                    <Avatar name={c.username ?? "?"} />
                    {!c.replied && <span className="absolute right-0 top-0 h-3 w-3 rounded-full border-2 border-white" style={{ background: "#E5484D" }} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[15px] font-semibold">@{c.username ?? "unknown"}</span>
                      <span className="shrink-0 text-[11px] text-muted">{ago(c.timestamp)}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-sm text-muted">{c.text}</span>
                    <span className="mt-0.5 block text-[11px] font-semibold" style={{ color: c.replied ? "#2E8B2E" : "#C2620A" }}>{c.replied ? "Replied" : "Needs a reply"}</span>
                  </span>
                  {c.media.thumb && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.media.thumb} alt="" className="h-11 w-11 shrink-0 rounded-lg object-cover" />
                  )}
                </button>
              ))}
          </div>
        </div>

        {/* Conversation */}
        <div className={`min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-surface ${hasSelection ? "flex" : "hidden md:flex"}`}>
          {!hasSelection ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted">
              <span className="text-4xl">💬</span>
              <span className="text-sm">Select a conversation to view messages</span>
            </div>
          ) : (
            <>
              <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3">
                <button type="button" onClick={() => (tab === "dms" ? setActiveId(null) : setActiveComment(null))} className="text-muted md:hidden" aria-label="Back">‹</button>
                <Avatar name={contactName} size={40} />
                <div className="min-w-0">
                  <div className="truncate font-semibold">{contactName}</div>
                  <div className="text-xs text-muted">{tab === "dms" ? "Instagram DM" : "Instagram comment"}</div>
                </div>
              </div>

              <div ref={scrollRef} className="min-h-0 flex-1 space-y-2.5 overflow-y-auto bg-[#FAF9F5] p-4">
                {tab === "comments" && comment ? (
                  <>
                    <a href={comment.media.permalink ?? undefined} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-xl border border-border bg-white p-2.5">
                      {comment.media.thumb && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={comment.media.thumb} alt="" className="h-14 w-14 rounded-lg object-cover" />
                      )}
                      <span className="line-clamp-2 text-xs text-muted">{comment.media.caption || "View post"}</span>
                    </a>
                    <div className="flex justify-start">
                      <div className="max-w-[80%] rounded-2xl rounded-bl-md border border-border bg-white px-3.5 py-2.5 text-sm">
                        <p className="whitespace-pre-wrap break-words">{comment.text}</p>
                        <p className="mt-1 text-[10px] text-muted">{ago(comment.timestamp)}</p>
                      </div>
                    </div>
                  </>
                ) : active?.detailsUnavailable ? (
                  <p className="text-sm text-muted">Instagram could not load this conversation. You can still open it in the Instagram app.</p>
                ) : threadLoading && messages.length === 0 ? (
                  <p className="text-sm text-muted">Loading…</p>
                ) : messages.length === 0 ? (
                  <p className="text-sm text-muted">No messages.</p>
                ) : (
                  messages.map((m) => (
                    <div key={m.id} className={`flex ${m.fromMe ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[75%] px-3.5 py-2.5 text-sm ${m.fromMe ? "rounded-2xl rounded-br-md" : "rounded-2xl rounded-bl-md border border-border bg-white"}`}
                        style={m.fromMe ? { background: BLACK, color: "#fff" } : undefined}
                      >
                        <p className="whitespace-pre-wrap break-words">{m.text || "📎 Attachment"}</p>
                        <p className="mt-1 text-[10px]" style={{ color: m.fromMe ? YELLOW : "#8A8A8A" }}>{ago(m.createdTime)}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {tab === "dms" && hoursLeft !== null && (
                <div className="shrink-0 border-t border-border px-4 py-2 text-xs" style={{ color: hoursLeft > 0 ? "#5A5A5A" : "#C2620A" }}>
                  {hoursLeft > 0
                    ? `Reply window open for about ${Math.max(1, Math.round(hoursLeft))} hour${Math.round(hoursLeft) === 1 ? "" : "s"}. Your reply does not extend it.`
                    : "Reply window closed. Instagram only allows replies within 24 hours of their last message."}
                </div>
              )}

              <div className="relative shrink-0 border-t border-border p-3">
                <div className="mb-2 flex gap-4 text-xs font-semibold text-muted">
                  <button type="button" onClick={() => { setShowEmoji((v) => !v); setShowSaved(false); }}>😊 Emoji</button>
                  <button type="button" onClick={() => { setShowSaved((v) => !v); setShowEmoji(false); }}>🔖 Saved replies</button>
                  {tab === "comments" && <span className="ml-auto font-normal">Replies post publicly under the comment</span>}
                </div>
                {showEmoji && (
                  <div className="absolute bottom-full left-3 z-20 mb-2 grid grid-cols-6 gap-1 rounded-xl border border-border bg-white p-2 shadow-lg">
                    {EMOJIS.map((e) => (
                      <button key={e} type="button" className="rounded p-1 text-xl hover:bg-zinc-100" onClick={() => { setDraft((d) => d + e); setShowEmoji(false); }}>{e}</button>
                    ))}
                  </div>
                )}
                {showSaved && (
                  <div className="absolute bottom-full left-3 z-20 mb-2 w-80 rounded-xl border border-border bg-white p-2 shadow-lg">
                    {savedReplies.map((r, i) => (
                      <div key={i} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-zinc-50">
                        <button type="button" className="min-w-0 flex-1 truncate text-left text-sm" onClick={() => { setDraft(r); setShowSaved(false); }}>{r}</button>
                        <button type="button" aria-label="Remove" className="text-xs text-muted" onClick={() => persistSaved(savedReplies.filter((_, j) => j !== i))}>✕</button>
                      </div>
                    ))}
                    <button type="button" disabled={!draft.trim()} onClick={() => persistSaved([...savedReplies, draft.trim()])} className="mt-1 w-full rounded-lg px-2 py-1.5 text-left text-xs font-semibold disabled:opacity-40">
                      + Save what I&rsquo;ve typed as a reply
                    </button>
                  </div>
                )}
                {sendError && <p className="mb-2 text-xs text-error">{sendError}</p>}
                <div className="flex items-end gap-2">
                  <textarea
                    disabled={tab === "dms" && (active?.detailsUnavailable || !active?.contact.id)}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void (tab === "dms" ? handleSend() : replyToComment()); }
                    }}
                    rows={1}
                    placeholder="Type a reply…"
                    className="max-h-32 min-h-[46px] flex-1 resize-none rounded-xl border border-border bg-white px-4 py-3 text-sm focus:outline-none"
                  />
                  <button
                    type="button"
                    aria-label="Send"
                    onClick={() => void (tab === "dms" ? handleSend() : replyToComment())}
                    disabled={sending || !draft.trim()}
                    className="flex h-[46px] w-[46px] items-center justify-center rounded-xl text-lg font-bold disabled:opacity-40"
                    style={{ background: YELLOW, color: BLACK }}
                  >
                    ➤
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Contact details */}
        {showInfo && hasSelection && (
          <div className="hidden min-h-0 flex-col overflow-y-auto rounded-2xl border border-border bg-surface lg:flex">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <span className="font-semibold">Contact details</span>
              <button type="button" onClick={() => setShowInfo(false)} aria-label="Close" className="text-muted">✕</button>
            </div>
            <div className="flex flex-col items-center gap-2 px-4 py-6">
              <span className="rounded-full p-1" style={{ background: `linear-gradient(135deg, ${YELLOW}, #E5484D)` }}>
                <Avatar name={contactName} size={84} />
              </span>
              <span className="text-lg font-bold">{contactName}</span>
              <span className="text-xs text-muted">Instagram</span>
              <a href={`https://instagram.com/${contactName.replace(/^@/, "")}`} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold underline">View on Instagram ↗</a>
            </div>
            <div className="grid grid-cols-2 border-t border-border text-center">
              <div className="border-r border-border py-4">
                <div className="text-2xl font-bold">{tab === "dms" ? messages.length : comments.filter((c) => c.username === comment?.username).length}</div>
                <div className="text-xs text-muted">{tab === "dms" ? "Messages" : "Comments"}</div>
              </div>
              <button type="button" onClick={() => toggleStar(tab === "dms" ? active!.id : comment!.id)} className="py-4">
                <div className="text-2xl" style={{ color: starred.has(tab === "dms" ? active?.id ?? "" : comment?.id ?? "") ? "#E0B800" : "#C9C9C9" }}>★</div>
                <div className="text-xs text-muted">{starred.has(tab === "dms" ? active?.id ?? "" : comment?.id ?? "") ? "Saved" : "Save"}</div>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
