import { NextRequest, NextResponse } from "next/server";
import { getCurrentWorkspaceId } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { createClientReportToken } from "@/lib/dashboard/client-link";
import { monthLabel, resolveMonth } from "@/lib/dashboard/insights";

/** Creates a shareable link to one client's report for one month. */
export async function POST(request: NextRequest) {
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    instagramAccountId?: unknown;
    month?: unknown;
  } | null;
  const accountId = typeof body?.instagramAccountId === "string" ? body.instagramAccountId : "";
  const monthInput = typeof body?.month === "string" ? body.month : "current";
  const month = resolveMonth(monthInput, new Date());
  if (!accountId || !month) {
    return NextResponse.json({ success: false, error: "Choose a client and a month from the last 12 months." }, { status: 400 });
  }

  // Only a client in this workspace can be shared.
  const account = await prisma.instagramAccount.findFirst({
    where: { id: accountId, workspaceId },
    select: { id: true },
  });
  if (!account) {
    return NextResponse.json({ success: false, error: "Client not found." }, { status: 404 });
  }

  const { token, expiresAt } = createClientReportToken(account.id, month);
  const origin = process.env.NEXTAUTH_URL ?? request.nextUrl.origin;
  return NextResponse.json({
    success: true,
    data: {
      url: `${origin.replace(/\/$/, "")}/client-report/${token}`,
      month,
      monthLabel: monthLabel(month),
      expiresAt: expiresAt.toISOString(),
    },
  });
}
