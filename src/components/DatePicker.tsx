"use client";

import { useEffect, useRef, useState } from "react";

/** A booked span for the selected car, as YYYY-MM-DD strings, half-open. */
export interface BookedSpan {
  start: string;
  end: string;
  renterName: string;
}

interface Props {
  label: string;
  value: string; // YYYY-MM-DD
  min: string; // YYYY-MM-DD
  onChange: (value: string) => void;
  booked: BookedSpan[];
}

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function iso(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function pretty(value: string): string {
  const d = new Date(`${value}T00:00:00.000Z`);
  return d.toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Custom calendar picker. Days already booked for the selected car are
 * drawn in red with a strike-through; they stay selectable on purpose so
 * the server-side conflict check can be demonstrated.
 */
export function DatePicker({ label, value, min, onChange, booked }: Props) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => {
    const d = new Date(`${value || min}T00:00:00.000Z`);
    return { y: d.getUTCFullYear(), m: d.getUTCMonth() };
  });
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const first = new Date(Date.UTC(view.y, view.m, 1));
  const daysInMonth = new Date(Date.UTC(view.y, view.m + 1, 0)).getUTCDate();
  const leadingBlanks = (first.getUTCDay() + 6) % 7; // Monday-first
  const cells: (number | null)[] = [
    ...Array<null>(leadingBlanks).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const isBooked = (day: string) =>
    booked.find((b) => b.start <= day && day < b.end);

  const monthLabel = first.toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  });

  return (
    <div ref={ref} className="relative grid gap-1 text-sm">
      <span className="font-medium text-zinc-700 dark:text-zinc-300">{label}</span>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-between rounded-md border border-zinc-300 bg-white px-3 py-2 text-left text-sm dark:border-zinc-700 dark:bg-zinc-950"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span>{value ? pretty(value) : "Pick a date"}</span>
        <span aria-hidden className="text-zinc-400">
          📅
        </span>
      </button>

      {open ? (
        <div
          role="dialog"
          className="absolute left-0 top-full z-20 mt-1 w-72 rounded-lg border border-zinc-200 bg-white p-3 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
        >
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setView((v) => (v.m === 0 ? { y: v.y - 1, m: 11 } : { y: v.y, m: v.m - 1 }))}
              className="rounded px-2 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              aria-label="Previous month"
            >
              ‹
            </button>
            <span className="font-medium">{monthLabel}</span>
            <button
              type="button"
              onClick={() => setView((v) => (v.m === 11 ? { y: v.y + 1, m: 0 } : { y: v.y, m: v.m + 1 }))}
              className="rounded px-2 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              aria-label="Next month"
            >
              ›
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-zinc-500">
            {WEEKDAYS.map((w) => (
              <div key={w}>{w}</div>
            ))}
          </div>

          <div className="mt-1 grid grid-cols-7 gap-1">
            {cells.map((day, i) => {
              if (day === null) return <div key={`blank-${i}`} />;
              const dayIso = iso(view.y, view.m, day);
              const past = dayIso < min;
              const selected = dayIso === value;
              const hit = isBooked(dayIso);
              const cls = [
                "h-8 rounded text-sm",
                past
                  ? "cursor-not-allowed text-zinc-300 dark:text-zinc-600"
                  : "hover:bg-zinc-100 dark:hover:bg-zinc-800",
                selected ? "bg-zinc-900 text-white hover:bg-zinc-900 dark:bg-zinc-100 dark:text-zinc-900" : "",
                hit && !selected ? "text-red-600 line-through dark:text-red-400" : "",
              ].join(" ");
              return (
                <button
                  key={dayIso}
                  type="button"
                  disabled={past}
                  onClick={() => {
                    onChange(dayIso);
                    setOpen(false);
                  }}
                  className={cls}
                  title={hit ? `Booked: ${hit.renterName}` : dayIso}
                >
                  {day}
                </button>
              );
            })}
          </div>

          <div className="mt-2 flex items-center gap-3 text-[11px] text-zinc-500">
            <span className="text-red-600 line-through dark:text-red-400">12</span> booked for this car
          </div>
        </div>
      ) : null}
    </div>
  );
}

const SLOTS = Array.from({ length: 33 }, (_, i) => {
  const mins = 6 * 60 + i * 30; // 06:00 .. 22:00
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
});

interface TimeProps {
  label: string;
  value: string; // HH:mm
  onChange: (value: string) => void;
}

/** Half-hour slot picker, 06:00 to 22:00. */
export function TimePicker({ label, value, onChange }: TimeProps) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="font-medium text-zinc-700 dark:text-zinc-300">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
      >
        {SLOTS.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
    </label>
  );
}
