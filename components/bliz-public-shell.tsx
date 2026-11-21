import Link from "next/link";

export const BLACK = "#0E0E0E";
export const YELLOW = "#FFD701";
export const CONTACT_FORM =
  "https://docs.google.com/forms/d/e/1FAIpQLScirZDGrKxPZ5nnHC6y1qzBSxX4L18PcvObgEsF1oKl2SdptQ/viewform";
export const p = { margin: 0, lineHeight: 1.7, color: "#2E2E2E" } as const;
export const li = { lineHeight: 1.7, color: "#2E2E2E", marginBottom: 6 } as const;
export const a = { color: BLACK, fontWeight: 600 } as const;

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, fontFamily: "var(--font-display)" }}>{title}</h2>
      {children}
    </section>
  );
}

/** Blizsocials-branded frame for public pages (home, terms, data deletion). */
export default function BlizPublicShell({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <main style={{ minHeight: "100dvh", background: "#FAF9F5", color: BLACK, display: "flex", flexDirection: "column" }}>
      <header style={{ background: BLACK, padding: "20px 24px" }}>
        <div style={{ maxWidth: wide ? 1040 : 820, margin: "0 auto", display: "flex", alignItems: "center", gap: 12 }}>
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: 12, textDecoration: "none" }}>
            <span style={{ width: 36, height: 36, borderRadius: 8, background: YELLOW, color: BLACK, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 18 }}>b</span>
            <span style={{ color: "#fff", fontWeight: 600, fontFamily: "var(--font-display)" }}>Blizsocials Automations</span>
          </Link>
          <Link href="/login" style={{ marginLeft: "auto", background: YELLOW, color: BLACK, borderRadius: 10, padding: "10px 16px", fontWeight: 700, fontSize: 14, textDecoration: "none" }}>
            Team sign in
          </Link>
        </div>
      </header>
      <div style={{ flex: 1 }}>{children}</div>
      <footer style={{ borderTop: "1px solid #E2E0D8", padding: "24px" }}>
        <div style={{ maxWidth: wide ? 1040 : 820, margin: "0 auto", display: "flex", flexWrap: "wrap", gap: 16, fontSize: 13, color: "#5A5A5A" }}>
          <span>© {new Date().getFullYear()} Blizsocials, 265 Ikotun Idimu Road, Idimu, Lagos State, Nigeria</span>
          <span style={{ marginLeft: "auto", display: "flex", gap: 16 }}>
            <Link href="/privacy" style={{ color: "#5A5A5A" }}>Privacy Policy</Link>
            <Link href="/terms" style={{ color: "#5A5A5A" }}>Terms of Service</Link>
            <Link href="/data-deletion" style={{ color: "#5A5A5A" }}>Data deletion</Link>
          </span>
        </div>
      </footer>
    </main>
  );
}
