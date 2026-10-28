/**
 * Core availability logic for fleet bookings.
 *
 * Bookings are modelled as half-open date ranges [start, end):
 * a rental that ends on the 15th frees the car for a rental starting on the 15th.
 *
 * Two ranges overlap when:   existingStart < newEnd  AND  existingEnd > newStart
 */

export interface DateRange {
  startDate: Date;
  endDate: Date;
}

export interface ExistingBooking extends DateRange {
  id: string;
  renterName: string;
}

export type ValidationError =
  | { code: "INVALID_DATE"; message: string }
  | { code: "END_BEFORE_START"; message: string }
  | { code: "IN_THE_PAST"; message: string };

/** Pure overlap predicate for half-open ranges. */
export function rangesOverlap(a: DateRange, b: DateRange): boolean {
  return a.startDate < b.endDate && a.endDate > b.startDate;
}

/** Returns every existing booking that clashes with the requested range. */
export function findConflicts<T extends DateRange>(
  requested: DateRange,
  existing: T[],
): T[] {
  return existing.filter((b) => rangesOverlap(requested, b));
}

/**
 * Parses a `YYYY-MM-DD` string as a UTC calendar day.
 * Returns null for anything that is not a real date.
 */
export function parseDateOnly(value: unknown): Date | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  // Reject e.g. 2026-02-31, which JS would silently roll into March.
  if (date.toISOString().slice(0, 10) !== value) return null;
  return date;
}

/** Parses "HH:mm" (24h). Returns null for anything else. */
export function parseTime(value: unknown): { h: number; m: number } | null {
  if (typeof value !== "string" || !/^\d{2}:\d{2}$/.test(value)) return null;
  const h = Number(value.slice(0, 2));
  const m = Number(value.slice(3, 5));
  if (h > 23 || m > 59) return null;
  return { h, m };
}

/** Combines a YYYY-MM-DD day and an HH:mm time into one UTC instant. */
export function parseDateTime(date: unknown, time: unknown): Date | null {
  const day = parseDateOnly(date);
  const t = parseTime(time);
  if (!day || !t) return null;
  return new Date(day.getTime() + (t.h * 60 + t.m) * 60_000);
}

/** Today at 00:00 UTC, used as the "not in the past" floor. */
export function todayUtc(now: Date = new Date()): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

/**
 * Validates a requested range: both dates real, start < end, start not in the past.
 */
export function validateRange(
  start: unknown,
  end: unknown,
  now: Date = new Date(),
  startTime: unknown = "00:00",
  endTime: unknown = "00:00",
): { ok: true; range: DateRange } | { ok: false; error: ValidationError } {
  const startDate = parseDateTime(start, startTime);
  const endDate = parseDateTime(end, endTime);

  if (!startDate || !endDate) {
    return {
      ok: false,
      error: {
        code: "INVALID_DATE",
        message: "Dates must be valid YYYY-MM-DD values.",
      },
    };
  }
  if (startDate >= endDate) {
    return {
      ok: false,
      error: {
        code: "END_BEFORE_START",
        message: "End date must be after the start date.",
      },
    };
  }
  if (parseDateOnly(start)! < todayUtc(now)) {
    return {
      ok: false,
      error: {
        code: "IN_THE_PAST",
        message: "Start date cannot be in the past.",
      },
    };
  }
  return { ok: true, range: { startDate, endDate } };
}

/** Number of billable rental days: any started day counts, minimum one. */
export function rentalDays(range: DateRange): number {
  const ms = range.endDate.getTime() - range.startDate.getTime();
  return Math.max(1, Math.ceil(ms / 86_400_000 - 1e-9));
}

/** Short human label like "Oct 12–15" or "Oct 30 – Nov 2". */
export function formatRange(range: DateRange): string {
  const fmt = (d: Date, withMonth: boolean) =>
    d.toLocaleDateString("en-US", {
      timeZone: "UTC",
      month: withMonth ? "short" : undefined,
      day: "numeric",
    });
  const sameMonth =
    range.startDate.getUTCMonth() === range.endDate.getUTCMonth() &&
    range.startDate.getUTCFullYear() === range.endDate.getUTCFullYear();
  return sameMonth
    ? `${fmt(range.startDate, true)}–${fmt(range.endDate, false)}`
    : `${fmt(range.startDate, true)} – ${fmt(range.endDate, true)}`;
}

/** "Oct 31, 10:00 → Nov 3, 10:00" for tooltips and confirmations. */
export function formatRangeWithTime(range: DateRange): string {
  const f = (d: Date) =>
    d.toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" }) +
    ", " +
    toTimeOnly(d);
  return `${f(range.startDate)} → ${f(range.endDate)}`;
}

/** "HH:mm" for a UTC date. */
export function toTimeOnly(date: Date): string {
  return date.toISOString().slice(11, 16);
}

/** `YYYY-MM-DD` for a UTC date. */
export function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}
