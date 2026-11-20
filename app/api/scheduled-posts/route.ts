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
  mediaAssetIds: z.array(z.string().min(1)).min(1).max(10),
  scheduledAt: z.string().datetime(),
  platforms: z.array(z.enum(["instagram", "facebook"])).min(1).default(["instagram"]),
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
      scheduledAt: new Date(input.scheduledAt),
    },
  });
  return NextResponse.json({ success: true, data: post }, { status: 201 });
}
