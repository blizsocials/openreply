"use client";

import { useState } from "react";

interface Created {
  url: string;
  monthLabel: string;
  expiresAt: string;
}

/**
 * Makes a link to one client's monthly report. Staff pick the month, copy the
 * link or send it on WhatsApp. The link needs no login and expires in 90 days.
 */
export default function ShareReport({
  accountId,
  username,
}: {
  accountId: string;
  username: string;
}) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState<"current" | "previous">("previous");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Created | null>(null);
  const [copied, setCopied] = useState(false);

  async function create() {
    setBusy(true);
    setError(null);
    setCreated(null);
    setCopied(false);
    try {
      const res = await fetch("/api/dashboard/report-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instagramAccountId: accountId, month }),
      });
      const json = await res.json();
      if (json.success) setCreated(json.data as Created);
      else setError(json.error ?? "The link could not be made. Try again.");
    } catch {
      setError("The link could not be made. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.url);
      setCopied(true);
    } catch {
      setError("Copying was blocked. Select the link and copy it by hand.");
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="min-h-11 rounded-xl border border-border bg-surface px-4 text-sm font-medium text-foreground hover:bg-surface-hover"
      >
        Share client report
      </button>
    );
  }

  const message = created
    ? `Hello! Here are the Instagram automation results for @${username}, ${created.monthLabel}: ${created.url}`
    : "";

  return (
    <div className="panel w-full space-y-3 p-4 sm:max-w-md" role="group" aria-label="Share client report">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-foreground">Report for @{username}</p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="min-h-11 min-w-11 text-sm text-muted hover:text-foreground"
          aria-label="Close share panel"
        >
          Close
        </button>
      </div>

      <fieldset>
        <legend className="mb-1 text-sm text-muted">Which month?</legend>
        <div className="flex gap-2">
          {(["previous", "current"] as const).map((m) => (
            <label
              key={m}
              className={`flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-xl border px-3 text-sm font-medium ${
                month === m ? "border-black bg-accent text-white" : "border-border bg-surface text-foreground"
              }`}
            >
              <input
                type="radio"
                name="report-month"
                value={m}
                checked={month === m}
                onChange={() => setMonth(m)}
                className="sr-only"
              />
              {m === "previous" ? "Last month" : "This month so far"}
            </label>
          ))}
        </div>
      </fieldset>

      <button
        type="button"
        onClick={create}
        disabled={busy}
        className="min-h-11 w-full rounded-xl px-4 text-sm font-semibold text-black disabled:opacity-60"
        style={{ background: "#FFD700", border: "1px solid #0E0E0E" }}
      >
        {busy ? "Making the link…" : "Make the link"}
      </button>

      {error && (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      )}

      {created && (
        <div className="space-y-2" aria-live="polite">
          <label className="block text-sm text-muted" htmlFor="client-report-url">
            {created.monthLabel} report. Works without a login until{" "}
            {new Date(created.expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}.
          </label>
          <input
            id="client-report-url"
            readOnly
            value={created.url}
            onFocus={(e) => e.currentTarget.select()}
            className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={copy}
              className="min-h-11 flex-1 rounded-xl bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-hover"
            >
              {copied ? "Copied" : "Copy link"}
            </button>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(message)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border border-border bg-surface px-4 text-sm font-medium text-foreground hover:bg-surface-hover"
            >
              Send on WhatsApp
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
