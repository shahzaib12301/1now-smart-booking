import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  findConflicts,
  formatRange,
  rentalDays,
  validateRange,
} from "@/lib/availability";
import { assessRisk } from "@/lib/risk";

/** GET /api/bookings?carId= — list confirmed bookings, optionally for one car. */
export async function GET(request: NextRequest) {
  const carId = request.nextUrl.searchParams.get("carId") ?? undefined;
  const bookings = await prisma.booking.findMany({
    where: { carId, status: "CONFIRMED" },
    orderBy: { startDate: "asc" },
    include: { car: true },
  });
  return NextResponse.json({ bookings });
}

/**
 * POST /api/bookings — create a booking.
 *
 *   201  created
 *   400  invalid input (bad dates, end <= start, start in the past, missing fields)
 *   404  unknown car
 *   409  the car is already booked for an overlapping range (conflicts listed)
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be JSON." },
      { status: 400 },
    );
  }

  const { carId, renterName, startDate, endDate } = (body ?? {}) as Record<
    string,
    unknown
  >;

  if (typeof carId !== "string" || !carId) {
    return NextResponse.json({ error: "carId is required." }, { status: 400 });
  }
  const renter = typeof renterName === "string" ? renterName.trim() : "";
  if (!renter) {
    return NextResponse.json(
      { error: "renterName is required." },
      { status: 400 },
    );
  }

  const validated = validateRange(startDate, endDate);
  if (!validated.ok) {
    return NextResponse.json(
      { error: validated.error.message, code: validated.error.code },
      { status: 400 },
    );
  }
  const { range } = validated;

  const car = await prisma.car.findUnique({ where: { id: carId } });
  if (!car) {
    return NextResponse.json({ error: "Car not found." }, { status: 404 });
  }

  try {
    // Check-then-insert inside one transaction so two simultaneous requests
    // for the same car cannot both slip past the overlap check.
    const booking = await prisma.$transaction(
      async (tx) => {
        const existing = await tx.booking.findMany({
          where: {
            carId,
            status: "CONFIRMED",
            // existingStart < newEnd AND existingEnd > newStart
            startDate: { lt: range.endDate },
            endDate: { gt: range.startDate },
          },
          orderBy: { startDate: "asc" },
        });

        // Re-run the pure predicate as a belt-and-braces check; the DB filter
        // and the helper must always agree.
        const conflicts = findConflicts(range, existing);
        if (conflicts.length > 0) {
          throw new ConflictError(conflicts);
        }

        const days = rentalDays(range);
        const riskReasons = assessRisk({
          dailyRate: car.dailyRate,
          startDate: range.startDate,
          rentalDays: days,
        });

        return tx.booking.create({
          data: {
            carId,
            renterName: renter,
            startDate: range.startDate,
            endDate: range.endDate,
            totalPrice: days * car.dailyRate,
            status: "CONFIRMED",
            flagged: riskReasons.length > 0,
            flagReason: riskReasons.join("; ") || null,
          },
          include: { car: true },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    return NextResponse.json({ booking }, { status: 201 });
  } catch (err) {
    if (err instanceof ConflictError) {
      const conflicts = err.conflicts.map((c) => ({
        id: c.id,
        renterName: c.renterName,
        startDate: c.startDate,
        endDate: c.endDate,
        label: formatRange(c),
      }));
      const first = conflicts[0];
      return NextResponse.json(
        {
          error: `${car.make} ${car.model} is already booked ${first.label} (${first.renterName}).`,
          code: "DOUBLE_BOOKING",
          conflicts,
        },
        { status: 409 },
      );
    }
    throw err;
  }
}

class ConflictError extends Error {
  constructor(
    public conflicts: {
      id: string;
      renterName: string;
      startDate: Date;
      endDate: Date;
    }[],
  ) {
    super("Overlapping booking");
  }
}
