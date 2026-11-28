"use client";

/**
 * Dashboard building blocks.
 *
 * Every number sits next to what it means and how it moved. Every chart has a
 * plain-text summary for screen readers and a data table behind it, so the
 * page works without seeing colour or hovering.
 */

import Link from "next/link";
import { useState } from "react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  AttentionRow,
  AutomationRow,
  ClientRow,
  DailyPoint,
  Insights,
  Kpi,
  RatioKpi,
} from "./types";

const INK = "#0E0E0E";
const YELLOW = "#FFD700";
const GRID = "#E2E0D8";
const AXIS = "#5A5A5A";
const GREEN = "#15803d";
const RED = "#dc2626";

export function formatNumber(n: number): string {
  return n.toLocaleString("en-NG");
}

function shortDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export function timeAgo(iso: string | null): string {
  if (!iso) return "No activity yet";
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.round(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
}

/* ------------------------------------------------------------------ */
/* Panel frame                                                         */
/* ------------------------------------------------------------------ */

export function Panel({
  title,
  subtitle,
  action,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel p-4 sm:p-6 ${className}`}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted">
      {children}
    </p>
  );
}

/* ------------------------------------------------------------------ */
/* KPI cards                                                           */
/* ------------------------------------------------------------------ */

function Delta({
  change,
  goodWhenUp = true,
}: {
  change: number | null;
  goodWhenUp?: boolean;
}) {
  if (change === null) {
    return <span className="text-sm text-muted">New this period</span>;
  }
  if (change === 0) return <span className="text-sm text-muted">No change</span>;
  const up = change > 0;
  const good = up === goodWhenUp;
  return (
    <span className={`text-sm font-medium ${good ? "text-success" : "text-error"}`}>
      <span aria-hidden="true">{up ? "▲" : "▼"}</span>{" "}
      {Math.abs(change)}% {up ? "up" : "down"}
      <span className="font-normal text-muted"> vs last period</span>
    </span>
  );
}

function PointsDelta({ cur, prev, unit = "pts" }: { cur: number | null; prev: number | null; unit?: string }) {
  if (cur === null || prev === null) {
    return <span className="text-sm text-muted">Not enough data yet</span>;
  }
  const diff = Number((cur - prev).toFixed(1));
  if (diff === 0) return <span className="text-sm text-muted">No change</span>;
  const up = diff > 0;
  return (
    <span className={`text-sm font-medium ${up ? "text-success" : "text-error"}`}>
      <span aria-hidden="true">{up ? "▲" : "▼"}</span> {Math.abs(diff)} {unit}{" "}
      {up ? "up" : "down"}
      <span className="font-normal text-muted"> vs last period</span>
    </span>
  );
}

export function KpiCard({
  label,
  value,
  help,
  footer,
}: {
  label: string;
  value: string;
  help: string;
  footer: React.ReactNode;
}) {
  return (
    <div className="panel p-4 sm:p-5">
      <p className="text-sm font-medium text-muted">{label}</p>
      <p className="mt-1 text-3xl font-semibold tracking-tight text-foreground">{value}</p>
      <div className="mt-2">{footer}</div>
      <p className="mt-2 text-sm text-muted">{help}</p>
    </div>
  );
}

export function KpiRow({ kpis }: { kpis: Insights["kpis"] }) {
  const pct = (v: number | null) => (v === null ? "No sends yet" : `${v}%`);
  const countCard = (k: Kpi) => formatNumber(k.value);
  const ratio = (k: RatioKpi) => pct(k.value);
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
      <KpiCard
        label="DMs delivered"
        value={countCard(kpis.sent)}
        help="Messages people received after commenting."
        footer={<Delta change={kpis.sent.change} />}
      />
      <KpiCard
        label="Link clicks"
        value={countCard(kpis.clicks)}
        help="People who tapped the link inside the DM."
        footer={<Delta change={kpis.clicks.change} />}
      />
      <KpiCard
        label="Click rate"
        value={`${kpis.ctr.value ?? 0}%`}
        help="Clicks divided by DMs delivered."
        footer={<PointsDelta cur={kpis.ctr.value} prev={kpis.ctr.previous} />}
      />
      <KpiCard
        label="Delivery rate"
        value={ratio(kpis.delivery)}
        help={`${formatNumber(kpis.failed.value)} failed, ${formatNumber(kpis.skipped.value)} skipped.`}
        footer={<PointsDelta cur={kpis.delivery.value} prev={kpis.delivery.previous} />}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Trend chart                                                         */
/* ------------------------------------------------------------------ */

export function TrendChart({ daily }: { daily: DailyPoint[] }) {
  const total = daily.reduce((n, d) => n + d.sent, 0);
  const totalClicks = daily.reduce((n, d) => n + d.clicks, 0);
  const busiest = daily.reduce((b, d) => (d.sent > b.sent ? d : b), daily[0]);
  const summary =
    total === 0
      ? "No DMs were delivered in this period."
      : `${formatNumber(total)} DMs and ${formatNumber(totalClicks)} clicks. Busiest day: ${shortDate(busiest.date)} with ${busiest.sent}.`;
  const [showTable, setShowTable] = useState(false);

  return (
    <div>
      <p className="mb-3 text-sm text-muted">{summary}</p>
      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-foreground" aria-hidden="true">
        <span className="inline-flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm border border-black" style={{ background: YELLOW }} />
          DMs delivered
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-0.5 w-4" style={{ background: GREEN }} />
          Link clicks
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-0.5 w-4" style={{ background: RED }} />
          Failed
        </span>
      </div>
      <div className="h-64 w-full" role="img" aria-label={summary}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={daily} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={shortDate}
              tick={{ fill: AXIS, fontSize: 12 }}
              tickLine={false}
              axisLine={{ stroke: GRID }}
              minTickGap={24}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fill: AXIS, fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              width={44}
            />
            <Tooltip
              labelFormatter={(label) => shortDate(String(label))}
              contentStyle={{ borderRadius: 12, border: `1px solid ${GRID}`, fontSize: 13 }}
            />
            <Area
              type="monotone"
              dataKey="sent"
              name="DMs delivered"
              stroke={INK}
              strokeWidth={2}
              fill={YELLOW}
              fillOpacity={0.55}
            />
            <Line
              type="monotone"
              dataKey="clicks"
              name="Link clicks"
              stroke={GREEN}
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="failed"
              name="Failed"
              stroke={RED}
              strokeWidth={2}
              strokeDasharray="4 3"
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <button
        type="button"
        onClick={() => setShowTable((v) => !v)}
        aria-expanded={showTable}
        className="mt-3 text-sm font-medium text-foreground underline underline-offset-4"
      >
        {showTable ? "Hide the numbers" : "Show the numbers"}
      </button>
      {showTable && (
        <div className="mt-3 max-h-64 overflow-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <caption className="sr-only">Daily DMs delivered, clicks and failures</caption>
            <thead className="sticky top-0 bg-surface text-left text-muted">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">Day</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Delivered</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Clicks</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Failed</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Skipped</th>
              </tr>
            </thead>
            <tbody>
              {[...daily].reverse().map((d) => (
                <tr key={d.date} className="border-t border-border">
                  <th scope="row" className="px-3 py-2 text-left font-medium">{shortDate(d.date)}</th>
                  <td className="px-3 py-2 text-right">{d.sent}</td>
                  <td className="px-3 py-2 text-right">{d.clicks}</td>
                  <td className="px-3 py-2 text-right">{d.failed}</td>
                  <td className="px-3 py-2 text-right">{d.skipped}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Best time of day                                                    */
/* ------------------------------------------------------------------ */

function hourLabel(h: number): string {
  const suffix = h < 12 ? "am" : "pm";
  const twelve = h % 12 === 0 ? 12 : h % 12;
  return `${twelve}${suffix}`;
}

export function HoursChart({ hours }: { hours: number[] }) {
  const total = hours.reduce((a, b) => a + b, 0);
  if (total === 0) return <Empty>Once DMs go out, you will see the hours your audience comments most.</Empty>;
  const peak = hours.indexOf(Math.max(...hours));
  const data = hours.map((count, hour) => ({ hour, count }));
  const summary = `Most DMs go out around ${hourLabel(peak)}, Lagos time.`;
  return (
    <div>
      <p className="mb-3 text-sm text-muted">{summary} Post just before this window to catch the most comments.</p>
      <div className="h-44 w-full" role="img" aria-label={summary}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis
              dataKey="hour"
              tickFormatter={hourLabel}
              tick={{ fill: AXIS, fontSize: 12 }}
              tickLine={false}
              axisLine={{ stroke: GRID }}
              interval={3}
            />
            <YAxis allowDecimals={false} tick={{ fill: AXIS, fontSize: 12 }} tickLine={false} axisLine={false} />
            <Tooltip
              labelFormatter={(h) => hourLabel(Number(h))}
              contentStyle={{ borderRadius: 12, border: `1px solid ${GRID}`, fontSize: 13 }}
            />
            <Bar dataKey="count" name="DMs delivered" fill={INK} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Funnel                                                              */
/* ------------------------------------------------------------------ */

export function Funnel({ funnel }: { funnel: Insights["funnel"] }) {
  const steps = [
    { label: "Comments that triggered an automation", value: funnel.triggered },
    { label: "DMs delivered", value: funnel.sent },
    { label: "People who clicked the link", value: funnel.clicked },
  ];
  if (funnel.triggered === 0) {
    return <Empty>The funnel fills in as soon as the first comment triggers an automation.</Empty>;
  }
  const top = Math.max(funnel.triggered, 1);
  return (
    <ol className="space-y-4">
      {steps.map((step, i) => {
        const width = Math.max(2, Math.min(100, (step.value / top) * 100));
        const rate =
          i === 0
            ? null
            : steps[i - 1].value > 0
              ? Math.min(100, Math.round((step.value / steps[i - 1].value) * 100))
              : 0;
        return (
          <li key={step.label}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
              <span className="text-foreground">{step.label}</span>
              <span className="shrink-0 font-semibold text-foreground">
                {formatNumber(step.value)}
                {rate !== null && (
                  <span className="ml-2 font-normal text-muted">{rate}% of the step before</span>
                )}
              </span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-surface-hover" aria-hidden="true">
              <div
                className="h-full rounded-full border border-black"
                style={{ width: `${width}%`, background: i === 2 ? INK : YELLOW }}
              />
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/* ------------------------------------------------------------------ */
/* Needs attention                                                     */
/* ------------------------------------------------------------------ */

const SEVERITY_STYLE: Record<AttentionRow["severity"], { label: string; cls: string }> = {
  high: { label: "Fix now", cls: "bg-red-50 text-red-700 border-red-200" },
  medium: { label: "Soon", cls: "bg-amber-50 text-amber-800 border-amber-200" },
  low: { label: "Suggestion", cls: "bg-zinc-100 text-zinc-700 border-zinc-200" },
};

export function AttentionPanel({ items }: { items: AttentionRow[] }) {
  if (items.length === 0) {
    return (
      <p className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-4 text-sm text-green-900">
        <span aria-hidden="true" className="text-lg">✓</span>
        Everything is healthy. Every client is connected and receiving comments.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-border">
      {items.slice(0, 6).map((item) => (
        <li key={item.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">{item.client}</p>
            <p className="text-sm text-muted">{item.message}</p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${SEVERITY_STYLE[item.severity].cls}`}>
              {SEVERITY_STYLE[item.severity].label}
            </span>
            <Link
              href={item.href}
              className="inline-flex min-h-11 items-center rounded-lg border border-border px-3 text-sm font-medium text-foreground hover:bg-surface-hover"
            >
              Open
            </Link>
          </div>
        </li>
      ))}
      {items.length > 6 && (
        <li className="pt-3 text-sm text-muted">And {items.length - 6} more. Pick one client above to see its own list.</li>
      )}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* Clients table                                                       */
