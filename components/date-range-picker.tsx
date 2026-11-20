"use client";

/**
 * Blizsocials: dropdown calendar for picking a date range without reloading.
 * Click a start day, then an end day, then Apply.
 */

import { useState } from "react";

const DAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const nice = (s: string) => new Date(`${s}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export default function DateRangePicker({
  from,
  to,
  onApply,
}: {
  from: string;
  to: string;
  onApply: (from: string, to: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState<string | null>(from);
  const [end, setEnd] = useState<string | null>(to);
  const [month, setMonth] = useState(() => {
    const d = new Date(`${to}T12:00:00`);
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const todayIso = iso(new Date());

  function pick(day: string) {
    if (!start || end) {
      setStart(day);
      setEnd(null);
    } else if (day < start) {
      setEnd(start);
      setStart(day);
    } else {
      setEnd(day);
    }
  }

  function preset(days: number) {
    const base = Date.parse(`${todayIso}T12:00:00`);
    setStart(iso(new Date(base - (days - 1) * 86_400_000)));
    setEnd(todayIso);
  }

  const lead = (month.getDay() + 6) % 7;
  const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (string | null)[] = [...Array(lead).fill(null)];
  for (let i = 1; i <= count; i++) cells.push(iso(new Date(month.getFullYear(), month.getMonth(), i)));

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-sm font-semibold"
      >
        <span aria-hidden>📅</span>
        {nice(from)} to {nice(to)}
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-[300px] rounded-2xl border border-border bg-surface p-4 shadow-xl">
          <div className="mb-3 flex flex-wrap gap-2">
            {[7, 14, 30, 90].map((d) => (
              <button key={d} type="button" onClick={() => preset(d)} className="rounded-full border border-border px-3 py-1 text-xs font-semibold">
                Last {d} days
              </button>
            ))}
          </div>
          <div className="mb-2 flex items-center justify-between">
            <button type="button" aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="px-2 text-lg">‹</button>
            <span className="text-sm font-semibold">{month.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</span>
            <button type="button" aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="px-2 text-lg">›</button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs">
            {DAYS.map((d) => <span key={d} className="py-1 font-semibold text-zinc-500">{d}</span>)}
            {cells.map((day, i) => {
              if (!day) return <span key={`b${i}`} />;
              const future = day > todayIso;
              const edge = day === start || day === end;
              const inside = start && end && day > start && day < end;
              return (
                <button
                  key={day}
                  type="button"
                  disabled={future}
                  onClick={() => pick(day)}
                  className={`rounded-lg py-1.5 ${edge ? "bg-[#0E0E0E] font-bold text-[#FFD701]" : inside ? "bg-[#FFF6BF]" : "hover:bg-zinc-100"} ${future ? "opacity-30" : ""}`}
                >
                  {Number(day.slice(8))}
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-zinc-500">
            {start && end ? `${nice(start)} to ${nice(end)}` : start ? "Now pick the end date" : "Pick the start date"}
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="rounded-xl px-3 py-2 text-sm">Cancel</button>
            <button
              type="button"
              disabled={!start || !end}
              onClick={() => {
                if (start && end) onApply(start, end);
                setOpen(false);
              }}
              className="rounded-xl bg-[#0E0E0E] px-4 py-2 text-sm font-bold text-[#FFD701] disabled:opacity-40"
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
