"use client";

/**
 * Dashboard
 *
 * Answers three questions in this order:
 *   1. Is anything broken? (needs attention)
 *   2. How are the automations doing? (results against the last period)
 *   3. Which client or automation is behind it? (breakdowns)
 *
 * Staff read it to run the day; the print and CSV buttons turn the same view
 * into something a client can be sent.
 */

import { useEffect, useState } from "react";
import AccountSelect from "@/components/account-select";
import {
  AttentionPanel,
  AutomationsTable,
  ClientsTable,
  Funnel,
  HoursChart,
  KeywordList,
  KpiRow,
  Panel,
  SetupChecklist,
  TrendChart,
} from "@/components/dashboard/panels";
import type { Insights } from "@/components/dashboard/types";
import { writeClient } from "@/lib/client-selection";

const RANGES = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
] as const;

function csvCell(value: string | number | null): string {
  const text = value === null ? "" : String(value);
  // Spreadsheets run text that starts with these as a formula.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function buildCsv(data: Insights): string {
  const rows: (string | number | null)[][] = [
    ["Blizsocials automation results"],
    ["Period start", data.from.slice(0, 10), "Period end", data.to.slice(0, 10)],
    [],
    ["Daily results"],
    ["Day", "DMs delivered", "Link clicks", "Failed", "Skipped"],
    ...data.daily.map((d) => [d.date, d.sent, d.clicks, d.failed, d.skipped]),
    [],
    ["Clients"],
    ["Client", "Automations on", "Automations total", "DMs delivered", "Failed", "Clicks", "Click rate %"],
    ...data.clients.map((c) => [`@${c.username}`, c.activeAutomations, c.totalAutomations, c.sent, c.failed, c.clicks, c.ctr]),
    [],
    ["Automations"],
    ["Automation", "Client", "DMs delivered", "Failed", "Clicks", "Click rate %"],
    ...data.automations.map((a) => [a.name, `@${a.client}`, a.sent, a.failed, a.clicks, a.ctr]),
  ];
  return rows.map((r) => r.map(csvCell).join(",")).join("\n");
}

