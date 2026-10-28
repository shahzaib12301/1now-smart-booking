/**
 * Seeds a small fleet plus a handful of confirmed bookings so the
 * double-booking demo works immediately after `npx prisma migrate dev`.
 *
 * Dates are relative to "today" so the demo never goes stale.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DAY_MS = 86_400_000;
const today = new Date();
const todayUtc = new Date(
  Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
);
// Pickups and returns default to 10:00 UTC so back-to-back turnarounds are visible.
const day = (offset: number) => new Date(todayUtc.getTime() + offset * DAY_MS + 10 * 3_600_000);

const cars = [
  { make: "Toyota", model: "Camry", year: 2022, plate: "FLT-101", dailyRate: 55, color: "#9ca3af" },
  { make: "Honda", model: "CR-V", year: 2023, plate: "FLT-102", dailyRate: 70, color: "#1f2937" },
  { make: "Tesla", model: "Model 3", year: 2024, plate: "FLT-103", dailyRate: 110, color: "#dc2626" },
  { make: "Ford", model: "Mustang GT", year: 2023, plate: "FLT-104", dailyRate: 165, color: "#2563eb" },
  { make: "Jeep", model: "Wrangler", year: 2021, plate: "FLT-105", dailyRate: 95, color: "#16a34a" },
  { make: "BMW", model: "X5", year: 2024, plate: "FLT-106", dailyRate: 180, color: "#f8fafc", status: "IN_SERVICE" },
];

const LOCATIONS = ["Main office", "Airport", "Downtown lot", "Delivery to renter"];

// [plate, renter, startOffset, endOffset, email, phone, location) relative to today
const bookings: [string, string, number, number, string, string, string][] = [
  ["FLT-101", "Jane Smith", 3, 6, "jane.smith@example.com", "+1 555 0101", LOCATIONS[0]],
  ["FLT-101", "Omar Ali", 10, 14, "omar.ali@example.com", "+1 555 0102", LOCATIONS[1]],
  ["FLT-102", "Maria Lopez", -2, 2, "maria.lopez@example.com", "+1 555 0103", LOCATIONS[2]],
  ["FLT-102", "Chen Wei", 8, 12, "chen.wei@example.com", "+1 555 0104", LOCATIONS[0]],
  ["FLT-103", "David Park", 1, 4, "david.park@example.com", "+1 555 0105", LOCATIONS[1]],
  ["FLT-103", "Aisha Khan", 4, 9, "aisha.khan@example.com", "+1 555 0106", LOCATIONS[0]], // back-to-back: allowed
  ["FLT-104", "Liam O'Connor", 5, 7, "liam.oc@example.com", "+1 555 0107", LOCATIONS[3]],
  ["FLT-105", "Sofia Rossi", 13, 20, "sofia.rossi@example.com", "+1 555 0108", LOCATIONS[2]],
];

async function main() {
  await prisma.booking.deleteMany();
  await prisma.car.deleteMany();

  const byPlate = new Map<string, { id: string; dailyRate: number }>();
  for (const c of cars) {
    // Stable id per plate so a reseed never invalidates an open page.
    const created = await prisma.car.create({
      data: { id: `car-${c.plate.toLowerCase()}`, ...c },
    });
    byPlate.set(created.plate, created);
  }

  for (const [plate, renterName, startOffset, endOffset, renterEmail, renterPhone, pickupLocation] of bookings) {
    const car = byPlate.get(plate)!;
    const days = endOffset - startOffset;
    await prisma.booking.create({
      data: {
        carId: car.id,
        renterName,
        renterEmail,
        renterPhone,
        pickupLocation,
        startDate: day(startOffset),
        endDate: day(endOffset),
        totalPrice: days * car.dailyRate,
      },
    });
  }

  console.log(`Seeded ${cars.length} cars and ${bookings.length} bookings.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
