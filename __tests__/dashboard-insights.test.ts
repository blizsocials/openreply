import { describe, expect, it } from "vitest";
import {
  buildAttention,
  buildDayKeys,
  buildWindow,
  bucketDaily,
  bucketHours,
  clientHealth,
  deliveryRate,
  lagosDay,
  lagosHour,
  parseRange,
  percentChange,
  sortAttention,
  totalsFor,
} from "../lib/dashboard/insights";

const now = new Date("2026-11-28T10:00:00Z"); // 11:00 in Lagos

describe("Lagos day and hour", () => {
  it("moves late evening UTC into the next Lagos day", () => {
    expect(lagosDay(new Date("2026-11-27T23:30:00Z"))).toBe("2026-11-28");
    expect(lagosHour(new Date("2026-11-27T23:30:00Z"))).toBe(0);
  });
  it("keeps midday in the same day", () => {
    expect(lagosDay(new Date("2026-11-28T10:00:00Z"))).toBe("2026-11-28");
    expect(lagosHour(new Date("2026-11-28T10:00:00Z"))).toBe(11);
  });
});

describe("windows", () => {
  it("lists N days ending today, oldest first", () => {
    const keys = buildDayKeys(now, 7);
    expect(keys).toHaveLength(7);
    expect(keys[0]).toBe("2026-11-22");
    expect(keys[6]).toBe("2026-11-28");
  });
  it("starts the window at Lagos midnight and the previous window the same length earlier", () => {
    const w = buildWindow(now, 7);
    expect(w.from.toISOString()).toBe("2026-11-21T23:00:00.000Z");
    expect(w.from.getTime() - w.prevFrom.getTime()).toBe(7 * 86_400_000);
  });
  it("falls back to 30 days for unknown ranges", () => {
    expect(parseRange("7")).toBe(7);
    expect(parseRange("90")).toBe(90);
    expect(parseRange("14")).toBe(30);
    expect(parseRange(null)).toBe(30);
  });
});

describe("maths", () => {
  it("counts statuses", () => {
    expect(
      totalsFor([
        { status: "SENT" },
        { status: "SENT" },
        { status: "FAILED" },
        { status: "SKIPPED_DEDUP" },
        { status: "SKIPPED_NO_MATCH" },
        { status: "PENDING" },
      ])
    ).toEqual({ sent: 2, failed: 1, skipped: 2, pending: 1 });
  });
  it("computes delivery rate and handles no sends", () => {
    expect(deliveryRate(9, 1)).toBe(90);
    expect(deliveryRate(0, 0)).toBeNull();
  });
  it("computes percent change without dividing by zero", () => {
    expect(percentChange(150, 100)).toBe(50);
    expect(percentChange(50, 100)).toBe(-50);
    expect(percentChange(5, 0)).toBeNull();
    expect(percentChange(0, 0)).toBe(0);
  });
});

describe("bucketing", () => {
  const keys = buildDayKeys(now, 3);
  const base = { instagramAccountId: "a", automationId: "x", commenterId: "c", matchedKeyword: null };
  it("puts events on the right day and counts every day, even empty ones", () => {
    const daily = bucketDaily(
      keys,
      [
        { ...base, createdAt: new Date("2026-11-28T08:00:00Z"), status: "SENT" },
        { ...base, createdAt: new Date("2026-11-28T09:00:00Z"), status: "FAILED" },
        { ...base, createdAt: new Date("2026-11-26T09:00:00Z"), status: "SENT" },
        { ...base, createdAt: new Date("2026-11-01T09:00:00Z"), status: "SENT" },
      ],
      [
        { id: "1", automationId: "x", recipientHash: "r1", ipHash: null, createdAt: new Date("2026-11-28T09:00:00Z"), instagramAccountId: "a" },
        { id: "2", automationId: "x", recipientHash: "r1", ipHash: null, createdAt: new Date("2026-11-28T09:30:00Z"), instagramAccountId: "a" },
      ]
    );
    expect(daily.map((d) => d.date)).toEqual(["2026-11-26", "2026-11-27", "2026-11-28"]);
    expect(daily[0].sent).toBe(1);
    expect(daily[1]).toMatchObject({ sent: 0, failed: 0, clicks: 0 });
    expect(daily[2]).toMatchObject({ sent: 1, failed: 1, clicks: 1 });
  });
  it("buckets sent DMs by Lagos hour", () => {
    const hours = bucketHours([
      { createdAt: new Date("2026-11-28T10:00:00Z"), status: "SENT" },
      { createdAt: new Date("2026-11-28T10:30:00Z"), status: "SENT" },
      { createdAt: new Date("2026-11-28T10:30:00Z"), status: "FAILED" },
    ]);
    expect(hours[11]).toBe(2);
    expect(hours.reduce((a, b) => a + b, 0)).toBe(2);
  });
});

describe("attention", () => {
  const healthy = { id: "a", username: "acme", provider: "META", tokenExpiresAt: new Date("2027-03-01T00:00:00Z"), webhookSubscribed: true };
  const stats = { activeAutomations: 2, totalAutomations: 2, sent: 40, failed: 1 };
  it("is empty for a healthy client", () => {
    expect(buildAttention(now, healthy, stats)).toEqual([]);
  });
  it("flags an expired connection as urgent", () => {
    const items = buildAttention(now, { ...healthy, tokenExpiresAt: new Date("2026-11-20T00:00:00Z") }, stats);
    expect(items[0]).toMatchObject({ severity: "high", client: "@acme" });
  });
  it("warns before a connection expires", () => {
    const items = buildAttention(now, { ...healthy, tokenExpiresAt: new Date("2026-12-03T10:00:00Z") }, stats);
    expect(items[0].severity).toBe("medium");
    expect(items[0].message).toContain("5 days");
  });
  it("flags missing webhook, high failure rate, and paused automations", () => {
    const items = buildAttention(
      now,
      { ...healthy, webhookSubscribed: false },
      { activeAutomations: 0, totalAutomations: 3, sent: 6, failed: 4 }
    );
    expect(items.map((i) => i.id)).toEqual(["a:webhook", "a:failures", "a:paused"]);
  });
  it("does not cry wolf on a handful of failures", () => {
    const items = buildAttention(now, healthy, { ...stats, sent: 1, failed: 2 });
    expect(items).toEqual([]);
  });
  it("suggests creating an automation when there is none", () => {
    const items = buildAttention(now, healthy, { activeAutomations: 0, totalAutomations: 0, sent: 0, failed: 0 });
    expect(items[0]).toMatchObject({ severity: "low", href: "/campaigns/new" });
  });
  it("sorts urgent items first and derives client health", () => {
    const sorted = sortAttention([
      { id: "1", severity: "low", client: "@b", message: "", href: "/" },
      { id: "2", severity: "high", client: "@z", message: "", href: "/" },
      { id: "3", severity: "medium", client: "@a", message: "", href: "/" },
    ]);
    expect(sorted.map((i) => i.id)).toEqual(["2", "3", "1"]);
    expect(clientHealth(sorted, 10)).toBe("attention");
    expect(clientHealth([], 10)).toBe("ok");
    expect(clientHealth([], 0)).toBe("idle");
  });
});
