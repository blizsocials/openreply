/**
 * Blizsocials: Facebook Page Messenger conversations and Page post comments,
 * read and answered with the Page token inside the Facebook Login composite
 * token. Needs pages_messaging, pages_read_user_content, pages_manage_engagement.
 */
import { getMetaGraphApiVersion } from "@/lib/env";
import { decodeFacebookLoginToken } from "@/lib/meta/facebook-login";

const base = () => `https://graph.facebook.com/${getMetaGraphApiVersion()}`;

export function pageCredentials(compositeToken: string) {
  const d = decodeFacebookLoginToken(compositeToken);
  if (!d) throw new Error("This client was not connected through Facebook. Use Add or refresh clients.");
  return { pageId: d.page, token: d.t };
}

async function graph<T>(path: string, token: string, params: Record<string, string> = {}, method = "GET", body?: unknown): Promise<T> {
  const url = new URL(`${base()}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("access_token", token);
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(25_000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) throw new Error(json.error?.message ?? `Facebook error ${res.status}`);
  return json as T;
}

type Msg = { id: string; message?: string; created_time?: string; from?: { id: string; name?: string } };

export async function listMessengerConversations(composite: string) {
  const { pageId, token } = pageCredentials(composite);
  const r = await graph<{ data: Array<{ id: string; updated_time?: string; participants?: { data: { id: string; name?: string }[] }; messages?: { data: Msg[] } }> }>(
    `${pageId}/conversations`, token,
    { platform: "messenger", fields: "participants,updated_time,messages.limit(1){message,from,created_time}", limit: "40" }
  );
  return r.data.map((c) => {
    const contact = c.participants?.data.find((p) => p.id !== pageId) ?? null;
    const last = c.messages?.data?.[0];
    return {
      id: c.id,
      contact: { id: contact?.id ?? "", name: contact?.name ?? null },
      updatedTime: c.updated_time ?? null,
      lastMessage: last ? { text: last.message ?? "", fromMe: last.from?.id === pageId, createdTime: last.created_time ?? null } : null,
    };
  });
}

export async function getMessengerThread(composite: string, conversationId: string) {
  const { pageId, token } = pageCredentials(composite);
  const r = await graph<{ messages?: { data: Msg[] } }>(conversationId, token, { fields: "messages.limit(30){message,from,created_time}" });
  return (r.messages?.data ?? []).reverse().map((m) => ({
    id: m.id,
    text: m.message ?? "",
    fromMe: m.from?.id === pageId,
    fromUsername: m.from?.name ?? null,
    createdTime: m.created_time ?? null,
  }));
}

export async function sendMessengerReply(composite: string, recipientId: string, text: string) {
  const { pageId, token } = pageCredentials(composite);
  return graph(`${pageId}/messages`, token, {}, "POST", { recipient: { id: recipientId }, messaging_type: "RESPONSE", message: { text } });
}

export async function listPageComments(composite: string) {
  const { pageId, token } = pageCredentials(composite);
  const r = await graph<{ data: Array<{ id: string; message?: string; full_picture?: string; permalink_url?: string; comments?: { data: Array<{ id: string; message?: string; created_time: string; from?: { id: string; name?: string }; comments?: { data: { from?: { id: string } }[] } }> } }> }>(
    `${pageId}/feed`, token,
    { fields: "message,full_picture,permalink_url,comments.filter(stream).limit(25){message,created_time,from,comments.limit(10){from}}", limit: "8" }
  );
  const out = [];
  for (const post of r.data) {
    for (const c of post.comments?.data ?? []) {
      if (c.from?.id === pageId) continue;
      out.push({
        id: c.id,
        text: c.message ?? "",
        username: c.from?.name ?? null,
        timestamp: c.created_time,
        replied: (c.comments?.data ?? []).some((x) => x.from?.id === pageId),
        media: { id: post.id, thumb: post.full_picture ?? null, permalink: post.permalink_url ?? null, caption: post.message ?? null },
      });
    }
  }
  return out.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

export async function replyToPageComment(composite: string, commentId: string, text: string) {
  const { token } = pageCredentials(composite);
  return graph(`${commentId}/comments`, token, {}, "POST", { message: text });
}

/** Blizsocials: Page posts with public counts for the client report. */
export async function getPageReport(composite: string, since: string, until: string) {
  const { pageId, token } = pageCredentials(composite);
  const page = await graph<{ followers_count?: number; fan_count?: number; name?: string }>(pageId, token, { fields: "followers_count,fan_count,name" });
  type P = { id: string; message?: string; created_time: string; full_picture?: string; permalink_url?: string; status_type?: string; shares?: { count: number }; reactions?: { summary: { total_count: number } }; comments?: { summary: { total_count: number } } };
  const posts: P[] = [];
  let next: string | null = null;
  let r = await graph<{ data: P[]; paging?: { next?: string } }>(`${pageId}/posts`, token, {
    fields: "id,message,created_time,full_picture,permalink_url,status_type,shares,reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0)",
    since, until: `${until}T23:59:59`, limit: "100",
  });
  posts.push(...r.data);
  next = r.paging?.next ?? null;
  for (let i = 0; next && i < 4; i++) {
    const res = await fetch(next, { signal: AbortSignal.timeout(25_000) });
    r = (await res.json()) as { data: P[]; paging?: { next?: string } };
    posts.push(...(r.data ?? []));
    next = r.paging?.next ?? null;
  }
  // Reach and views per post need read_insights on the Page token. Try it; if
  // Meta refuses, the report shows n/a instead of failing.
  const reach: Record<string, { reach: number | null; views: number | null }> = {};
  let insightsOk = true;
  for (let i = 0; i < posts.length && insightsOk; i += 25) {
    const chunk = posts.slice(i, i + 25);
    try {
      const r = await graph<Record<string, { insights?: { data: Array<{ name: string; values: Array<{ value: number }> }> } }>>("", token, {
        ids: chunk.map((p) => p.id).join(","),
        fields: "insights.metric(post_impressions_unique,post_impressions)",
      });
      for (const [id, v] of Object.entries(r)) {
        const get = (n: string) => v.insights?.data.find((d) => d.name === n)?.values?.[0]?.value ?? null;
        reach[id] = { reach: get("post_impressions_unique"), views: get("post_impressions") };
      }
    } catch {
      insightsOk = false;
    }
  }
  return {
    name: page.name ?? null,
    followers: page.followers_count ?? page.fan_count ?? null,
    insightsAvailable: insightsOk,
    posts: posts.map((p) => ({
      id: p.id,
      caption: p.message?.trim().slice(0, 160) ?? null,
      permalink: p.permalink_url ?? null,
      thumbnailUrl: p.full_picture ?? null,
      mediaType: p.status_type === "added_video" ? "VIDEO" : p.full_picture ? "IMAGE" : "TEXT",
      timestamp: p.created_time,
      views: reach[p.id]?.views ?? null,
      reach: reach[p.id]?.reach ?? null,
      likes: p.reactions?.summary.total_count ?? 0,
      comments: p.comments?.summary.total_count ?? 0,
      saved: null,
      shares: p.shares?.count ?? 0,
    })),
  };
}
