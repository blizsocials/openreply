import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PrintButton from "@/components/dashboard/print-button";
import {
  AutomationsTable,
  Funnel,
  HoursChart,
  KeywordList,
  KpiRow,
  Panel,
  TrendChart,
} from "@/components/dashboard/panels";
import { readClientReportToken } from "@/lib/dashboard/client-link";
import { getClientMonthReport } from "@/lib/dashboard/client-report";

type Props = { params: Promise<{ token: string }> };

// Always read fresh numbers, and never let search engines keep a client's report.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Monthly results | Blizsocials",
  robots: { index: false, follow: false },
};

export default async function ClientReportPage({ params }: Props) {
  const { token } = await params;
  const claim = readClientReportToken(token);
  if (!claim) notFound();
  const report = await getClientMonthReport(claim.a, claim.m);
  if (!report) notFound();

  const generated = report.generatedAt.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Africa/Lagos",
  });

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <header style={{ background: "#0E0E0E" }} className="text-white">
        <div className="mx-auto flex max-w-5xl flex-col gap-4 px-5 py-8 sm:flex-row sm:items-end sm:justify-between sm:px-8">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide" style={{ color: "#FFD700" }}>
              Blizsocials · Monthly results
            </p>
            <h1 className="mt-2 text-3xl font-bold sm:text-4xl">@{report.client.username}</h1>
            <p className="mt-1 text-base text-zinc-300">
              {report.monthLabel}
              {report.inProgress ? " (month in progress)" : ""}
            </p>
          </div>
          <PrintButton />
        </div>
      </header>

      <div className="mx-auto max-w-5xl space-y-6 px-5 py-8 sm:space-y-8 sm:px-8">
        <section className="panel p-5 sm:p-6">
          <h2 className="text-base font-semibold">The month in one minute</h2>
          <p className="mt-2 text-base leading-7 text-foreground">{report.summary}</p>
        </section>

        <KpiRow kpis={report.kpis} />

        <Panel title="Results over time" subtitle={`${report.monthLabel}, in Lagos time`}>
          <TrendChart daily={report.daily} />
        </Panel>

        <div className="grid gap-6 sm:gap-8 lg:grid-cols-2">
          <Panel title="From comment to click" subtitle="Where people drop off">
            <Funnel funnel={report.funnel} />
          </Panel>
          <Panel title="When your audience comments">
            <HoursChart hours={report.hours} />
          </Panel>
        </div>

        <div className="grid gap-6 sm:gap-8 lg:grid-cols-5">
          <Panel title="What worked best" className="lg:col-span-3">
            <AutomationsTable rows={report.automations} linkable={false} />
          </Panel>
          <Panel title="Words people comment" className="lg:col-span-2">
            <KeywordList keywords={report.keywords} />
          </Panel>
        </div>

        <footer className="border-t border-border pt-6 text-sm text-muted">
          <p>
            Prepared by Blizsocials on {generated}. Counts cover people who commented on your posts and the DMs they received. No names or messages are shown here.
          </p>
          <p className="mt-3 italic">
            Seest thou a man diligent in his business? he shall stand before kings. Proverbs 22:29
          </p>
        </footer>
      </div>
    </main>
  );
}
