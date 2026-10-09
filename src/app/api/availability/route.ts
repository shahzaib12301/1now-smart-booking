import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  findConflicts,
  formatRange,
  rentalDays,
  validateRange,
} from "@/lib/availability";

/**
 * GET /api/availability?carId=&start=&end=
 *
 * Live check used by the booking form while the operator picks dates.
 * Always returns 200 with { available, conflicts, ... } for a well-formed
 * request, so the UI can render the answer inline. 400 only for bad input.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const carId = params.get("carId");
  const validated = validateRange(params.get("start"), params.get("end"));

  if (!carId) {
    return NextResponse.json({ error: "carId is required." }, { status: 400 });
  }
  if (!validated.ok) {
    return NextResponse.json(
      { error: validated.error.message, code: validated.error.code },
      { status: 400 },
    );
  }
  const { range } = validated;

  const car = await prisma.car.findUnique({
    where: { id: carId },
    include: {
      bookings: {
        where: {
          status: "CONFIRMED",
          startDate: { lt: range.endDate },
          endDate: { gt: range.startDate },
        },
        orderBy: { startDate: "asc" },
      },
    },
  });
  if (!car) {
    return NextResponse.json({ error: "Car not found." }, { status: 404 });
  }

  const conflicts = findConflicts(range, car.bookings).map((c) => ({
    id: c.id,
    renterName: c.renterName,
    startDate: c.startDate,
    endDate: c.endDate,
    label: formatRange(c),
  }));
  const days = rentalDays(range);

  return NextResponse.json({
    available: conflicts.length === 0,
    days,
    estimatedTotal: days * car.dailyRate,
    conflicts,
  });
}
