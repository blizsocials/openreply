import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { getBaseUrl } from "@/lib/env";
import { getCurrentWorkspaceContext, canManageWorkspace } from "@/lib/workspace-access";

export const runtime = "nodejs";

const LINK_DAYS = 7;

export async function GET() {
  const ctx = await getCurrentWorkspaceContext();
  if (!ctx) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const [links, connections] = await Promise.all([
    prisma.connectLink.findMany({ where: { workspaceId: ctx.workspaceId }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.socialConnection.findMany({
      where: { workspaceId: ctx.workspaceId },
      orderBy: { createdAt: "desc" },
      select: { id: true, clientName: true, instagramAccountId: true, platform: true, name: true, handle: true, avatarUrl: true, createdAt: true },
    }),
  ]);
  return NextResponse.json({
    success: true,
    data: {
      links: links.map((l) => ({ ...l, url: `${getBaseUrl()}/connect/${l.token}` })),
      connections,
    },
  });
}

const createSchema = z.object({
  clientName: z.string().trim().min(1).max(80),
  instagramAccountId: z.string().optional().nullable(),
});

export async function POST(request: NextRequest) {
  const ctx = await getCurrentWorkspaceContext();
  if (!ctx) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (!canManageWorkspace(ctx.role)) return NextResponse.json({ success: false, error: "Only owners and admins can create links" }, { status: 403 });
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: "Enter the client's name" }, { status: 400 });
  const link = await prisma.connectLink.create({
    data: {
      workspaceId: ctx.workspaceId,
      token: randomBytes(18).toString("base64url"),
      clientName: parsed.data.clientName,
      instagramAccountId: parsed.data.instagramAccountId || null,
      expiresAt: new Date(Date.now() + LINK_DAYS * 86_400_000),
    },
  });
  return NextResponse.json({ success: true, data: { ...link, url: `${getBaseUrl()}/connect/${link.token}` } }, { status: 201 });
}
