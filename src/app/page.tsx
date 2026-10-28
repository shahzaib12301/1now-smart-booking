import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@/lib/prisma";
import { todayUtc, toDateOnly } from "@/lib/availability";
import { FleetTimeline } from "@/components/FleetTimeline";
import { BookingForm } from "@/components/BookingForm";

const WINDOW_DAYS = 28;

export default function Page() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-sky-600 dark:text-sky-400">
            1Now · Smart Booking
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Fleet calendar
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-zinc-500 dark:text-zinc-400">
            Every confirmed reservation per car. New bookings are checked for
            overlaps before they are saved, so a car can never be double-booked.
          </p>
        </div>
        <Legend />
      </header>

      <Suspense fallback={<DashboardSkeleton />}>
        <Dashboard />
      </Suspense>
    </main>
  );
}

async function Dashboard() {
  // Opt into request-time rendering: "today" and the DB read must never be prerendered.
  await connection();
  const today = todayUtc();
  const windowStart = new Date(today.getTime() - 3 * 86_400_000);

  const cars = await prisma.car.findMany({
    orderBy: [{ make: "asc" }, { model: "asc" }],
    include: {
      bookings: {
        where: { status: "CONFIRMED" },
        orderBy: { startDate: "asc" },
      },
    },
  });

  const timelineCars = cars.map((c) => ({
    ...c,
    bookings: c.bookings.map((b) => ({
      id: b.id,
      renterName: b.renterName,
      startDate: b.startDate.toISOString(),
      endDate: b.endDate.toISOString(),
      totalPrice: b.totalPrice,
      flagged: b.flagged,
      flagReason: b.flagReason,
      renterEmail: b.renterEmail,
      renterPhone: b.renterPhone,
      pickupLocation: b.pickupLocation,
      notes: b.notes,
    })),
  }));

  const bookableCars = cars
    .filter((c) => c.status === "ACTIVE")
    .map((c) => ({
      id: c.id,
      make: c.make,
      model: c.model,
      year: c.year,
      plate: c.plate,
      dailyRate: c.dailyRate,
      // Date-only spans so the custom date picker can mark booked days.
      bookings: c.bookings.map((b) => ({
        start: toDateOnly(b.startDate),
        end: toDateOnly(b.endDate),
        renterName: b.renterName,
      })),
    }));

  const flaggedCount = cars.reduce(
    (n, c) => n + c.bookings.filter((b) => b.flagged).length,
    0,
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <section className="min-w-0">
        <div className="mb-2 flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
          <span>
            {cars.length} cars · {cars.reduce((n, c) => n + c.bookings.length, 0)} confirmed bookings
            {flaggedCount > 0 ? ` · ${flaggedCount} flagged for review` : ""}
          </span>
          <span>
            Showing {WINDOW_DAYS} days from {toDateOnly(windowStart)}
          </span>
        </div>
        <FleetTimeline
          cars={timelineCars}
          windowStart={windowStart}
          windowDays={WINDOW_DAYS}
          today={today}
        />
      </section>
      <aside>
        <BookingForm cars={bookableCars} today={toDateOnly(today)} />
      </aside>
    </div>
  );
}

function Legend() {
  return (
    <div className="flex items-center gap-4 text-xs text-zinc-500 dark:text-zinc-400">
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-3 w-5 rounded-sm bg-sky-600" /> Booked
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-3 w-5 rounded-sm bg-amber-500" /> Flagged for review
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-3 w-px bg-emerald-500" /> Today
      </span>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="h-96 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800" />
      <div className="h-96 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800" />
    </div>
  );
}
