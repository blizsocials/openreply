import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentWorkspaceId } from "@/lib/auth";
import { prisma } from "@/lib/db/client";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const accountId = request.nextUrl.searchParams.get("instagramAccountId");
  const posts = await prisma.scheduledPost.findMany({
    where: { workspaceId, ...(accountId && accountId !== "all" ? { instagramAccountId: accountId } : {}) },
    orderBy: { scheduledAt: "desc" },
    take: 200,
  });
  return NextResponse.json({ success: true, data: posts });
}

const createSchema = z.object({
  instagramAccountId: z.string().min(1),
  caption: z.string().max(2200).default(""),
  mediaAssetIds: z.array(z.string().min(1)).max(10).default([]),
  mediaKind: z.enum(["IMAGE", "REEL"]).default("IMAGE"),
  videoUrl: z.string().url().optional().nullable(),
  scheduledAt: z.string().datetime(),
  platforms: z.array(z.enum(["instagram", "facebook"])).default(["instagram"]),
  socialConnectionIds: z.array(z.string().min(1)).max(10).default([]),
});

export async function POST(request: NextRequest) {
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Add at least one image and a time" }, { status: 400 });
  }
  const input = parsed.data;
  const account = await prisma.instagramAccount.findFirst({
    where: { id: input.instagramAccountId, workspaceId },
    select: { id: true },
  });
  if (!account) return NextResponse.json({ success: false, error: "Account not found" }, { status: 404 });
  if (input.platforms.length === 0 && input.socialConnectionIds.length === 0) {
    return NextResponse.json({ success: false, error: "Choose at least one place to post" }, { status: 400 });
  }
  if (input.socialConnectionIds.length) {
    const conns = await prisma.socialConnection.findMany({
      where: { id: { in: input.socialConnectionIds }, workspaceId },
      select: { platform: true },
    });
    if (conns.length !== input.socialConnectionIds.length) {
      return NextResponse.json({ success: false, error: "Connected account not found" }, { status: 400 });
    }
    if (conns.some((c) => c.platform === "youtube") && input.mediaKind !== "REEL") {
      return NextResponse.json({ success: false, error: "YouTube needs a video" }, { status: 400 });
    }
  }
  if (input.mediaKind === "REEL") {
    if (!input.videoUrl || !new URL(input.videoUrl).hostname.endsWith(".blob.vercel-storage.com")) {
      return NextResponse.json({ success: false, error: "Upload a video first" }, { status: 400 });
    }
  } else if (input.mediaAssetIds.length === 0) {
    return NextResponse.json({ success: false, error: "Add at least one image" }, { status: 400 });
  }
  const owned = await prisma.mediaAsset.count({ where: { id: { in: input.mediaAssetIds }, workspaceId } });
  if (owned !== input.mediaAssetIds.length) {
    return NextResponse.json({ success: false, error: "Image not found" }, { status: 400 });
  }
  const post = await prisma.scheduledPost.create({
    data: {
      workspaceId,
      instagramAccountId: account.id,
      caption: input.caption,
      mediaAssetIds: input.mediaAssetIds,
      platforms: input.platforms,
      socialConnectionIds: input.socialConnectionIds,
      mediaKind: input.mediaKind,
      videoUrl: input.mediaKind === "REEL" ? input.videoUrl : null,
      scheduledAt: new Date(input.scheduledAt),
    },
  });
  return NextResponse.json({ success: true, data: post }, { status: 201 });
}
