/**
 * Lightweight "gatekeeper" check, a nod to 1Now's Carisma fraud screening.
 * It never blocks a booking; it flags it so the operator reviews it before handover.
 */

export interface RiskInput {
  dailyRate: number;
  startDate: Date;
  rentalDays: number;
  now?: Date;
}

export const HIGH_VALUE_RATE = 150; // USD per day
export const SAME_DAY_MS = 24 * 60 * 60 * 1000;
export const LONG_RENTAL_DAYS = 14;

/** Returns the reasons a booking should be reviewed, or an empty list if none. */
export function assessRisk(input: RiskInput): string[] {
  const now = input.now ?? new Date();
  const reasons: string[] = [];
  const isHighValue = input.dailyRate >= HIGH_VALUE_RATE;
  const leadTimeMs = input.startDate.getTime() - now.getTime();
  const isSameDay = leadTimeMs < SAME_DAY_MS;

  if (isHighValue && isSameDay) {
    reasons.push("Same-day booking of a high-value car");
  }
  if (input.rentalDays >= LONG_RENTAL_DAYS) {
    reasons.push(`Long rental (${input.rentalDays} days)`);
  }
  return reasons;
}
