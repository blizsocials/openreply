import { prisma } from "@/lib/db/client";
import { requireEnv } from "@/lib/env";
import { decryptToken, encryptToken } from "@/lib/meta/oauth";

/**
 * Blizsocials TikTok connection (Login Kit) and posting (Content Posting API,
 * Direct Post, FILE_UPLOAD). Until TikTok audits the app, posts must be
 * SELF_ONLY (private) and only a few accounts can connect per day.
 */

export const TIKTOK_SCOPES = ["user.info.basic", "video.upload", "video.publish"];
const API = "https://open.tiktokapis.com/v2";

export function tiktokAuthUrl(redirectUri: string, state: string) {
  const url = new URL("https://www.tiktok.com/v2/auth/authorize/");
  url.searchParams.set("client_key", requireEnv("TIKTOK_CLIENT_KEY"));
  url.searchParams.set("scope", TIKTOK_SCOPES.join(","));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  return url.toString();
}

type Token = { access_token: string; refresh_token: string; open_id: string; expires_in: number; refresh_expires_in: number; error?: string; error_description?: string };

async function tokenRequest(params: Record<string, string>): Promise<Token> {
  const res = await fetch(`${API}/oauth/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_key: requireEnv("TIKTOK_CLIENT_KEY"), client_secret: requireEnv("TIKTOK_CLIENT_SECRET"), ...params }),
  });
  const data = (await res.json()) as Token;
  if (!res.ok || data.error) throw new Error(`TikTok: ${data.error_description ?? data.error ?? res.status}`);
  return data;
}

export function exchangeTiktokCode(code: string, redirectUri: string) {
  return tokenRequest({ code, grant_type: "authorization_code", redirect_uri: redirectUri });
}

export async function getTiktokUser(accessToken: string) {
  const res = await fetch(`${API}/user/info/?fields=open_id,display_name,avatar_url,username`, { headers: { Authorization: `Bearer ${accessToken}` } });
  const data = (await res.json()) as { data?: { user?: { open_id: string; display_name?: string; avatar_url?: string; username?: string } }; error?: { code: string; message: string } };
  if (!res.ok || (data.error && data.error.code !== "ok")) throw new Error(`TikTok: ${data.error?.message ?? res.status}`);
  return data.data?.user ?? null;
}

export async function tiktokAccessToken(connectionId: string): Promise<string> {
  const c = await prisma.socialConnection.findUnique({ where: { id: connectionId } });
  if (!c) throw new Error("TikTok account is no longer connected");
  if (c.expiresAt && c.expiresAt.getTime() > Date.now() + 60_000) return decryptToken(c.accessToken);
  if (!c.refreshToken) throw new Error("TikTok connection expired; reconnect the account");
  const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: decryptToken(c.refreshToken) });
  await prisma.socialConnection.update({
    where: { id: c.id },
    data: { accessToken: encryptToken(t.access_token), refreshToken: encryptToken(t.refresh_token), expiresAt: new Date(Date.now() + t.expires_in * 1000) },
  });
  return t.access_token;
}

async function api<T>(path: string, token: string, body: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as { data: T; error?: { code: string; message: string } };
  if (!res.ok || (data.error && data.error.code !== "ok")) throw new Error(`TikTok: ${data.error?.message ?? res.status}`);
  return data.data;
}

/** Uploads a video (public URL) to a client's TikTok and publishes it. Returns the publish id. */
export async function postToTiktok(connectionId: string, videoUrl: string, caption: string): Promise<string> {
  const token = await tiktokAccessToken(connectionId);
  const creator = await api<{ privacy_level_options: string[] }>("/post/publish/creator_info/query/", token, {});
  const options = creator.privacy_level_options ?? [];
  // Unaudited apps may only post privately; once audited, post publicly.
  const privacy = options.includes("PUBLIC_TO_EVERYONE") && process.env.TIKTOK_AUDITED === "1" ? "PUBLIC_TO_EVERYONE" : "SELF_ONLY";

  const file = await fetch(videoUrl);
  if (!file.ok) throw new Error("Could not read the video file");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const size = bytes.byteLength;
  const CHUNK = 10_000_000;
  const chunkSize = size <= 64_000_000 ? size : CHUNK;
  const total = size <= 64_000_000 ? 1 : Math.floor(size / CHUNK);

  const init = await api<{ publish_id: string; upload_url: string }>("/post/publish/video/init/", token, {
    post_info: { title: caption.slice(0, 2200), privacy_level: privacy, disable_comment: false, disable_duet: false, disable_stitch: false },
    source_info: { source: "FILE_UPLOAD", video_size: size, chunk_size: chunkSize, total_chunk_count: total },
  });

  for (let i = 0; i < total; i++) {
    const start = i * chunkSize;
    const end = i === total - 1 ? size : start + chunkSize;
    const res = await fetch(init.upload_url, {
      method: "PUT",
      headers: { "Content-Type": "video/mp4", "Content-Range": `bytes ${start}-${end - 1}/${size}`, "Content-Length": String(end - start) },
      body: bytes.slice(start, end),
    });
    if (!res.ok && res.status !== 206) throw new Error(`TikTok upload failed (${res.status})`);
  }
  return init.publish_id;
}
