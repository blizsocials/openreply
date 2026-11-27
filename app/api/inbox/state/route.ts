import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { getCurrentWorkspaceContext } from "@/lib/workspace-access";

export const dynamic = "force-dynamic";

// GET: every thread state in the workspace plus the team list for "Assign to".
export async function GET() {
  const ctx = await getCurrentWorkspaceContext();
  if (!ctx) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const [states, members] = await Promise.all([
    prisma.inboxThreadState.findMany({ where: { workspaceId: ctx.workspaceId } }),
    prisma.workspaceMember.findMany({ where: { workspaceId: ctx.workspaceId }, select: { user: { select: { id: true, name: true, email: true } } } }),
  ]);
  return NextResponse.json({
    success: true,
    data: { me: ctx.userId, states, team: members.map((m) => ({ id: m.user.id, name: m.user.name ?? m.user.email?.split("@")[0] ?? "Teammate" })) },
  });
}

const patch = z.object({
  key: z.string().min(3).max(300),
  assigneeId: z.string().nullable().optional(),
  priority: z.boolean().optional(),
  followUp: z.boolean().optional(),
  note: z.string().max(2000).nullable().optional(),
});

export async function PATCH(request: NextRequest) {
  const ctx = await getCurrentWorkspaceContext();
  if (!ctx) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const parsed = patch.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: "Invalid update" }, { status: 400 });
  const { key, ...rest } = parsed.data;
  const state = await prisma.inboxThreadState.upsert({
    where: { workspaceId_key: { workspaceId: ctx.workspaceId, key } },
    create: { workspaceId: ctx.workspaceId, key, ...rest, updatedById: ctx.userId },
    update: { ...rest, updatedById: ctx.userId },
  });
  return NextResponse.json({ success: true, data: state });
}