function downloadCsv(data: Insights) {
  const blob = new Blob([`﻿${buildCsv(data)}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `blizsocials-results-${data.to.slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function Skeleton() {
  return (
    <div className="space-y-6" role="status" aria-live="polite">
      <span className="sr-only">Loading your results</span>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="panel h-36 animate-pulse p-5">
            <div className="h-4 w-24 rounded bg-surface-hover" />
            <div className="mt-3 h-8 w-20 rounded bg-surface-hover" />
            <div className="mt-4 h-4 w-32 rounded bg-surface-hover" />
          </div>
        ))}
      </div>
      <div className="panel h-80 animate-pulse" />
    </div>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState<Insights | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<7 | 30 | 90>(30);
  const [accountId, setAccountId] = useState("all");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ range: String(range) });
    if (accountId !== "all") params.set("instagramAccountId", accountId);
    fetch(`/api/dashboard/insights?${params}`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (json.success) {
          setData(json.data as Insights);
          setError(false);
        } else {
          setError(true);
        }
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range, accountId, attempt]);

  function changeRange(next: 7 | 30 | 90) {
    setLoading(true);
    setRange(next);
  }

  function changeClient(id: string) {
    setLoading(true);
    setAccountId(id);
  }

  function retry() {
    setError(false);
    setLoading(true);
    setAttempt((n) => n + 1);
  }

  function pickClient(id: string) {
    writeClient(id);
    changeClient(id);
  }

  const single = accountId !== "all";
  const periodLabel = RANGES.find((r) => r.days === range)?.label ?? "";
  const clientLabel = data && single
    ? `@${data.accounts.find((a) => a.id === accountId)?.username ?? ""}`
    : "All clients";

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Print-only heading, so a saved PDF says what it is. */}
      <div className="hidden print:block">
        <h1 className="text-2xl font-bold">Blizsocials automation results</h1>
        <p className="text-sm">
          {clientLabel} · last {periodLabel}
        </p>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-foreground sm:text-3xl">Results</h1>
          <p className="mt-1 text-sm text-muted">
            What your automations did for {single ? clientLabel : "every client"}, compared with the period before.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <div role="group" aria-label="Time period" className="inline-flex overflow-hidden rounded-xl border border-border bg-surface">
            {RANGES.map((r) => {
              const active = r.days === range;
              return (
                <button
                  key={r.days}
                  type="button"
                  aria-pressed={active}
                  onClick={() => changeRange(r.days)}
                  className={`min-h-11 flex-1 px-4 text-sm font-medium sm:flex-none ${
                    active ? "bg-accent text-white" : "text-foreground hover:bg-surface-hover"
                  }`}
                >
                  {r.label}
                </button>
              );
            })}
          </div>
          {data && data.accounts.length > 1 && (
            <AccountSelect
              accounts={data.accounts.map((a) => ({ id: a.id, username: a.username, name: a.name, instagramId: "" }))}
              value={accountId}
              onChange={changeClient}
              label="Client"
            />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!data}
              onClick={() => data && downloadCsv(data)}
              className="min-h-11 rounded-xl border border-border bg-surface px-4 text-sm font-medium text-foreground hover:bg-surface-hover disabled:opacity-50"
            >
              Download CSV
            </button>
            <button
              type="button"
              disabled={!data}
              onClick={() => window.print()}
              className="min-h-11 rounded-xl px-4 text-sm font-semibold text-black disabled:opacity-50"
              style={{ background: "#FFD700", border: "1px solid #0E0E0E" }}
            >
              Print or save as PDF
            </button>
          </div>
        </div>
      </div>

      {loading && !data && <Skeleton />}

      {error && (
        <div role="alert" className="panel flex flex-col items-start gap-3 p-6">
          <p className="font-semibold text-foreground">The results could not be loaded.</p>
          <p className="text-sm text-muted">Check your connection, then try again. Nothing was lost.</p>
          <button
            type="button"
            onClick={retry}
            className="min-h-11 rounded-xl bg-accent px-5 text-sm font-semibold text-white hover:bg-accent-hover"
          >
            Try again
          </button>
        </div>
      )}

      {data && (
        <div className={`space-y-6 sm:space-y-8 ${loading ? "opacity-60" : ""}`} aria-busy={loading}>
          <SetupChecklist setup={data.setup} />

          <Panel
            title="Needs your attention"
            subtitle={data.attention.length ? `${data.attention.length} to look at, most urgent first` : undefined}
          >
            <AttentionPanel items={data.attention} />
          </Panel>

          <KpiRow kpis={data.kpis} />

          <Panel title="Results over time" subtitle={`Last ${periodLabel}, in Lagos time`}>
            <TrendChart daily={data.daily} />
          </Panel>

          <div className="grid gap-6 sm:gap-8 lg:grid-cols-2">
            <Panel title="From comment to click" subtitle="Where people drop off">
              <Funnel funnel={data.funnel} />
            </Panel>
            <Panel title="When your audience comments">
              <HoursChart hours={data.hours} />
            </Panel>
          </div>

          {!single && (
            <Panel title="Every client at a glance" subtitle="Tap a client to focus the whole page on them">
              <ClientsTable clients={data.clients} onSelect={pickClient} />
            </Panel>
          )}

          <div className="grid gap-6 sm:gap-8 lg:grid-cols-5">
            <Panel title="Best automations" className="lg:col-span-3">
              <AutomationsTable rows={data.automations} />
            </Panel>
            <Panel title="Words people comment" className="lg:col-span-2">
              <KeywordList keywords={data.keywords} />
            </Panel>
          </div>

          {data.truncated && (
            <p className="text-sm text-muted">
              This period has a very large number of events, so the oldest ones are left out. Pick a shorter period for exact numbers.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
