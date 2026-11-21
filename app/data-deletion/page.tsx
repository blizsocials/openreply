import type { Metadata } from "next";
import BlizPublicShell, { Section, p, li, a, CONTACT_FORM } from "@/components/bliz-public-shell";

export const metadata: Metadata = {
  title: "Data deletion · Blizsocials Automations",
  description: "How to remove Blizsocials Automations' access to your accounts and ask us to delete your data.",
};

export default function DataDeletionPage() {
  return (
    <BlizPublicShell>
      <article style={{ maxWidth: 820, margin: "0 auto", padding: "40px 24px 80px", display: "flex", flexDirection: "column", gap: 32 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h1 style={{ fontSize: 34, fontWeight: 700, margin: 0, fontFamily: "var(--font-display)" }}>Data deletion</h1>
          <p style={{ ...p, color: "#5A5A5A" }}>Last updated 21 November 2026</p>
          <p style={p}>
            You are always in control of your accounts. You can remove our access yourself in a few taps, and you can ask us to
            delete everything we hold about you, whichever comes first.
          </p>
        </div>

        <Section title="Remove our access from Instagram or Facebook">
          <ol style={{ margin: 0, paddingLeft: 20 }}>
            <li style={li}>On Facebook, open Settings and privacy, then Settings, then Business integrations (or Apps and websites).</li>
            <li style={li}>Find <b>Blizsocials Automations</b> and choose Remove.</li>
            <li style={li}>On Instagram, open Settings, then Website permissions, then Apps and websites, and remove it there too.</li>
          </ol>
        </Section>

        <Section title="Remove our access from YouTube">
          <ol style={{ margin: 0, paddingLeft: 20 }}>
            <li style={li}>
              Open <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer" style={a}>your Google account permissions</a>.
            </li>
            <li style={li}>Choose <b>Blizsocials Automations</b> and select Delete all connections.</li>
          </ol>
        </Section>

        <Section title="Ask us to delete your data">
          <p style={p}>
            Email <a href="mailto:blizsocials@gmail.com?subject=Data%20deletion%20request" style={a}>blizsocials@gmail.com</a> with the
            subject &ldquo;Data deletion request&rdquo; and the account username or page name, or send the same through{" "}
            <a href={CONTACT_FORM} target="_blank" rel="noopener noreferrer" style={a}>our contact form</a>. We will confirm we
            received it within 7 days and delete the access tokens, scheduled posts, uploaded media, message records and saved
            statistics for that account within 30 days, then write back to confirm it is done.
          </p>
        </Section>

        <Section title="When Meta tells us you removed the app">
          <p style={p}>
            If you remove Blizsocials Automations from Facebook or Instagram, Meta notifies us, and we treat that as a request to
            stop using and delete that account&rsquo;s data on the same timeline.
          </p>
        </Section>
      </article>
    </BlizPublicShell>
  );
}
