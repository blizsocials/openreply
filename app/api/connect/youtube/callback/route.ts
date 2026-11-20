import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getBaseUrl } from "@/lib/env";
import { readConnectState } from "@/lib/connect/state";
import { exchangeYoutubeCode, getMyChannels } from "@/lib/connect/youtube";
import { encryptToken } from "@/lib/meta/oauth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const base = getBaseUrl();
  const state = readConnectState(request.nextUrl.searchParams.get("state"));
  const back = (q: string) =>
    NextResponse.redirect(state?.l ? `${base}/connect/${state.l}?${q}` : `${base}/clients?${q}`);
  if (!state) return NextResponse.redirect(`${base}/clients?youtube=invalid`);
  if (request.nextUrl.searchParams.get("error")) return back("youtube=denied");
  const code = request.nextUrl.searchParams.get("code");
  if (!code) return back("youtube=invalid");

  try {
    let clientName = "";
    let instagramAccountId: string | null = null;
    if (state.l) {
      const link = await prisma.connectLink.findUnique({ where: { token: state.l } });
      if (!link || link.workspaceId !== state.w) return back("youtube=invalid");
      clientName = link.clientName;
      instagramAccountId = link.instagramAccountId;
    }
    const tokens = await exchangeYoutubeCode(code, `${base}/api/connect/youtube/callback`);
    const channels = await getMyChannels(tokens.access_token);
    if (channels.length === 0) return back("youtube=no_channel");
    for (const ch of channels) {
      const data = {
        name: ch.snippet.title,
        handle: ch.snippet.customUrl ?? null,
        avatarUrl: ch.snippet.thumbnails?.default?.url ?? null,
        accessToken: encryptToken(tokens.access_token),
        expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        ...(tokens.refresh_token ? { refreshToken: encryptToken(tokens.refresh_token) } : {}),
        ...(clientName ? { clientName } : {}),
        ...(instagramAccountId ? { instagramAccountId } : {}),
      };
      await prisma.socialConnection.upsert({
        where: { workspaceId_platform_externalId: { workspaceId: state.w, platform: "youtube", externalId: ch.id } },
        update: data,
        create: { ...data, workspaceId: state.w, platform: "youtube", externalId: ch.id, clientName: clientName || ch.snippet.title },
      });
    }
    return back("youtube=connected");
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[YouTube connect]", message);
    return back(`youtube=failed&reason=${encodeURIComponent(message.slice(0, 150))}`);
  }
}
