import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getBaseUrl } from "@/lib/env";
import { createConnectState } from "@/lib/connect/state";
import { tiktokAuthUrl } from "@/lib/connect/tiktok";
import { getCurrentWorkspaceContext } from "@/lib/workspace-access";

export const runtime = "nodejs";

// Opened by a client from their connect link (?link=TOKEN), or by staff from
// the Clients page.
export async function GET(request: NextRequest) {
  const base = getBaseUrl();
  if (!process.env.TIKTOK_CLIENT_KEY || !process.env.TIKTOK_CLIENT_SECRET) {
    return NextResponse.redirect(`${base}/clients?tiktok=not_configured`);
  }
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
  const state = createConnectState(workspaceId, linkToken ?? undefined);
  return NextResponse.redirect(tiktokAuthUrl(`${base}/api/connect/tiktok/callback`, state));
}
