import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getBaseUrl } from "@/lib/env";
import { createConnectState } from "@/lib/connect/state";
import { youtubeAuthUrl } from "@/lib/connect/youtube";
import { getCurrentWorkspaceContext } from "@/lib/workspace-access";

export const runtime = "nodejs";

// Opened by a client from their connect link (?link=TOKEN), or by staff from
// the Clients page.
export async function GET(request: NextRequest) {
  const base = getBaseUrl();
  const linkToken = request.nextUrl.searchParams.get("link");
  let workspaceId: string | null = null;
  if (linkToken) {
    const link = await prisma.connectLink.findUnique({ where: { token: linkToken } });
    if (!link || link.expiresAt < new Date()) return NextResponse.redirect(`${base}/connect/${linkToken}?error=expired`);
    workspaceId = link.workspaceId;
  } else {
    const ctx = await getCurrentWorkspaceContext();
    if (!ctx) return NextResponse.redirect(`${base}/login`);
    workspaceId = ctx.workspaceId;
  }
  if (!workspaceId) return NextResponse.redirect(`${base}/login`);
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    if (linkToken) return NextResponse.redirect(`${base}/connect/${linkToken}?youtube=not_configured`);
    return NextResponse.redirect(`${base}/clients?youtube=not_configured`);
  }
  const state = createConnectState(workspaceId, linkToken ?? undefined);
  return NextResponse.redirect(youtubeAuthUrl(`${base}/api/connect/youtube/callback`, state));
}
