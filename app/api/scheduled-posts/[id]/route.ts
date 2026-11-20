import { NextRequest, NextResponse } from "next/server";
import { getCurrentWorkspaceId } from "@/lib/auth";
import { prisma } from "@/lib/db/client";

export const runtime = "nodejs";

// Cancel a post that has not started publishing.
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const removed = await prisma.scheduledPost.deleteMany({
    where: { id, workspaceId, status: { in: ["SCHEDULED", "FAILED"] } },
  });
  if (!removed.count) return NextResponse.json({ success: false, error: "Post cannot be cancelled now" }, { status: 409 });
  return NextResponse.json({ success: true });
}

// Move a scheduled post to a new time (used by the feed planner to reorder).
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { scheduledAt?: string } | null;
  const at = body?.scheduledAt ? new Date(body.scheduledAt) : null;
  if (!at || Number.isNaN(at.getTime())) return NextResponse.json({ success: false, error: "Invalid time" }, { status: 400 });
  const moved = await prisma.scheduledPost.updateMany({
    where: { id, workspaceId, status: "SCHEDULED" },
    data: { scheduledAt: at },
  });
  if (!moved.count) return NextResponse.json({ success: false, error: "Only scheduled posts can be moved" }, { status: 409 });
  return NextResponse.json({ success: true });
}