/* ------------------------------------------------------------------ */

const HEALTH: Record<ClientRow["health"], { label: string; dot: string }> = {
  ok: { label: "Healthy", dot: "bg-green-600" },
  attention: { label: "Needs attention", dot: "bg-red-600" },
  idle: { label: "Quiet", dot: "bg-zinc-400" },
};

export function ClientsTable({
  clients,
  onSelect,
}: {
  clients: ClientRow[];
  onSelect: (id: string) => void;
}) {
  if (clients.length === 0) {
    return <Empty>No clients are connected yet. Use Add or refresh clients in the sidebar.</Empty>;
  }
  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <table className="w-full min-w-[640px] text-sm">
        <caption className="sr-only">Results for each client in this period</caption>
        <thead className="text-left text-muted">
          <tr className="border-b border-border">
            <th scope="col" className="py-2 pr-3 font-medium">Client</th>
            <th scope="col" className="px-3 py-2 font-medium">Status</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Automations on</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">DMs</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Clicks</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Click rate</th>
            <th scope="col" className="py-2 pl-3 text-right font-medium">Last DM</th>
          </tr>
        </thead>
        <tbody>
          {clients.map((c) => (
            <tr key={c.id} className="border-b border-border last:border-0">
              <th scope="row" className="py-2 pr-3 text-left font-medium">
                <button
                  type="button"
                  onClick={() => onSelect(c.id)}
                  className="min-h-11 text-left text-foreground underline-offset-4 hover:underline"
                >
                  @{c.username}
                </button>
              </th>
              <td className="px-3 py-2">
                <span className="inline-flex items-center gap-2 whitespace-nowrap">
                  <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${HEALTH[c.health].dot}`} />
                  {HEALTH[c.health].label}
                </span>
              </td>
              <td className="px-3 py-2 text-right">{c.activeAutomations} of {c.totalAutomations}</td>
              <td className="px-3 py-2 text-right font-medium">{formatNumber(c.sent)}</td>
              <td className="px-3 py-2 text-right">{formatNumber(c.clicks)}</td>
              <td className="px-3 py-2 text-right">{c.ctr}%</td>
              <td className="whitespace-nowrap py-2 pl-3 text-right text-muted">{timeAgo(c.lastActivityAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Automations + keywords                                              */
/* ------------------------------------------------------------------ */

export function AutomationsTable({ rows }: { rows: AutomationRow[] }) {
  if (rows.length === 0) {
    return (
      <Empty>
        No automations yet.{" "}
        <Link href="/campaigns/new" className="font-medium text-foreground underline underline-offset-4">
          Create the first one
        </Link>
        .
      </Empty>
    );
  }
  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <table className="w-full min-w-[520px] text-sm">
        <caption className="sr-only">Best performing automations in this period</caption>
        <thead className="text-left text-muted">
          <tr className="border-b border-border">
            <th scope="col" className="py-2 pr-3 font-medium">Automation</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">DMs</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Clicks</th>
            <th scope="col" className="py-2 pl-3 text-right font-medium">Click rate</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => (
            <tr key={a.id} className="border-b border-border last:border-0">
              <th scope="row" className="py-2 pr-3 text-left font-medium">
                <Link href={`/campaigns/${a.id}`} className="block min-h-11 content-center hover:underline">
                  <span className="block text-foreground">{a.name}</span>
                  <span className="block text-xs font-normal text-muted">
                    @{a.client}{a.isActive ? "" : " · Paused"}
                  </span>
                </Link>
              </th>
              <td className="px-3 py-2 text-right font-medium">{formatNumber(a.sent)}</td>
              <td className="px-3 py-2 text-right">{formatNumber(a.clicks)}</td>
              <td className="py-2 pl-3 text-right">{a.ctr}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function KeywordList({ keywords }: { keywords: Insights["keywords"] }) {
  if (keywords.length === 0) {
    return <Empty>Keywords people comment will show here, so you can see what your audience asks for.</Empty>;
  }
  const max = Math.max(...keywords.map((k) => k.count), 1);
  return (
    <ul className="space-y-3">
      {keywords.map((k) => (
        <li key={k.keyword}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate font-medium text-foreground">{k.keyword}</span>
            <span className="shrink-0 text-muted">{formatNumber(k.count)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-hover" aria-hidden="true">
            <div className="h-full rounded-full" style={{ width: `${(k.count / max) * 100}%`, background: INK }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* First-run checklist                                                 */
/* ------------------------------------------------------------------ */

export function SetupChecklist({ setup }: { setup: Insights["setup"] }) {
  const steps = [
    {
      done: setup.accountsConnected > 0,
      title: "Connect a client's Instagram",
      body: "Use Add or refresh clients in the sidebar. You sign in once with Facebook.",
      href: "/clients",
      cta: "Open Clients",
    },
    {
      done: setup.webhookReady,
      title: "Make sure comments are arriving",
      body: "Diagnostics tells you in plain words whether Instagram is sending comments to the tool.",
      href: "/diagnostics",
      cta: "Run the check",
    },
    {
      done: setup.hasAutomation,
      title: "Create the first automation",
      body: "Pick a post, choose the keyword, write the DM. Templates are there to start from.",
      href: "/campaigns/new",
      cta: "Create automation",
    },
    {
      done: setup.hasActiveAutomation,
      title: "Switch it on",
      body: "An automation only replies while it is active.",
      href: "/campaigns",
      cta: "See automations",
    },
    {
      done: setup.hasSent,
      title: "Send a test comment",
      body: "Comment the keyword from a second account. The dashboard fills in right after the DM arrives.",
      href: "/logs",
      cta: "Watch the DM logs",
    },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  if (doneCount === steps.length) return null;
  const next = steps.find((s) => !s.done)!;
  return (
    <Panel
      title="Get your first automation live"
      subtitle={`${doneCount} of ${steps.length} steps done`}
    >
      <div
        className="mb-4 h-2 overflow-hidden rounded-full bg-surface-hover"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={steps.length}
        aria-valuenow={doneCount}
        aria-label="Setup progress"
      >
        <div className="h-full rounded-full" style={{ width: `${(doneCount / steps.length) * 100}%`, background: YELLOW, borderRight: `2px solid ${INK}` }} />
      </div>
      <ol className="space-y-3">
        {steps.map((s) => (
          <li key={s.title} className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${
                s.done ? "border-green-700 bg-green-700 text-white" : "border-border bg-surface text-muted"
              }`}
            >
              {s.done ? "✓" : ""}
            </span>
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-semibold ${s.done ? "text-muted line-through" : "text-foreground"}`}>
                {s.title}
                <span className="sr-only">{s.done ? " (done)" : " (not done yet)"}</span>
              </p>
              {!s.done && <p className="text-sm text-muted">{s.body}</p>}
            </div>
          </li>
        ))}
      </ol>
      <Link
        href={next.href}
        className="mt-5 inline-flex min-h-11 items-center rounded-lg px-5 text-sm font-semibold text-black"
        style={{ background: YELLOW, border: `1px solid ${INK}` }}
      >
        {next.cta}
      </Link>
    </Panel>
  );
}
