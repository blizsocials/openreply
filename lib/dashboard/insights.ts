/**
 * Dashboard insight helpers.
 *
 * Pure functions only (no database, no React) so they can be unit tested.
 * Blizsocials works in Lagos time (UTC+1, no daylight saving), so every day
 * and hour bucket is cut in that zone rather than in the server's zone.
 */

import {
  type ClickRow,
  calculateCtr,
  countUniqueClicks,
} from "@/lib/tracking/analytics";

export const DASHBOARD_RANGES = [7, 30, 90] as const;
export type DashboardRange = (typeof DASHBOARD_RANGES)[number];

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
/** Africa/Lagos is a fixed UTC+1 all year. */
const LAGOS_OFFSET_MS = HOUR_MS;

export function parseRange(value: string | null | undefined): DashboardRange {
  const n = Number(value);
  return (DASHBOARD_RANGES as readonly number[]).includes(n)
    ? (n as DashboardRange)
    : 30;
}

/** "2026-11-28" for the Lagos calendar day this instant falls on. */
export function lagosDay(date: Date): string {
  return new Date(date.getTime() + LAGOS_OFFSET_MS).toISOString().slice(0, 10);
}

/** 0 to 23, the Lagos hour of the day. */
export function lagosHour(date: Date): number {
  return new Date(date.getTime() + LAGOS_OFFSET_MS).getUTCHours();
}

/** The last `days` Lagos calendar days, oldest first, ending today. */
export function buildDayKeys(now: Date, days: number): string[] {
  const keys: string[] = [];
  const today = Date.parse(`${lagosDay(now)}T00:00:00Z`);
  for (let i = days - 1; i >= 0; i--) {
    keys.push(new Date(today - i * DAY_MS).toISOString().slice(0, 10));
  }
  return keys;
}

/** The instant a Lagos day key starts (its midnight in Lagos). */
export function dayKeyStart(key: string): Date {
  return new Date(Date.parse(`${key}T00:00:00Z`) - LAGOS_OFFSET_MS);
}

export interface RangeWindow {
  /** Start of the selected window. */
  from: Date;
  /** Start of the equally long window right before it. */
  prevFrom: Date;
  keys: string[];
}

export function buildWindow(now: Date, days: number): RangeWindow {
  const keys = buildDayKeys(now, days);
  const from = dayKeyStart(keys[0]);
  return { from, prevFrom: new Date(from.getTime() - days * DAY_MS), keys };
}

export interface DmRow {
  createdAt: Date;
  status: string;
  instagramAccountId: string;
  automationId: string;
  commenterId: string;
  matchedKeyword: string | null;
}

export interface ClickInput extends ClickRow {
  createdAt: Date;
  instagramAccountId: string;
}

export interface StatusTotals {
  sent: number;
  failed: number;
  skipped: number;
  pending: number;
}

export function totalsFor(rows: Pick<DmRow, "status">[]): StatusTotals {
  const totals: StatusTotals = { sent: 0, failed: 0, skipped: 0, pending: 0 };
  for (const row of rows) {
    if (row.status === "SENT") totals.sent++;
    else if (row.status === "FAILED") totals.failed++;
    else if (row.status.startsWith("SKIPPED_")) totals.skipped++;
    else totals.pending++;
  }
  return totals;
}

/** Share of attempted sends that were delivered, as a percent. Null if none. */
export function deliveryRate(sent: number, failed: number): number | null {
  const attempted = sent + failed;
  if (attempted <= 0) return null;
  return Number(((sent / attempted) * 100).toFixed(1));
}

/** Percent change from `prev` to `cur`. Null when there is nothing to compare. */
export function percentChange(cur: number, prev: number): number | null {
  if (prev <= 0) return cur > 0 ? null : 0;
  return Number((((cur - prev) / prev) * 100).toFixed(1));
}

export interface DailyPoint {
  date: string;
  sent: number;
  failed: number;
  skipped: number;
  clicks: number;
}

