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
    `${pageId}/published_posts`, token,
    { fields: "message,full_picture,permalink_url,comments.order(reverse_chronological).limit(25){message,created_time,from,comments.limit(10){from}}", limit: "8" }
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
