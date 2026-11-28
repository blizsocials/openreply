import { prisma } from "@/lib/db/client";
import type { Insights } from "@/components/dashboard/types";
import {
  CLICK_ROW_SELECT,
  countUniqueClicks,
  countUniqueClicksBy,
} from "@/lib/tracking/analytics";
import {
  type ClickInput,
  type DmRow,
  bucketDaily,
  bucketHours,
  calculateCtr,
  deliveryRate,
  monthDayKeys,
  monthLabel,
  monthStart,
  percentChange,
  previousMonthKey,
  totalsFor,
} from "@/lib/dashboard/insights";

const ROW_CAP = 60_000;

export interface ClientMonthReport {
  client: { username: string; name: string | null };
  workspaceName: string;
  month: string;
  monthLabel: string;
  inProgress: boolean;
  generatedAt: Date;
  kpis: Insights["kpis"];
  daily: Insights["daily"];
  hours: Insights["hours"];
  funnel: Insights["funnel"];
  keywords: Insights["keywords"];
  automations: Insights["automations"];
  summary: string;
}

function nextMonth(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
}

/** One plain sentence or two a client can read without looking at a chart. */
export function buildSummary(args: {
  monthLabel: string;
  inProgress: boolean;
  sent: number;
  clicks: number;
  contacts: number;
  ctr: number;
  change: number | null;
  previousLabel: string;
}): string {
  const { monthLabel: label, sent, clicks, contacts, ctr, change, previousLabel } = args;
  if (sent === 0) {
    return `No DMs went out in ${label}${args.inProgress ? " so far" : ""}. Once people comment on posts with an automation on, this page fills in.`;
  }
  const people = contacts === 1 ? "1 person" : `${contacts.toLocaleString("en-NG")} people`;
  let text = `In ${label}${args.inProgress ? " so far" : ""}, ${sent.toLocaleString("en-NG")} DMs were delivered to ${people} who commented, and ${clicks.toLocaleString("en-NG")} of them tapped the link (${ctr}% click rate).`;
  if (change !== null && change !== 0) {
    text += ` That is ${Math.abs(change)}% ${change > 0 ? "more" : "fewer"} DMs than ${previousLabel}.`;
  }
  return text;
}

export async function getClientMonthReport(
  accountId: string,
  month: string,
  now: Date = new Date()
): Promise<ClientMonthReport | null> {
  const account = await prisma.instagramAccount.findUnique({
    where: { id: accountId },
    select: {
      id: true,
      username: true,
      name: true,
      workspaceId: true,
      workspace: { select: { name: true } },
    },
  });
  if (!account) return null;

  const prevMonth = previousMonthKey(month);
  const from = monthStart(month);
  const to = monthStart(nextMonth(month));
  const prevFrom = monthStart(prevMonth);

  const [automations, logRows, clickRows] = await Promise.all([
    prisma.automation.findMany({
      where: { workspaceId: account.workspaceId, instagramAccountId: account.id },
      select: { id: true, name: true, isActive: true },
    }),
    prisma.dmLog.findMany({
      where: {
        workspaceId: account.workspaceId,
        instagramAccountId: account.id,
        createdAt: { gte: prevFrom, lt: to },
      },
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
      where: {
        workspaceId: account.workspaceId,
        instagramAccountId: account.id,
        createdAt: { gte: prevFrom, lt: to },
      },
      take: ROW_CAP,
      select: { ...CLICK_ROW_SELECT, createdAt: true, instagramAccountId: true },
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
  const clicksNowCount = countUniqueClicks(clicksNow);
  const clicksPrevCount = countUniqueClicks(clicksPrev);
  const contactsNow = new Set(logsNow.map((l) => l.commenterId)).size;
  const contactsPrev = new Set(logsPrev.map((l) => l.commenterId)).size;
  const ctr = calculateCtr(clicksNowCount, totalsNow.sent);
  const sentChange = percentChange(totalsNow.sent, totalsPrev.sent);

  const byAutomationClicks = countUniqueClicksBy(clicksNow, (c) => c.automationId);
  const sentBy = new Map<string, number>();
  const failedBy = new Map<string, number>();
  for (const log of logsNow) {
    if (log.status === "SENT") sentBy.set(log.automationId, (sentBy.get(log.automationId) ?? 0) + 1);
    else if (log.status === "FAILED") failedBy.set(log.automationId, (failedBy.get(log.automationId) ?? 0) + 1);
  }
  const automationRows = automations
    .map((a) => {
      const sent = sentBy.get(a.id) ?? 0;
      const c = byAutomationClicks.get(a.id) ?? 0;
      return {
        id: a.id,
        name: a.name,
        isActive: a.isActive,
        client: account.username,
        sent,
        failed: failedBy.get(a.id) ?? 0,
        clicks: c,
        ctr: calculateCtr(c, sent),
      };
    })
    .filter((a) => a.sent > 0 || a.clicks > 0)
    .sort((a, b) => b.sent - a.sent || b.clicks - a.clicks)
    .slice(0, 8);

  const keywordCounts = new Map<string, number>();
  for (const log of logsNow) {
    if (log.matchedKeyword) keywordCounts.set(log.matchedKeyword, (keywordCounts.get(log.matchedKeyword) ?? 0) + 1);
  }

  const inProgress = now < to;
  const label = monthLabel(month);

  return {
    client: { username: account.username, name: account.name },
    workspaceName: account.workspace.name,
    month,
    monthLabel: label,
    inProgress,
    generatedAt: now,
    kpis: {
      sent: { value: totalsNow.sent, change: sentChange },
      clicks: { value: clicksNowCount, change: percentChange(clicksNowCount, clicksPrevCount) },
      ctr: { value: ctr, previous: calculateCtr(clicksPrevCount, totalsPrev.sent) },
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
    daily: bucketDaily(monthDayKeys(month, now), logsNow, clicksNow),
    hours: bucketHours(logsNow),
    funnel: {
      triggered: logsNow.filter((l) => l.status !== "SKIPPED_NO_MATCH").length,
      sent: totalsNow.sent,
      clicked: clicksNowCount,
    },
    keywords: [...keywordCounts]
      .map(([keyword, count]) => ({ keyword, count }))
      .sort((a, b) => b.count - a.count || a.keyword.localeCompare(b.keyword))
      .slice(0, 8),
    automations: automationRows,
    summary: buildSummary({
      monthLabel: label,
      inProgress,
      sent: totalsNow.sent,
      clicks: clicksNowCount,
      contacts: contactsNow,
      ctr,
      change: sentChange,
      previousLabel: monthLabel(prevMonth),
    }),
  };
}
