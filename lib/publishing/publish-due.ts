import { prisma } from "@/lib/db/client";
import { getBaseUrl, getMetaGraphApiVersion } from "@/lib/env";
import { decryptToken } from "@/lib/meta/oauth";
import { metaFetch } from "@/lib/meta/facebook-login";

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

async function waitUntilReady(containerId: string, token: string) {
  for (let i = 0; i < 20; i++) {
    const status = await graph<{ status_code?: string }>("GET", containerId, token, { fields: "status_code" });
    if (!status.status_code || status.status_code === "FINISHED") return;
    if (status.status_code === "ERROR" || status.status_code === "EXPIRED") {
      throw new Error(`Instagram could not process the media (${status.status_code})`);
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error("Instagram took too long to process the media");
}

async function publishOne(postId: string) {
  const post = await prisma.scheduledPost.findUnique({ where: { id: postId } });
  if (!post) return;
  const account = await prisma.instagramAccount.findUnique({ where: { id: post.instagramAccountId } });
  if (!account) throw new Error("Instagram account is no longer connected");

  const token = decryptToken(account.accessToken);
  const ig = account.instagramId;
  const urls = post.mediaAssetIds.map((id: string) => `${getBaseUrl()}/api/media/${id}`);

  let creationId: string;
  if (urls.length === 1) {
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
