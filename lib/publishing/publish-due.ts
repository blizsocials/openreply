import { prisma } from "@/lib/db/client";
import { getBaseUrl, getMetaGraphApiVersion } from "@/lib/env";
import { decryptToken } from "@/lib/meta/oauth";
import { decodeFacebookLoginToken, metaFetch } from "@/lib/meta/facebook-login";

/**
 * Blizsocials scheduler: publishes posts whose time has come.
 *
 * Instagram's API has no native scheduling, so the worker calls this every
 * minute. Images are JPEGs served from /api/media/<id>; Instagram fetches them
 * by URL. One image makes a single post; two to ten make a carousel.
 * Instagram allows 50 API-published posts per account per rolling 24 hours.
 */

const MAX_ATTEMPTS = 3;

function base() {
  return `https://graph.instagram.com/${getMetaGraphApiVersion()}`;
}

async function graph<T>(method: "GET" | "POST", path: string, token: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${base()}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("access_token", token);
  const response = await metaFetch(url.toString(), { method });
  const data = (await response.json().catch(() => ({}))) as { error?: { message?: string; code?: number } } & T;
  if (!response.ok || data.error) {
    throw new Error(`Meta ${data.error?.code ?? response.status}: ${data.error?.message ?? "request failed"}`);
  }
  return data;
}

async function waitUntilReady(containerId: string, token: string, tries = 20) {
  for (let i = 0; i < tries; i++) {
    const status = await graph<{ status_code?: string }>("GET", containerId, token, { fields: "status_code" });
    if (!status.status_code || status.status_code === "FINISHED") return;
    if (status.status_code === "ERROR" || status.status_code === "EXPIRED") {
      throw new Error(`Instagram could not process the media (${status.status_code})`);
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error("Instagram took too long to process the media");
}

async function fbGraph<T>(path: string, token: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`https://graph.facebook.com/${getMetaGraphApiVersion()}/${path}`);
  const body = new URLSearchParams({ ...params, access_token: token });
  const response = await fetch(url.toString(), { method: "POST", body });
  const data = (await response.json().catch(() => ({}))) as { error?: { message?: string; code?: number } } & T;
  if (!response.ok || data.error) {
    throw new Error(`Facebook ${data.error?.code ?? response.status}: ${data.error?.message ?? "request failed"}`);
  }
  return data;
}

/** Posts the images and caption to the client's Facebook Page. */
async function publishToFacebook(accessToken: string, urls: string[], caption: string): Promise<string> {
  const fb = decodeFacebookLoginToken(accessToken);
  if (!fb) throw new Error("Facebook posting needs the account connected with Continue with Facebook");
  if (urls.length === 1) {
    const res = await fbGraph<{ id: string; post_id?: string }>(`${fb.page}/photos`, fb.t, { url: urls[0], caption });
    return res.post_id ?? res.id;
  }
  const ids: string[] = [];
  for (const url of urls) {
    const photo = await fbGraph<{ id: string }>(`${fb.page}/photos`, fb.t, { url, published: "false" });
    ids.push(photo.id);
  }
  const params: Record<string, string> = { message: caption };
  ids.forEach((id, i) => (params[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id })));
  const res = await fbGraph<{ id: string }>(`${fb.page}/feed`, fb.t, params);
  return res.id;
}

