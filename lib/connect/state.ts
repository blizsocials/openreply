import { createHmac, timingSafeEqual } from "crypto";
import { requireEnv } from "@/lib/env";

/** Signed OAuth state for Blizsocials platform connections (10 minute life). */
export type ConnectState = { w: string; l?: string; ts: number };

const MAX_AGE_MS = 15 * 60 * 1000;

function sign(payload: string) {
  return createHmac("sha256", requireEnv("NEXTAUTH_SECRET")).update(`connect:${payload}`).digest("base64url");
}

export function createConnectState(workspaceId: string, linkToken?: string): string {
  const payload = Buffer.from(JSON.stringify({ w: workspaceId, l: linkToken, ts: Date.now() })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function readConnectState(state: string | null): ConnectState | null {
  if (!state) return null;
  const [payload, sig] = state.split(".");
  if (!payload || !sig) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as ConnectState;
    if (typeof parsed.w !== "string" || typeof parsed.ts !== "number") return null;
    const age = Date.now() - parsed.ts;
    if (age < 0 || age > MAX_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}
