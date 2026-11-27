import { NextRequest, NextResponse } from "next/server";
import { getCurrentWorkspaceId } from "@/lib/auth";
import { getWorkspaceInstagramAccount } from "@/lib/instagram-accounts";
import { createInstagramContext, getUserMedia, getRecentMediaComments, sendCommentReply } from "@/lib/instagram/provider";

export const dynamic = "force-dynamic";

export interface InboxComment {
  id: string;
  text: string;
  username: string | null;
  timestamp: string;
  replied: boolean;
  media: { id: string; thumb: string | null; permalink: string | null; caption: string | null };
}

// Blizsocials inbox: recent comments across the client's latest posts (30 days).
export async function GET(request: NextRequest) {
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const account = await getWorkspaceInstagramAccount(workspaceId, request.nextUrl.searchParams.get("instagramAccountId"));
  if (!account) return NextResponse.json({ success: false, error: "Instagram account not connected." }, { status: 400 });

  try {
    const context = await createInstagramContext(account);
    const media = await getUserMedia({ context, limit: 8 });
    const since = Date.now() - 30 * 86_400_000;
    const lists = await Promise.all(
      media.map(async (m) => {
        const rows = await getRecentMediaComments({ context, mediaId: m.id, sinceMs: since, max: 40 }).catch(() => []);
        return rows
          .filter((c) => c.from?.id !== account.instagramId)
          .map<InboxComment>((c) => ({
            id: c.id,
            text: c.text,
            username: c.from?.username ?? null,
            timestamp: c.timestamp,
            replied: (c.replies?.data ?? []).some((r) => r.from?.id === account.instagramId),
            media: { id: m.id, thumb: m.thumbnail_url ?? m.media_url ?? null, permalink: m.permalink ?? null, caption: m.caption ?? null },
          }));
      })
    );
    const comments = lists.flat().sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    return NextResponse.json({ success: true, data: { comments } });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : "Failed to load comments" }, { status: 500 });
  }
}

// Public reply to a comment.
export async function POST(request: NextRequest) {
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { instagramAccountId?: string; commentId?: string; mediaId?: string; text?: string } | null;
  const text = body?.text?.trim();
  if (!body?.commentId || !text) return NextResponse.json({ success: false, error: "Write a reply first" }, { status: 400 });
  const account = await getWorkspaceInstagramAccount(workspaceId, body.instagramAccountId ?? null);
  if (!account) return NextResponse.json({ success: false, error: "Instagram account not connected." }, { status: 400 });
  try {
    const context = await createInstagramContext(account);
    await sendCommentReply({ context, commentId: body.commentId, message: text, postId: body.mediaId });
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : "Reply failed" }, { status: 500 });
  }
}
