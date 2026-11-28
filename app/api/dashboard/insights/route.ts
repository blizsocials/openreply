import { NextRequest, NextResponse } from "next/server";
import { getCurrentWorkspaceId } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import {
  CLICK_ROW_SELECT,
  countUniqueClicks,
  countUniqueClicksBy,
} from "@/lib/tracking/analytics";
import {
  type AttentionItem,
  type ClickInput,
  type DmRow,
  bucketDaily,
  bucketHours,
  buildAttention,
  buildWindow,
  calculateCtr,
  clientHealth,
  deliveryRate,
  parseRange,
  percentChange,
  sortAttention,
  totalsFor,
} from "@/lib/dashboard/insights";

// Two windows (this period and the one before it) are read so every number can
// show how it moved. The cap keeps one very busy workspace from loading an
// unbounded number of rows into memory.
const ROW_CAP = 60_000;

export async function GET(request: NextRequest) {
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const now = new Date();
  const days = parseRange(request.nextUrl.searchParams.get("range"));
  const { from, prevFrom, keys } = buildWindow(now, days);
  const requested = request.nextUrl.searchParams.get("instagramAccountId");
  const selectedAccountId = requested && requested !== "all" ? requested : null;
  const accountFilter = selectedAccountId
    ? { instagramAccountId: selectedAccountId }
    : {};

  const [accounts, automations, logRows, clickRows] = await Promise.all([
    prisma.instagramAccount.findMany({
      where: { workspaceId },
      orderBy: { username: "asc" },
      select: {
        id: true,
        username: true,
        name: true,
        provider: true,
        tokenExpiresAt: true,
        webhookSubscribed: true,
      },
    }),
    prisma.automation.findMany({
      where: { workspaceId, ...accountFilter },
      select: { id: true, name: true, isActive: true, instagramAccountId: true },
    }),
    prisma.dmLog.findMany({
      where: { workspaceId, createdAt: { gte: prevFrom }, ...accountFilter },
      orderBy: { createdAt: "desc" },
      take: ROW_CAP,
      select: {
        createdAt: true,
        status: true,
        instagramAccountId: true,
        automationId: true,
        commenterId: true,
        matchedKeyword: true,
      },
    }),
    prisma.linkClick.findMany({
      where: { workspaceId, createdAt: { gte: prevFrom }, ...accountFilter },
      orderBy: { createdAt: "desc" },
      take: ROW_CAP,
      select: {
        ...CLICK_ROW_SELECT,
        createdAt: true,
        instagramAccountId: true,
      },
    }),
  ]);

  const logs: DmRow[] = logRows;
  const clicks: ClickInput[] = clickRows;

  const logsNow = logs.filter((l) => l.createdAt >= from);
  const logsPrev = logs.filter((l) => l.createdAt < from);
  const clicksNow = clicks.filter((c) => c.createdAt >= from);
  const clicksPrev = clicks.filter((c) => c.createdAt < from);

  const totalsNow = totalsFor(logsNow);
  const totalsPrev = totalsFor(logsPrev);
  const uniqueClicksNow = countUniqueClicks(clicksNow);
  const uniqueClicksPrev = countUniqueClicks(clicksPrev);
  const contactsNow = new Set(logsNow.map((l) => l.commenterId)).size;
  const contactsPrev = new Set(logsPrev.map((l) => l.commenterId)).size;

  const visibleAccounts = selectedAccountId
    ? accounts.filter((a) => a.id === selectedAccountId)
    : accounts;

  // Per automation.
  const automationClicks = countUniqueClicksBy(clicksNow, (c) => c.automationId);
  const sentByAutomation = new Map<string, number>();
  const failedByAutomation = new Map<string, number>();
  for (const log of logsNow) {
    if (log.status === "SENT") {
      sentByAutomation.set(log.automationId, (sentByAutomation.get(log.automationId) ?? 0) + 1);
    } else if (log.status === "FAILED") {
      failedByAutomation.set(log.automationId, (failedByAutomation.get(log.automationId) ?? 0) + 1);
    }
  }
  const accountName = new Map(accounts.map((a) => [a.id, a.username]));
  const automationRows = automations
    .map((a) => {
      const sent = sentByAutomation.get(a.id) ?? 0;
      const clicksCount = automationClicks.get(a.id) ?? 0;
      return {
        id: a.id,
        name: a.name,
        isActive: a.isActive,
        client: accountName.get(a.instagramAccountId) ?? "",
        sent,
        failed: failedByAutomation.get(a.id) ?? 0,
        clicks: clicksCount,
        ctr: calculateCtr(clicksCount, sent),
      };
    })
    .sort((a, b) => b.sent - a.sent || b.clicks - a.clicks || a.name.localeCompare(b.name))
    .slice(0, 8);

  // Per client, plus the "needs attention" list that sits on top of the page.
  const attention: AttentionItem[] = [];
  const clientRows = visibleAccounts.map((account) => {
    const accountLogs = logsNow.filter((l) => l.instagramAccountId === account.id);
    const accountClicks = clicksNow.filter((c) => c.instagramAccountId === account.id);
    const t = totalsFor(accountLogs);
    const accountAutomations = automations.filter(
      (a) => a.instagramAccountId === account.id
    );
    const activeAutomations = accountAutomations.filter((a) => a.isActive).length;
    const clicksCount = countUniqueClicks(accountClicks);
    const items = buildAttention(now, account, {
      activeAutomations,
      totalAutomations: accountAutomations.length,
      sent: t.sent,
      failed: t.failed,
    });
    attention.push(...items);
    const lastActivity = accountLogs.length
      ? accountLogs.reduce((latest, l) => (l.createdAt > latest ? l.createdAt : latest), accountLogs[0].createdAt)
      : null;
    return {
      id: account.id,
      username: account.username,
      name: account.name,
      activeAutomations,
      totalAutomations: accountAutomations.length,
      sent: t.sent,
      failed: t.failed,
      skipped: t.skipped,
      clicks: clicksCount,
      ctr: calculateCtr(clicksCount, t.sent),
      lastActivityAt: lastActivity ? lastActivity.toISOString() : null,
      health: clientHealth(items, t.sent),
    };
  });
  clientRows.sort((a, b) => b.sent - a.sent || a.username.localeCompare(b.username));

  // Keywords for this period.
  const keywordCounts = new Map<string, number>();
  for (const log of logsNow) {
    if (log.matchedKeyword) {
      keywordCounts.set(log.matchedKeyword, (keywordCounts.get(log.matchedKeyword) ?? 0) + 1);
    }
  }
  const keywords = [...keywordCounts]
    .map(([keyword, count]) => ({ keyword, count }))
    .sort((a, b) => b.count - a.count || a.keyword.localeCompare(b.keyword))
    .slice(0, 8);

  // Everything that was triggered, then delivered, then clicked.
  const triggered = logsNow.filter((l) => l.status !== "SKIPPED_NO_MATCH").length;

  return NextResponse.json({
    success: true,
    data: {
      range: days,
      from: from.toISOString(),
      to: now.toISOString(),
      accounts: accounts.map((a) => ({ id: a.id, username: a.username, name: a.name })),
      selectedInstagramAccountId: selectedAccountId,
      kpis: {
        sent: { value: totalsNow.sent, change: percentChange(totalsNow.sent, totalsPrev.sent) },
        clicks: { value: uniqueClicksNow, change: percentChange(uniqueClicksNow, uniqueClicksPrev) },
        ctr: {
          value: calculateCtr(uniqueClicksNow, totalsNow.sent),
          previous: calculateCtr(uniqueClicksPrev, totalsPrev.sent),
        },
        delivery: {
          value: deliveryRate(totalsNow.sent, totalsNow.failed),
          previous: deliveryRate(totalsPrev.sent, totalsPrev.failed),
        },
        contacts: { value: contactsNow, change: percentChange(contactsNow, contactsPrev) },
        failed: { value: totalsNow.failed, change: percentChange(totalsNow.failed, totalsPrev.failed) },
        skipped: { value: totalsNow.skipped, change: null },
        activeAutomations: automations.filter((a) => a.isActive).length,
        totalAutomations: automations.length,
      },
      daily: bucketDaily(keys, logsNow, clicksNow),
      hours: bucketHours(logsNow),
      funnel: { triggered, sent: totalsNow.sent, clicked: uniqueClicksNow },
      keywords,
      automations: automationRows,
      clients: clientRows,
      attention: sortAttention(attention),
      setup: {
        accountsConnected: accounts.length,
        webhookReady: accounts.some((a) => a.webhookSubscribed),
        hasAutomation: automations.length > 0,
        hasActiveAutomation: automations.some((a) => a.isActive),
        hasSent: logs.some((l) => l.status === "SENT"),
      },
      truncated: logRows.length >= ROW_CAP || clickRows.length >= ROW_CAP,
    },
  });
}
