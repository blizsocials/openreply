import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy · Blizsocials Automations",
  description:
    "How Blizsocials Automations collects, uses, stores and protects data from Instagram, Facebook and YouTube accounts our clients connect.",
};

const BLACK = "#0E0E0E";
const YELLOW = "#FFD701";
const UPDATED = "21 November 2026";
const CONTACT_FORM =
  "https://docs.google.com/forms/d/e/1FAIpQLScirZDGrKxPZ5nnHC6y1qzBSxX4L18PcvObgEsF1oKl2SdptQ/viewform";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, fontFamily: "var(--font-display)" }}>{title}</h2>
      {children}
    </section>
  );
}

const p = { margin: 0, lineHeight: 1.7, color: "#2E2E2E" } as const;
const li = { lineHeight: 1.7, color: "#2E2E2E", marginBottom: 6 } as const;

export default function PrivacyPage() {
  return (
    <main style={{ minHeight: "100dvh", background: "#FAF9F5", color: BLACK }}>
      <header style={{ background: BLACK, padding: "20px 24px" }}>
        <div style={{ maxWidth: 820, margin: "0 auto", display: "flex", alignItems: "center", gap: 12 }}>
          <span
            style={{ width: 36, height: 36, borderRadius: 8, background: YELLOW, color: BLACK, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 18 }}
          >
            b
          </span>
          <span style={{ color: "#fff", fontWeight: 600, fontFamily: "var(--font-display)" }}>Blizsocials Automations</span>
        </div>
      </header>

      <article style={{ maxWidth: 820, margin: "0 auto", padding: "40px 24px 80px", display: "flex", flexDirection: "column", gap: 32 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h1 style={{ fontSize: 34, fontWeight: 700, margin: 0, fontFamily: "var(--font-display)" }}>Privacy Policy</h1>
          <p style={{ ...p, color: "#5A5A5A" }}>Last updated {UPDATED}</p>
          <p style={p}>
            Blizsocials Automations is the internal tool that the Blizsocials team uses to manage social media for the
            businesses we work with. It is run by Blizsocials, a social media marketing and creative agency at 265 Ikotun
            Idimu Road, Idimu, Lagos State, Nigeria. This policy explains, in plain language, what information the tool
            handles when a client connects their Instagram, Facebook or YouTube account, why we need it, and how we keep it
            safe. When we say &ldquo;we&rdquo;, &ldquo;us&rdquo; or &ldquo;Blizsocials&rdquo;, we mean the agency and its
            team.
          </p>
        </div>

        <Section title="Who uses the tool">
          <p style={p}>
            The tool is not sold to the public. Only members of the Blizsocials team sign in to it. Our clients never sign
            in to the tool itself; they only use a secure connect link to give us access to their accounts, signing in
            directly with Instagram, Facebook or Google so that we never see or store their passwords.
          </p>
        </Section>

        <Section title="What we collect">
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            <li style={li}>
              <b>Team account details:</b> the email address each team member signs in with.
            </li>
            <li style={li}>
              <b>Connected account details:</b> account and page names, usernames, profile pictures, account IDs, follower
              counts, and the access tokens that the platforms issue when a client approves access. Tokens are encrypted
              before they are stored.
            </li>
            <li style={li}>
              <b>Content we publish for clients:</b> images, videos, cover images, captions and the times we schedule them.
            </li>
            <li style={li}>
              <b>Engagement data:</b> comments and direct messages on the client&rsquo;s Instagram account that our
              automations respond to, and the delivery records of those replies.
            </li>
            <li style={li}>
              <b>Performance data:</b> post and account statistics such as reach, views, likes, comments, shares and saves,
              which we use to report to the client.
            </li>
            <li style={li}>
              <b>Basic technical logs:</b> error and activity records that help us keep the tool working.
            </li>
          </ul>
        </Section>

        <Section title="How we use it">
          <p style={p}>
            We use this information only to deliver the social media work the client has hired us for, which means
            publishing the posts, Reels and videos they have approved, replying to comments and messages through the
            automations they have agreed to, showing their performance in our reports, and keeping the service secure and
            working. We do not sell any of this information, we do not use it for advertising, and we do not share it with
            anyone outside Blizsocials except the platforms themselves and the service providers listed below.
          </p>
        </Section>

        <Section title="Instagram and Facebook data">
          <p style={p}>
            Instagram and Facebook accounts are connected through Meta&rsquo;s official Facebook Login. We access only the
            permissions the client or page owner approves, and we follow Meta&rsquo;s Platform Terms and Developer
            Policies. A client can remove our access at any time from their Facebook Business settings or their Instagram
            settings under Apps and Websites.
          </p>
        </Section>

        <Section title="YouTube and Google data">
          <p style={p}>
            When a client connects a YouTube channel, we ask Google for two permissions: permission to upload videos to the
            channel, and permission to view basic channel information (the channel name and ID) so we can show which
            channel is connected. We use these only to publish the videos the client has approved and to label the channel
            correctly in our tool.
          </p>
          <p style={p}>
            Blizsocials Automations&rsquo; use and transfer of information received from Google APIs to any other app will
            adhere to the{" "}
            <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer" style={{ color: BLACK, fontWeight: 600 }}>
              Google API Services User Data Policy
            </a>
            , including the Limited Use requirements. We do not use Google user data for advertising, we do not sell it, we
            do not allow people to read it except where needed for security, to comply with the law, or with the
            client&rsquo;s permission for a specific request, and we do not use it to train artificial intelligence or
            machine learning models.
          </p>
          <p style={p}>
            By connecting a YouTube channel, the client also agrees to the{" "}
            <a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer" style={{ color: BLACK, fontWeight: 600 }}>
              YouTube Terms of Service
            </a>{" "}
            and the{" "}
            <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" style={{ color: BLACK, fontWeight: 600 }}>
              Google Privacy Policy
            </a>
            . A client can remove our access at any time from{" "}
            <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer" style={{ color: BLACK, fontWeight: 600 }}>
              their Google account permissions page
            </a>
            .
          </p>
        </Section>

        <Section title="Where the data is kept">
          <p style={p}>
            The tool runs on trusted cloud providers that store and process data on our behalf: Vercel for the website and
            file storage, Northflank for the background service that publishes scheduled posts, and a managed PostgreSQL
            database. These providers may store data outside Nigeria, and they protect it with encryption in transit and at
            rest. Access tokens are encrypted again by us before they are saved, and only authorised Blizsocials team members
            can sign in to the tool.
          </p>
        </Section>

        <Section title="How long we keep it">
          <p style={p}>
            We keep a client&rsquo;s connected account details and tokens for as long as we manage that account. When a
            client stops working with us, removes our access, or asks us to delete their data, we disconnect the account and
            delete its tokens, scheduled posts, uploaded media, message records and saved statistics within 30 days, except
            where the law requires us to keep a record for longer.
          </p>
        </Section>

        <Section title="Your choices and rights">
          <p style={p}>
            Anyone whose data passes through the tool can ask us what we hold about them, ask us to correct it, or ask us to
            delete it. Clients can also withdraw our access at any time using the platform settings described above. We
            respect the rights given under the Nigeria Data Protection Act 2023 and, where they apply, other data protection
            laws such as the GDPR. Instructions for deleting Meta data are on our{" "}
            <a href="/data-deletion" style={{ color: BLACK, fontWeight: 600 }}>data deletion page</a>.
          </p>
        </Section>

        <Section title="Children">
          <p style={p}>The tool is a business tool for adults and is not meant for anyone under 18.</p>
        </Section>

        <Section title="Changes to this policy">
          <p style={p}>
            If we change how we handle data, we will update this page and the date at the top, and we will tell our clients
            directly when a change affects them.
          </p>
        </Section>

        <Section title="Contact us">
          <p style={p}>
            For any privacy question or request, email{" "}
            <a href="mailto:blizsocials@gmail.com" style={{ color: BLACK, fontWeight: 600 }}>blizsocials@gmail.com</a> or
            reach us through{" "}
            <a href={CONTACT_FORM} target="_blank" rel="noopener noreferrer" style={{ color: BLACK, fontWeight: 600 }}>
              our contact form
            </a>
            . We aim to reply within 7 days.
          </p>
        </Section>
      </article>
    </main>
  );
}
