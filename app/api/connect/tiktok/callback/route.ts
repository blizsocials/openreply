import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getBaseUrl } from "@/lib/env";
import { readConnectState } from "@/lib/connect/state";
import { exchangeTiktokCode, getTiktokUser } from "@/lib/connect/tiktok";
import { encryptToken } from "@/lib/meta/oauth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const base = getBaseUrl();
  const state = readConnectState(request.nextUrl.searchParams.get("state"));
  const back = (q: string) => NextResponse.redirect(state?.l ? `${base}/connect/${state.l}?${q}` : `${base}/clients?${q}`);
  if (!state) return NextResponse.redirect(`${base}/clients?tiktok=invalid`);
  if (request.nextUrl.searchParams.get("error")) return back("tiktok=denied");
  const code = request.nextUrl.searchParams.get("code");
  if (!code) return back("tiktok=invalid");
  try {
    let clientName = "";
    let instagramAccountId: string | null = null;
    if (state.l) {
      const link = await prisma.connectLink.findUnique({ where: { token: state.l } });
      if (!link || link.workspaceId !== state.w) return back("tiktok=invalid");
      clientName = link.clientName;
      instagramAccountId = link.instagramAccountId;
    }
    const t = await exchangeTiktokCode(code, `${base}/api/connect/tiktok/callback`);
    const user = await getTiktokUser(t.access_token).catch(() => null);
    const name = user?.display_name ?? "TikTok account";
    const data = {
      name,
      handle: user?.username ?? null,
      avatarUrl: user?.avatar_url ?? null,
      accessToken: encryptToken(t.access_token),
      refreshToken: encryptToken(t.refresh_token),
      expiresAt: new Date(Date.now() + t.expires_in * 1000),
      ...(clientName ? { clientName } : {}),
      ...(instagramAccountId ? { instagramAccountId } : {}),
    };
    await prisma.socialConnection.upsert({
      where: { workspaceId_platform_externalId: { workspaceId: state.w, platform: "tiktok", externalId: t.open_id } },
      update: data,
      create: { ...data, workspaceId: state.w, platform: "tiktok", externalId: t.open_id, clientName: clientName || name },
    });
    return back("tiktok=connected");
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[TikTok connect]", message);
    return back(`tiktok=failed&reason=${encodeURIComponent(message.slice(0, 150))}`);
  }
}
