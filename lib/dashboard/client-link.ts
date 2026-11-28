import { createHmac, timingSafeEqual } from "crypto";
import { requireEnv } from "@/lib/env";

/**
 * Signed, expiring link to one client's report for one month.
 *
 * Nothing is stored: the link carries the client and the month, signed with the
 * app secret, so it cannot be edited into someone else's report. It stops
 * working after LINK_LIFE_DAYS. Rotating NEXTAUTH_SECRET revokes every link.
 */

export interface ClientReportClaim {
  /** Instagram account id (our database id). */
  a: string;
  /** Month, as YYYY-MM. */
  m: string;
  /** Expiry, ms since epoch. */
  e: number;
}

export const LINK_LIFE_DAYS = 90;
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

function sign(payload: string): string {
  return createHmac("sha256", requireEnv("NEXTAUTH_SECRET"))
    .update(`client-report:${payload}`)
    .digest("base64url");
}

export function isMonthKey(value: string): boolean {
  return MONTH_PATTERN.test(value);
}

export function createClientReportToken(
  accountId: string,
  month: string,
  now: Date = new Date()
): { token: string; expiresAt: Date } {
  const expiresAt = new Date(now.getTime() + LINK_LIFE_DAYS * 86_400_000);
  const claim: ClientReportClaim = { a: accountId, m: month, e: expiresAt.getTime() };
  const payload = Buffer.from(JSON.stringify(claim)).toString("base64url");
  return { token: `${payload}.${sign(payload)}`, expiresAt };
}

export function readClientReportToken(
  token: string,
  now: Date = new Date()
): ClientReportClaim | null {
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra !== undefined) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const claim = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as ClientReportClaim;
    if (
      typeof claim.a !== "string" ||
      typeof claim.m !== "string" ||
      typeof claim.e !== "number" ||
      !isMonthKey(claim.m)
    ) {
      return null;
    }
    if (claim.e <= now.getTime()) return null;
    return claim;
  } catch {
    return null;
  }
}
