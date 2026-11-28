import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET as startTiktok } from "../app/api/connect/tiktok/start/route";
import { GET as startYoutube } from "../app/api/connect/youtube/start/route";

const findUnique = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/client", () => ({ prisma: { connectLink: { findUnique } } }));
vi.mock("@/lib/workspace-access", () => ({
  getCurrentWorkspaceContext: async () => ({ workspaceId: "workspace" }),
}));
vi.mock("@/lib/env", () => ({ getBaseUrl: () => "https://automations.example" }));

afterEach(() => {
  vi.unstubAllEnvs();
  findUnique.mockReset();
});

describe.each([
  { platform: "tiktok", start: startTiktok, key: "TIKTOK_CLIENT_KEY" },
  { platform: "youtube", start: startYoutube, key: "GOOGLE_CLIENT_ID" },
])("$platform connection with unavailable configuration", ({ platform, start, key }) => {
  const endpoint = `https://automations.example/api/connect/${platform}/start`;

  it("returns a client to their connection page", async () => {
    vi.stubEnv(key, "");
    findUnique.mockResolvedValue({ workspaceId: "workspace", expiresAt: new Date(Date.now() + 60_000) });
    const response = await start(new NextRequest(`${endpoint}?link=client-token`));
    expect(response.headers.get("location")).toBe(
      `https://automations.example/connect/client-token?${platform}=not_configured`,
    );
  });

  it("shows the expired-link state when the link is no longer valid", async () => {
    vi.stubEnv(key, "");
    findUnique.mockResolvedValue({ workspaceId: "workspace", expiresAt: new Date(0) });
    const response = await start(new NextRequest(`${endpoint}?link=client-token`));
    expect(response.headers.get("location")).toBe("https://automations.example/connect/client-token?error=expired");
  });

  it("returns staff to Clients", async () => {
    vi.stubEnv(key, "");
    const response = await start(new NextRequest(endpoint));
    expect(response.headers.get("location")).toBe(`https://automations.example/clients?${platform}=not_configured`);
  });
});
