import type { Metadata } from "next";
import BlizPublicShell, { BLACK, YELLOW, CONTACT_FORM } from "@/components/bliz-public-shell";

export const metadata: Metadata = {
  title: "Blizsocials Automations",
  description:
    "The internal tool the Blizsocials team uses to schedule posts, reply to comments and messages, and report results for the businesses we manage.",
};

const FEATURES = [
  { title: "Scheduling and publishing", body: "We plan and publish approved posts, carousels, Reels and videos to our clients' Instagram, Facebook and YouTube at the right time, with a content calendar and feed planner so every grid looks intentional." },
  { title: "Comment and message replies", body: "When someone comments a keyword our client has chosen, the tool sends them the promised link or information by direct message, so no lead waits for a reply." },
  { title: "Weekly reporting", body: "We pull each client's reach, views, likes, comments, shares and follower growth into clear weekly reports, with organic and paid results always kept separate." },
  { title: "Secure client connections", body: "Clients connect their own accounts through the official Instagram, Facebook and Google sign-in screens. We never see or store their passwords, and they can remove access at any time." },
];

export default function HomePage() {
  return (
    <BlizPublicShell wide>
      <section style={{ background: BLACK, color: "#fff", padding: "72px 24px 80px" }}>
        <div style={{ maxWidth: 1040, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
          <span style={{ color: YELLOW, fontWeight: 700, fontSize: 13, letterSpacing: 1.5, textTransform: "uppercase" }}>By Blizsocials, Lagos</span>
          <h1 style={{ fontSize: "clamp(32px, 5vw, 54px)", lineHeight: 1.1, margin: 0, fontFamily: "var(--font-display)", maxWidth: 760 }}>
            The tool behind the social media we run for our clients
          </h1>
          <p style={{ fontSize: 18, lineHeight: 1.7, color: "#D6D6D6", margin: 0, maxWidth: 680 }}>
            Blizsocials Automations is the private workspace our team uses to publish content, answer comments and messages,
            and report results for every business we manage. It is not sold to the public, and only the Blizsocials team
            signs in.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <a href="/login" style={{ background: YELLOW, color: BLACK, borderRadius: 12, padding: "14px 22px", fontWeight: 700, textDecoration: "none" }}>Team sign in</a>
            <a href={CONTACT_FORM} target="_blank" rel="noopener noreferrer" style={{ border: "1px solid #555", color: "#fff", borderRadius: 12, padding: "14px 22px", fontWeight: 600, textDecoration: "none" }}>Work with Blizsocials</a>
          </div>
        </div>
      </section>

      <section style={{ padding: "64px 24px" }}>
        <div style={{ maxWidth: 1040, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 18 }}>
          {FEATURES.map((f) => (
            <div key={f.title} style={{ background: "#fff", border: "1px solid #E2E0D8", borderRadius: 18, padding: 22, display: "flex", flexDirection: "column", gap: 10 }}>
              <span style={{ width: 10, height: 10, borderRadius: 99, background: YELLOW }} />
              <h2 style={{ fontSize: 18, margin: 0, fontFamily: "var(--font-display)" }}>{f.title}</h2>
              <p style={{ margin: 0, lineHeight: 1.65, color: "#3E3E3E", fontSize: 15 }}>{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section style={{ padding: "0 24px 72px" }}>
        <div style={{ maxWidth: 1040, margin: "0 auto", background: "#FFF6BF", borderRadius: 20, padding: 28, display: "flex", flexDirection: "column", gap: 10 }}>
          <h2 style={{ fontSize: 20, margin: 0, fontFamily: "var(--font-display)" }}>How we use Google and YouTube data</h2>
          <p style={{ margin: 0, lineHeight: 1.7, color: "#2E2E2E" }}>
            When a client connects their YouTube channel, we ask Google for permission to upload the videos they approve and
            to read their channel name so we can show which channel is connected. We use this access only to publish their
            content, we never sell it or use it for advertising, and our use follows the Google API Services User Data Policy,
            including its Limited Use requirements. Read the full details in our <a href="/privacy" style={{ color: BLACK, fontWeight: 700 }}>Privacy Policy</a>.
          </p>
        </div>
      </section>
    </BlizPublicShell>
  );
}
