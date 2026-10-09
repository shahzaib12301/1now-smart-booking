import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { toDateOnly } from "@/lib/availability";

/**
 * GET /api/cars/:id/calendar.ics
 *
 * iCal export of a car's confirmed bookings. Marketplaces such as Turo can
 * subscribe to this feed to block the same dates on their side, which is
 * the other half of double-booking prevention.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const car = await prisma.car.findUnique({
    where: { id },
    include: {
      bookings: { where: { status: "CONFIRMED" }, orderBy: { startDate: "asc" } },
    },
  });
  if (!car) {
    return new Response("Car not found", { status: 404 });
  }

  const stamp = formatIcsDateTime(new Date());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//1Now Smart Booking//Fleet Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcs(`${car.year} ${car.make} ${car.model} (${car.plate})`)}`,
  ];

  for (const b of car.bookings) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${b.id}@onenow-fleet-booking`,
      `DTSTAMP:${stamp}`,
      // All-day events: DTEND is exclusive, which matches our [start, end) model.
      `DTSTART;VALUE=DATE:${toDateOnly(b.startDate).replaceAll("-", "")}`,
      `DTEND;VALUE=DATE:${toDateOnly(b.endDate).replaceAll("-", "")}`,
      `SUMMARY:${escapeIcs(`Booked: ${b.renterName}`)}`,
      `DESCRIPTION:${escapeIcs(`${car.make} ${car.model} reserved via 1Now Smart Booking`)}`,
      "STATUS:CONFIRMED",
      "TRANSP:OPAQUE",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");

  return new Response(lines.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="${car.plate}.ics"`,
      "Cache-Control": "no-store",
    },
  });
}

function formatIcsDateTime(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function escapeIcs(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}
