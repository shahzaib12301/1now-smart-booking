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
): { ok: true; range: DateRange } | { ok: false; error: ValidationError } {
  const startDate = parseDateOnly(start);
  const endDate = parseDateOnly(end);

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
  if (startDate < todayUtc(now)) {
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

/** Number of rental days in a half-open range. */
export function rentalDays(range: DateRange): number {
  const ms = range.endDate.getTime() - range.startDate.getTime();
  return Math.round(ms / 86_400_000);
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

/** `YYYY-MM-DD` for a UTC date. */
export function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}
