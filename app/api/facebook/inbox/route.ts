import { NextRequest, NextResponse } from "next/server";
import { getCurrentWorkspaceId } from "@/lib/auth";
import { getWorkspaceInstagramAccount } from "@/lib/instagram-accounts";
import { createInstagramContext } from "@/lib/instagram/provider";
import { debugPageFeed, listMessengerConversations, getMessengerThread, sendMessengerReply, listPageComments, replyToPageComment } from "@/lib/meta/facebook-inbox";

export const dynamic = "force-dynamic";

async function composite(request: NextRequest, accountId: string | null) {
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) return { error: NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 }) };
  const account = await getWorkspaceInstagramAccount(workspaceId, accountId);
  if (!account) return { error: NextResponse.json({ success: false, error: "Client not connected." }, { status: 400 }) };
  const ctx = await createInstagramContext(account);
  if (ctx.provider !== "META") return { error: NextResponse.json({ success: false, error: "Facebook is not available for this client." }, { status: 400 }) };
  return { token: ctx.accessToken };
}

// GET ?kind=messenger|thread|comments&instagramAccountId=…&id=…
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const c = await composite(request, sp.get("instagramAccountId"));
  if ("error" in c) return c.error;
  try {
    const kind = sp.get("kind");
    if (kind === "thread") return NextResponse.json({ success: true, data: { messages: await getMessengerThread(c.token, sp.get("id") ?? "") } });
    if (kind === "debug") return NextResponse.json({ success: true, data: await debugPageFeed(c.token) });
    if (kind === "comments") return NextResponse.json({ success: true, data: { comments: await listPageComments(c.token) } });
    return NextResponse.json({ success: true, data: { conversations: await listMessengerConversations(c.token) } });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : "Facebook request failed" }, { status: 500 });
  }
}

// POST { kind: "message"|"comment", instagramAccountId, recipientId|commentId, text }
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { kind?: string; instagramAccountId?: string; recipientId?: string; commentId?: string; text?: string } | null;
  const text = body?.text?.trim();
  if (!text) return NextResponse.json({ success: false, error: "Write a reply first" }, { status: 400 });
  const c = await composite(request, body?.instagramAccountId ?? null);
  if ("error" in c) return c.error;
  try {
    if (body?.kind === "comment") await replyToPageComment(c.token, body.commentId ?? "", text);
    else await sendMessengerReply(c.token, body?.recipientId ?? "", text);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : "Send failed" }, { status: 500 });
  }
}
