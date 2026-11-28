import { NextRequest, NextResponse } from "next/server";
import { getCurrentWorkspaceId } from "@/lib/auth";
import { getWorkspaceInstagramAccount } from "@/lib/instagram-accounts";
import { createInstagramContext } from "@/lib/instagram/provider";
import { getPageReport } from "@/lib/meta/facebook-inbox";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET ?instagramAccountId=…&since=YYYY-MM-DD&until=YYYY-MM-DD
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const account = await getWorkspaceInstagramAccount(workspaceId, sp.get("instagramAccountId"));
  if (!account) return NextResponse.json({ success: false, error: "Client not connected." }, { status: 400 });
  const since = sp.get("since"), until = sp.get("until");
  if (!since || !until) return NextResponse.json({ success: false, error: "Choose dates" }, { status: 400 });
  try {
    const ctx = await createInstagramContext(account);
    if (ctx.provider !== "META") return NextResponse.json({ success: false, error: "Facebook is not connected for this client." }, { status: 400 });
    return NextResponse.json({ success: true, data: await getPageReport(ctx.accessToken, since, until) }, { headers: { "Cache-Control": "private, max-age=600" } });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : "Facebook request failed" }, { status: 500 });
  }
}
