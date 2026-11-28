import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/client", () => ({ prisma: {} }));

beforeAll(() => {
  process.env.NEXTAUTH_SECRET = "test-secret-with-more-than-sixteen-chars";
});

import {
  createClientReportToken,
  readClientReportToken,
} from "../lib/dashboard/client-link";
import { buildSummary } from "../lib/dashboard/client-report";
import {
  lagosMonthKey,
  monthDayKeys,
  monthLabel,
  monthStart,
  previousMonthKey,
  resolveMonth,
} from "../lib/dashboard/insights";

const now = new Date("2026-11-28T10:00:00Z");

describe("client report links", () => {
  it("round-trips a signed token", () => {
    const { token } = createClientReportToken("acct_1", "2026-10", now);
    expect(readClientReportToken(token, now)).toMatchObject({ a: "acct_1", m: "2026-10" });
  });
  it("rejects a token whose payload was changed", () => {
    const { token } = createClientReportToken("acct_1", "2026-10", now);
    const [payload, sig] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(payload, "base64url").toString()), a: "acct_2" })
    ).toString("base64url");
    expect(readClientReportToken(`${forged}.${sig}`, now)).toBeNull();
  });
  it("rejects expired, empty and malformed tokens", () => {
    const { token } = createClientReportToken("acct_1", "2026-10", now);
    expect(readClientReportToken(token, new Date("2027-03-01T00:00:00Z"))).toBeNull();
    expect(readClientReportToken("", now)).toBeNull();
    expect(readClientReportToken("abc", now)).toBeNull();
    expect(readClientReportToken(`${token}.extra`, now)).toBeNull();
  });
});

describe("months", () => {
  it("finds the Lagos month and the one before", () => {
    expect(lagosMonthKey(new Date("2026-11-30T23:30:00Z"))).toBe("2026-12");
    expect(previousMonthKey("2026-01")).toBe("2025-12");
    expect(previousMonthKey("2026-11")).toBe("2026-10");
  });
  it("starts a month at Lagos midnight", () => {
    expect(monthStart("2026-11").toISOString()).toBe("2026-10-31T23:00:00.000Z");
  });
  it("lists the days of a running month only up to today", () => {
    const keys = monthDayKeys("2026-11", now);
    expect(keys[0]).toBe("2026-11-01");
    expect(keys[keys.length - 1]).toBe("2026-11-28");
    expect(keys).toHaveLength(28);
  });
  it("lists every day of a finished month", () => {
    expect(monthDayKeys("2026-02", now)).toHaveLength(28);
    expect(monthDayKeys("2026-10", now)).toHaveLength(31);
  });
  it("resolves current, previous and explicit months and refuses the rest", () => {
    expect(resolveMonth("current", now)).toBe("2026-11");
    expect(resolveMonth("previous", now)).toBe("2026-10");
    expect(resolveMonth("2026-03", now)).toBe("2026-03");
    expect(resolveMonth("2026-12", now)).toBeNull();
    expect(resolveMonth("2025-01", now)).toBeNull();
    expect(resolveMonth("garbage", now)).toBeNull();
  });
  it("labels a month", () => {
    expect(monthLabel("2026-11")).toBe("November 2026");
  });
});

describe("report summary", () => {
  const base = { monthLabel: "October 2026", inProgress: false, previousLabel: "September 2026" };
  it("says plainly when nothing was sent", () => {
    expect(buildSummary({ ...base, sent: 0, clicks: 0, contacts: 0, ctr: 0, change: null })).toContain("No DMs went out in October 2026");
  });
  it("describes results and the change", () => {
    const text = buildSummary({ ...base, sent: 120, clicks: 30, contacts: 100, ctr: 25, change: 20 });
    expect(text).toContain("120 DMs were delivered to 100 people");
    expect(text).toContain("25% click rate");
    expect(text).toContain("20% more DMs than September 2026");
  });
  it("handles one person and a drop", () => {
    const text = buildSummary({ ...base, sent: 1, clicks: 0, contacts: 1, ctr: 0, change: -50 });
    expect(text).toContain("to 1 person");
    expect(text).toContain("50% fewer");
  });
});
