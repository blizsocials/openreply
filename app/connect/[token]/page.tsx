import { prisma } from "@/lib/db/client";
import { PlatformIcon, PLATFORMS as LOGOS, type PlatformId } from "@/components/platform-icon";

export const dynamic = "force-dynamic";
export const metadata = { title: "Connect your accounts · Blizsocials", robots: { index: false } };

const BLACK = "#0E0E0E";
const YELLOW = "#FFD701";

const PLATFORMS = [
  { id: "youtube", name: "YouTube", note: "Choose your channel, then approve uploads.", ready: true },
  { id: "pinterest", name: "Pinterest", note: "Coming soon", ready: false },
  { id: "tiktok", name: "TikTok", note: "Sign in to TikTok, then approve posting.", ready: true },
  { id: "linkedin", name: "LinkedIn", note: "Coming soon", ready: false },
  { id: "threads", name: "Threads", note: "Coming soon", ready: false },
  { id: "snapchat", name: "Snapchat", note: "Coming soon", ready: false },
  { id: "x", name: "X", note: "Coming soon", ready: false },
] as const;

const MESSAGES: Record<string, string> = {
  connected: "Connected. Thank you!",
  denied: "You cancelled the connection. You can try again any time.",
  no_channel: "That Google account has no YouTube channel. Sign in with the account that owns or manages the channel.",
  not_configured: "This connection is unavailable right now. Contact your Blizsocials manager for help.",
  failed: "Something went wrong. Please try again, or tell your Blizsocials manager.",
  invalid: "That attempt timed out. Please tap Connect again.",
  expired: "This link has expired. Ask your Blizsocials manager for a new one.",
};

export default async function ConnectPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { token } = await params;
  const query = await searchParams;
  const link = await prisma.connectLink.findUnique({ where: { token } });
  const expired = !link || link.expiresAt < new Date();
  const connections = link
    ? await prisma.socialConnection.findMany({
        where: { workspaceId: link.workspaceId, clientName: link.clientName },
        select: { platform: true, name: true },
      })
    : [];
  const status = query.youtube ?? query.tiktok ?? (query.error === "expired" ? "expired" : undefined);

  return (
    <main style={{ minHeight: "100vh", background: "#F4F3EF", padding: "40px 20px", fontFamily: "var(--font-montserrat), sans-serif", color: "#121212" }}>
      <div style={{ maxWidth: 560, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 40, height: 40, borderRadius: 10, background: YELLOW, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 22, fontFamily: "var(--font-poppins), sans-serif" }}>b</span>
          <span style={{ fontWeight: 600, fontSize: 18, fontFamily: "var(--font-poppins), sans-serif" }}>Blizsocials</span>
        </div>

        {expired ? (
          <section style={{ background: "#fff", borderRadius: 20, padding: 28 }}>
            <h1 style={{ margin: 0, fontSize: 24, fontFamily: "var(--font-poppins), sans-serif" }}>This link has expired</h1>
            <p style={{ color: "#3E3E3E", lineHeight: 1.6 }}>Please ask your Blizsocials manager to send you a new one.</p>
          </section>
        ) : (
          <section style={{ background: "#fff", borderRadius: 20, padding: 28, display: "flex", flexDirection: "column", gap: 16 }}>
            <h1 style={{ margin: 0, fontSize: 24, fontFamily: "var(--font-poppins), sans-serif" }}>Hi {link.clientName}, connect your accounts</h1>
            <p style={{ margin: 0, color: "#3E3E3E", lineHeight: 1.6 }}>
              This lets the Blizsocials team use the permissions you approve on each platform. You sign in to each platform yourself, so we never see your passwords, and you can remove access at any time from that platform&apos;s settings.
            </p>
            {status && Object.hasOwn(MESSAGES, status) && (
              <p role="status" style={{ margin: 0, padding: "12px 14px", borderRadius: 12, background: status === "connected" ? "#DFF3DF" : "#FFF6BF", fontWeight: 600 }}>{MESSAGES[status]}</p>
            )}
            {PLATFORMS.map((p) => {
              const done = connections.filter((c) => c.platform === p.id);
              return (
                <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 14, border: "1px solid #E2E0D8", borderRadius: 14, padding: "14px 16px", flexWrap: "wrap" }}>
                  {p.id in LOGOS && <PlatformIcon id={p.id as PlatformId} size={28} />}
                  <div style={{ flex: "1 1 200px", display: "flex", flexDirection: "column", gap: 2 }}>
                    <span style={{ fontWeight: 700 }}>{p.name}</span>
                    <span style={{ fontSize: 13, color: "#5A5A5A" }}>
                      {done.length ? `Connected: ${done.map((d) => d.name).join(", ")}` : p.ready ? p.note : "This platform cannot be connected from this page yet."}
                    </span>
                  </div>
                  {p.ready ? (
                    <a
                      href={`/api/connect/${p.id}/start?link=${token}`}
                      style={{ background: done.length ? "#fff" : BLACK, color: done.length ? BLACK : YELLOW, border: `1px solid ${BLACK}`, borderRadius: 12, padding: "12px 18px", fontWeight: 700, textDecoration: "none", fontSize: 14 }}
                    >
                      {done.length ? "Connect another" : "Connect"}
                    </a>
                  ) : (
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#6B5A00", background: "#FFF6BF", borderRadius: 999, padding: "6px 12px" }}>Unavailable</span>
                  )}
                </div>
              );
            })}
            <p style={{ margin: 0, fontSize: 12, color: "#5A5A5A" }}>Link valid until {link.expiresAt.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Lagos" })}.</p>
          </section>
        )}
      </div>
    </main>
  );
}
