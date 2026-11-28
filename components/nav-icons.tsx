/** Small line icons for the app navigation (stroke uses currentColor). */
const paths: Record<string, string> = {
  results: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  reports: "M12 3v12M7 10l5 5 5-5M4 21h16",
  schedule: "M3 9h18M8 3v4M16 3v4M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z",
  inbox: "M21 12h-6l-2 3h-2l-2-3H3M5.5 5h13L21 12v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6z",
  automations: "M13 2L4 14h7l-1 8 9-12h-7z",
  logs: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  clients: "M9 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21c0-4 3-6 7-6s7 2 7 6M17 4a4 4 0 0 1 0 8M22 21c0-3-1.5-5-4-5.7",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15l1.3 2.3-2.1 2.1-2.3-1.3-1.3.6-.6 2.3h-3l-.6-2.3-1.3-.6-2.3 1.3-2.1-2.1L4.6 15 4 13.7l-2.3-.7v-3l2.3-.6.6-1.3-1.3-2.3 2.1-2.1 2.3 1.3 1.3-.6.6-2.3h3l.6 2.3 1.3.6 2.3-1.3 2.1 2.1-1.3 2.3.6 1.3 2.3.6v3l-2.3.6z",
  diagnostics: "M22 12h-4l-3 9L9 3l-3 9H2",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  refresh: "M21 12a9 9 0 0 1-15.5 6.3L3 16M3 12a9 9 0 0 1 15.5-6.3L21 8M21 3v5h-5M3 21v-5h5",
};

export function NavIcon({ name, size = 18 }: { name: keyof typeof paths | string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={name === "more" ? 3.5 : 2} strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0">
      <path d={paths[name] ?? paths.more} />
    </svg>
  );
}
