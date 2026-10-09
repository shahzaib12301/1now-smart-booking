import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/** GET /api/cars — list the fleet with each car's confirmed bookings. */
export async function GET() {
  const cars = await prisma.car.findMany({
    orderBy: [{ make: "asc" }, { model: "asc" }],
    include: {
      bookings: {
        where: { status: "CONFIRMED" },
        orderBy: { startDate: "asc" },
      },
    },
  });
  return NextResponse.json({ cars });
}
