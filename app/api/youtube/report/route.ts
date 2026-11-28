import { NextRequest, NextResponse } from "next/server";
import { getCurrentWorkspaceId } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { getYoutubeReport } from "@/lib/connect/youtube";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET ?instagramAccountId=…&since=…&until=… → the YouTube channel linked to that client.
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const igId = sp.get("instagramAccountId");
  const since = sp.get("since"), until = sp.get("until");
  if (!since || !until) return NextResponse.json({ success: false, error: "Choose dates" }, { status: 400 });
  const ig = igId ? await prisma.instagramAccount.findFirst({ where: { id: igId, workspaceId }, select: { username: true } }) : null;
  const all = (await prisma.socialConnection.findMany({ where: { workspaceId, platform: "youtube" } })) as Array<{ id: string; instagramAccountId: string | null; clientName: string; name: string }>;
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const conn = all.find((c) => c.instagramAccountId === igId) ?? (ig ? all.find((c) => norm(c.clientName) === norm(ig.username) || norm(c.name) === norm(ig.username)) : undefined);
  if (!conn) return NextResponse.json({ success: false, error: "No YouTube channel is connected for this client yet. Send them a connect link from Clients." }, { status: 404 });
  try {
    return NextResponse.json({ success: true, data: await getYoutubeReport(conn.id, since, until) }, { headers: { "Cache-Control": "private, max-age=600" } });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : "YouTube request failed" }, { status: 500 });
  }
}
