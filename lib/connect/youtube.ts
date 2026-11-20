import { prisma } from "@/lib/db/client";
import { requireEnv } from "@/lib/env";
import { decryptToken, encryptToken } from "@/lib/meta/oauth";

/**
 * Blizsocials YouTube connection (Google OAuth) and video upload.
 * Uploads from an unverified Google project stay private until Google audits
 * the project; the app must also leave "Testing" to keep refresh tokens alive
 * longer than 7 days.
 */

export const YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
];

export function youtubeAuthUrl(redirectUri: string, state: string) {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", requireEnv("GOOGLE_CLIENT_ID"));
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", YOUTUBE_SCOPES.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent select_account");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", state);
  return url.toString();
}

type TokenResponse = { access_token: string; refresh_token?: string; expires_in: number; error?: string; error_description?: string };

async function tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({
      client_id: requireEnv("GOOGLE_CLIENT_ID"),
      client_secret: requireEnv("GOOGLE_CLIENT_SECRET"),
      ...params,
    }),
  });
  const data = (await res.json()) as TokenResponse;
  if (!res.ok || data.error) throw new Error(`Google: ${data.error_description ?? data.error ?? res.status}`);
  return data;
}

export function exchangeYoutubeCode(code: string, redirectUri: string) {
  return tokenRequest({ code, redirect_uri: redirectUri, grant_type: "authorization_code" });
}

export async function getMyChannels(accessToken: string) {
  const res = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = (await res.json()) as {
    items?: Array<{ id: string; snippet: { title: string; customUrl?: string; thumbnails?: { default?: { url: string } } } }>;
    error?: { message: string };
  };
  if (!res.ok) throw new Error(`YouTube: ${data.error?.message ?? res.status}`);
  return data.items ?? [];
}

/** Returns a valid access token for a stored YouTube connection, refreshing it if needed. */
export async function youtubeAccessToken(connectionId: string): Promise<string> {
  const c = await prisma.socialConnection.findUnique({ where: { id: connectionId } });
  if (!c) throw new Error("YouTube channel is no longer connected");
  if (c.expiresAt && c.expiresAt.getTime() > Date.now() + 60_000) return decryptToken(c.accessToken);
  if (!c.refreshToken) throw new Error("YouTube connection expired; reconnect the channel");
  const t = await tokenRequest({ refresh_token: decryptToken(c.refreshToken), grant_type: "refresh_token" });
  await prisma.socialConnection.update({
    where: { id: c.id },
    data: { accessToken: encryptToken(t.access_token), expiresAt: new Date(Date.now() + t.expires_in * 1000) },
  });
  return t.access_token;
}

/** Uploads a public video URL to YouTube with a resumable upload. Returns the video id. */
export async function uploadToYoutube(connectionId: string, videoUrl: string, caption: string): Promise<string> {
  const token = await youtubeAccessToken(connectionId);
  const source = await fetch(videoUrl);
  if (!source.ok || !source.body) throw new Error("Could not read the video file");
  const length = source.headers.get("content-length");
  const firstLine = caption.split("\n").find((l) => l.trim()) ?? "New video";
  const title = firstLine.replace(/[<>]/g, "").slice(0, 100);

  const init = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": source.headers.get("content-type") ?? "video/mp4",
      ...(length ? { "X-Upload-Content-Length": length } : {}),
    },
    body: JSON.stringify({
      snippet: { title, description: caption.replace(/[<>]/g, "").slice(0, 5000) },
      status: { privacyStatus: "public", selfDeclaredMadeForKids: false },
    }),
  });
  if (!init.ok) throw new Error(`YouTube: ${(await init.text()).slice(0, 300)}`);
  const uploadUrl = init.headers.get("location");
  if (!uploadUrl) throw new Error("YouTube did not return an upload address");

  // Stream from storage to YouTube so large videos never sit in memory.
  const put = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": source.headers.get("content-type") ?? "video/mp4",
      ...(length ? { "Content-Length": length } : {}),
    },
    body: source.body,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
  const data = (await put.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
  if (!put.ok || !data.id) throw new Error(`YouTube: ${data.error?.message ?? put.status}`);
  return data.id;
}

/** Uploads a custom thumbnail (JPEG under 2 MB). Needs a verified YouTube channel. */
export async function setYoutubeThumbnail(connectionId: string, videoId: string, imageUrl: string): Promise<void> {
  const token = await youtubeAccessToken(connectionId);
  const image = await fetch(imageUrl);
  if (!image.ok) throw new Error("Could not read the cover image");
  const res = await fetch(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${encodeURIComponent(videoId)}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "image/jpeg" },
    body: await image.arrayBuffer(),
  });
  if (!res.ok) throw new Error(`YouTube thumbnail: ${(await res.text()).slice(0, 200)}`);
}