export function bucketDaily(
  keys: string[],
  logs: DmRow[],
  clicks: ClickInput[]
): DailyPoint[] {
  const points = new Map<string, DailyPoint>(
    keys.map((date) => [date, { date, sent: 0, failed: 0, skipped: 0, clicks: 0 }])
  );
  const clicksByDay = new Map<string, ClickInput[]>();
  for (const log of logs) {
    const point = points.get(lagosDay(log.createdAt));
    if (!point) continue;
    if (log.status === "SENT") point.sent++;
    else if (log.status === "FAILED") point.failed++;
    else if (log.status.startsWith("SKIPPED_")) point.skipped++;
  }
  for (const click of clicks) {
    const day = lagosDay(click.createdAt);
    if (!points.has(day)) continue;
    const list = clicksByDay.get(day) ?? [];
    list.push(click);
    clicksByDay.set(day, list);
  }
  for (const [day, list] of clicksByDay) {
    points.get(day)!.clicks = countUniqueClicks(list);
  }
  return keys.map((key) => points.get(key)!);
}

/** DMs sent per Lagos hour of day, 24 slots. */
export function bucketHours(logs: Pick<DmRow, "createdAt" | "status">[]): number[] {
  const hours = new Array<number>(24).fill(0);
  for (const log of logs) {
    if (log.status === "SENT") hours[lagosHour(log.createdAt)]++;
  }
  return hours;
}

export interface AccountHealthInput {
  id: string;
  username: string;
  provider: string;
  tokenExpiresAt: Date | null;
  webhookSubscribed: boolean;
}

export type AttentionSeverity = "high" | "medium" | "low";

export interface AttentionItem {
  id: string;
  severity: AttentionSeverity;
  client: string;
  message: string;
  href: string;
}

const TOKEN_WARNING_DAYS = 14;
const HIGH_FAILURE_RATE = 20;
const MIN_ATTEMPTS_FOR_FAILURE_ALERT = 5;

/**
 * Everything a staff member should look at first, most urgent first. Each item
 * names the client and says what to do, so nobody has to open five pages to
 * find out why a client's automations went quiet.
 */
export function buildAttention(
  now: Date,
  account: AccountHealthInput,
  stats: { activeAutomations: number; totalAutomations: number; sent: number; failed: number }
): AttentionItem[] {
  const items: AttentionItem[] = [];
  const client = `@${account.username}`;

  if (account.tokenExpiresAt) {
    const daysLeft = Math.floor(
      (account.tokenExpiresAt.getTime() - now.getTime()) / DAY_MS
    );
    if (daysLeft < 0) {
      items.push({
        id: `${account.id}:token`,
        severity: "high",
        client,
        message: "Connection expired. Automations cannot reply until it is reconnected.",
        href: "/clients",
      });
    } else if (daysLeft <= TOKEN_WARNING_DAYS) {
      items.push({
        id: `${account.id}:token`,
        severity: "medium",
        client,
        message: `Connection expires in ${daysLeft} ${daysLeft === 1 ? "day" : "days"}. Reconnect before it lapses.`,
        href: "/clients",
      });
    }
  }

  if (!account.webhookSubscribed) {
    items.push({
      id: `${account.id}:webhook`,
      severity: "high",
      client,
      message: "Not receiving comments yet. Check the connection in Diagnostics.",
      href: "/diagnostics",
    });
  }

  const attempted = stats.sent + stats.failed;
  if (attempted >= MIN_ATTEMPTS_FOR_FAILURE_ALERT) {
    const failureRate = (stats.failed / attempted) * 100;
    if (failureRate >= HIGH_FAILURE_RATE) {
      items.push({
        id: `${account.id}:failures`,
        severity: "high",
        client,
        message: `${Math.round(failureRate)}% of DMs failed in this period. Open the DM logs to see why.`,
        href: "/logs",
      });
    }
  }

  if (stats.totalAutomations === 0) {
    items.push({
      id: `${account.id}:none`,
      severity: "low",
      client,
      message: "No automation yet. Create one to start capturing comments.",
      href: "/campaigns/new",
    });
  } else if (stats.activeAutomations === 0) {
    items.push({
      id: `${account.id}:paused`,
      severity: "medium",
      client,
      message: "Every automation is paused, so nothing is being sent.",
      href: "/campaigns",
    });
  }

  return items;
}

const SEVERITY_ORDER: Record<AttentionSeverity, number> = { high: 0, medium: 1, low: 2 };

export function sortAttention(items: AttentionItem[]): AttentionItem[] {
  return [...items].sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      a.client.localeCompare(b.client)
  );
}

export type ClientHealth = "ok" | "attention" | "idle";

export function clientHealth(items: AttentionItem[], sent: number): ClientHealth {
  if (items.some((i) => i.severity === "high" || i.severity === "medium")) {
    return "attention";
  }
  if (items.length > 0 || sent === 0) return "idle";
  return "ok";
}

export { calculateCtr };