async function publishOne(postId: string) {
  const post = await prisma.scheduledPost.findUnique({ where: { id: postId } });
  if (!post) return;
  const account = await prisma.instagramAccount.findUnique({ where: { id: post.instagramAccountId } });
  if (!account) throw new Error("Instagram account is no longer connected");

  const token = decryptToken(account.accessToken);
  const platforms = post.platforms?.length ? post.platforms : ["instagram"];

  // Facebook first is not required; each platform is skipped once done so a
  // retry never posts twice.
  if (platforms.includes("facebook") && !post.facebookPostId) {
    let fbId: string;
    if (post.mediaKind === "REEL" && post.videoUrl) {
      const fb = decodeFacebookLoginToken(token);
      if (!fb) throw new Error("Facebook posting needs the account connected with Continue with Facebook");
      const res = await fbGraph<{ id: string }>(`${fb.page}/videos`, fb.t, { file_url: post.videoUrl, description: post.caption });
      fbId = res.id;
    } else {
      const urlsForFb = post.mediaAssetIds.map((id: string) => `${getBaseUrl()}/api/media/${id}`);
      fbId = await publishToFacebook(token, urlsForFb, post.caption);
    }
    await prisma.scheduledPost.update({ where: { id: post.id }, data: { facebookPostId: fbId } });
  }
  if (!platforms.includes("instagram") || post.publishedMediaId) {
    await prisma.scheduledPost.update({
      where: { id: post.id },
      data: { status: "PUBLISHED", publishedAt: new Date(), errorMessage: null },
    });
    return;
  }
  const ig = account.instagramId;
  const urls = post.mediaAssetIds.map((id: string) => `${getBaseUrl()}/api/media/${id}`);

  let creationId: string;
  if (post.mediaKind === "REEL" && post.videoUrl) {
    const container = await graph<{ id: string }>("POST", `${ig}/media`, token, {
      media_type: "REELS",
      video_url: post.videoUrl,
      caption: post.caption,
      share_to_feed: "true",
    });
    creationId = container.id;
    // Videos take a while for Instagram to process: up to about 5 minutes.
    await waitUntilReady(creationId, token, 100);
  } else if (urls.length === 1) {
    const container = await graph<{ id: string }>("POST", `${ig}/media`, token, {
      image_url: urls[0],
      caption: post.caption,
    });
    creationId = container.id;
  } else {
    const children: string[] = [];
    for (const url of urls) {
      const child = await graph<{ id: string }>("POST", `${ig}/media`, token, {
        image_url: url,
        is_carousel_item: "true",
      });
      children.push(child.id);
    }
    for (const child of children) await waitUntilReady(child, token);
    const container = await graph<{ id: string }>("POST", `${ig}/media`, token, {
      media_type: "CAROUSEL",
      children: children.join(","),
      caption: post.caption,
    });
    creationId = container.id;
  }

  await waitUntilReady(creationId, token);
  const published = await graph<{ id: string }>("POST", `${ig}/media_publish`, token, { creation_id: creationId });
  let permalink: string | null = null;
  try {
    const media = await graph<{ permalink?: string }>("GET", published.id, token, { fields: "permalink" });
    permalink = media.permalink ?? null;
  } catch {
    // Published fine; the link is a nicety.
  }

  await prisma.scheduledPost.update({
    where: { id: post.id },
    data: { status: "PUBLISHED", publishedMediaId: published.id, permalink, publishedAt: new Date(), errorMessage: null },
  });
}

export async function publishDuePosts(): Promise<{ published: number; failed: number }> {
  const due = await prisma.scheduledPost.findMany({
    where: { status: "SCHEDULED", scheduledAt: { lte: new Date() } },
    orderBy: { scheduledAt: "asc" },
    take: 10,
    select: { id: true, attempts: true },
  });
  let published = 0;
  let failed = 0;
  for (const item of due) {
    // Claim it so two workers never publish the same post twice.
    const claimed = await prisma.scheduledPost.updateMany({
      where: { id: item.id, status: "SCHEDULED" },
      data: { status: "PUBLISHING", attempts: { increment: 1 } },
    });
    if (!claimed.count) continue;
    try {
      await publishOne(item.id);
      published++;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      const giveUp = item.attempts + 1 >= MAX_ATTEMPTS;
      await prisma.scheduledPost.update({
        where: { id: item.id },
        data: {
          status: giveUp ? "FAILED" : "SCHEDULED",
          errorMessage: message.slice(0, 500),
          // Retry in five minutes.
          ...(giveUp ? {} : { scheduledAt: new Date(Date.now() + 5 * 60 * 1000) }),
        },
      });
      failed++;
    }
  }
  return { published, failed };
}
