import type { Metadata } from "next";
import BlizPublicShell, { Section, p, li, a, CONTACT_FORM } from "@/components/bliz-public-shell";

export const metadata: Metadata = {
  title: "Terms of Service · Blizsocials Automations",
  description: "The terms that apply when a business connects its social media accounts to Blizsocials Automations.",
};

export default function TermsPage() {
  return (
    <BlizPublicShell>
      <article style={{ maxWidth: 820, margin: "0 auto", padding: "40px 24px 80px", display: "flex", flexDirection: "column", gap: 32 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h1 style={{ fontSize: 34, fontWeight: 700, margin: 0, fontFamily: "var(--font-display)" }}>Terms of Service</h1>
          <p style={{ ...p, color: "#5A5A5A" }}>Last updated 21 November 2026</p>
          <p style={p}>
            These terms apply to Blizsocials Automations, the internal tool run by Blizsocials (265 Ikotun Idimu Road, Idimu,
            Lagos State, Nigeria), and to every business that connects a social media account to it through one of our connect
            links. They sit alongside the service agreement each client signs with Blizsocials, and if the two ever disagree,
            the signed agreement wins.
          </p>
        </div>

        <Section title="What the tool does">
          <p style={p}>
            The tool lets the Blizsocials team publish content, reply to comments and direct messages, and collect performance
            statistics on the accounts our clients ask us to manage. Only Blizsocials team members sign in to the tool; clients
            simply approve access to their own accounts.
          </p>
        </Section>

        <Section title="Connecting an account">
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            <li style={li}>You must own the account or be authorised by its owner to connect it.</li>
            <li style={li}>You sign in on the platform&rsquo;s own page, so we never see or keep your password.</li>
            <li style={li}>You choose which permissions to grant, and you can remove our access at any time from the platform&rsquo;s settings.</li>
            <li style={li}>Connect links are personal to your business and expire after 7 days. Please do not share them.</li>
          </ul>
        </Section>

        <Section title="Content and approvals">
          <p style={p}>
            We only publish content that has been agreed with you under your service agreement. You remain the owner of your
            content, brand and accounts, and you confirm that you have the rights to everything you give us to post. We will not
            post anything that breaks the law or the rules of the platform it is posted on.
          </p>
        </Section>

        <Section title="Platform rules">
          <p style={p}>
            Your accounts stay subject to the rules of each platform. By connecting, you also agree to the{" "}
            <a href="https://www.facebook.com/terms" target="_blank" rel="noopener noreferrer" style={a}>Meta Terms of Service</a>, the{" "}
            <a href="https://help.instagram.com/581066165581870" target="_blank" rel="noopener noreferrer" style={a}>Instagram Terms of Use</a>, and the{" "}
            <a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer" style={a}>YouTube Terms of Service</a>, together with the{" "}
            <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" style={a}>Google Privacy Policy</a>.
          </p>
        </Section>

        <Section title="Availability">
          <p style={p}>
            We work hard to keep the tool running smoothly, but it depends on the platforms&rsquo; own services. If a platform
            changes its rules, limits how often we can post, or has an outage, a scheduled post may be delayed, and when that
            happens we will let you know and publish it as soon as we can.
          </p>
        </Section>

        <Section title="Your data">
          <p style={p}>
            How we collect, use and protect your information is explained in our <a href="/privacy" style={a}>Privacy Policy</a>,
            and you can ask us to delete your data at any time by following our <a href="/data-deletion" style={a}>data deletion steps</a>.
          </p>
        </Section>

        <Section title="Ending access">
          <p style={p}>
            Either side can end the connection at any time. When you remove our access or your service with Blizsocials ends, we
            disconnect your accounts and delete the related data as set out in our Privacy Policy.
          </p>
        </Section>

        <Section title="Liability">
          <p style={p}>
            To the extent the law allows, Blizsocials is not responsible for losses caused by the platforms themselves, by
            changes to their services, or by content you supplied. Nothing in these terms limits any right you have under
            Nigerian law that cannot be limited.
          </p>
        </Section>

        <Section title="Governing law">
          <p style={p}>These terms are governed by the laws of the Federal Republic of Nigeria.</p>
        </Section>

        <Section title="Contact us">
          <p style={p}>
            Questions about these terms are welcome at <a href="mailto:blizsocials@gmail.com" style={a}>blizsocials@gmail.com</a> or
            through <a href={CONTACT_FORM} target="_blank" rel="noopener noreferrer" style={a}>our contact form</a>.
          </p>
        </Section>
      </article>
    </BlizPublicShell>
  );
}
