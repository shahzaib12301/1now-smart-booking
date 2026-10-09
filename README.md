# 1Now Smart Booking — fleet booking with double-booking prevention

A small, working slice of car-rental fleet software built for the 1Now engineering assessment.
An operator sees every car's reservations on one calendar, creates a booking, and the system
**refuses to save any reservation that overlaps an existing one on the same car**, telling them
exactly which booking it clashed with.

Built with Claude Code only.

## Run it

```bash
npm install
npx prisma migrate dev      # creates prisma/dev.db (SQLite), applies the schema, runs the seed
npm run dev                 # http://localhost:3000
```

Nothing else to configure. The database is a local SQLite file, and `.env` is committed on purpose
(it only holds the SQLite path). Re-seed at any time with `npx prisma db seed`.

A step-by-step walkthrough of every scenario, plus a short review of the feature, is in
[TESTING.md](TESTING.md).

Run the unit tests for the overlap logic:

```bash
npm test
```

## The feature

**Problem.** Double-booking is the single most expensive mistake an independent operator can make:
two renters, one car, one of them stranded. 1Now's headline promise is preventing it.

**What this does.**

- **Fleet calendar** (`/`): one row per car, a bar per confirmed booking, a marker for today.
- **New booking form**: pick a car, renter, pick-up and return dates. As you change dates the form
  calls `GET /api/availability` and shows either *Available, N days, est. $X* or
  *Already booked Oct 12–15 (Jane Smith)*.
- **Server-side enforcement**: `POST /api/bookings` re-runs the overlap check inside a serializable
  transaction and returns **HTTP 409** with the conflicting booking(s). The UI check is a convenience;
  the API is the guarantee.
- **Validation**: real dates only, return after pick-up, pick-up not in the past (400).

**Bonuses (small nods to the rest of 1Now's product).**

- **Review flag**: a same-day booking of a high-value car (≥ $150/day), or a rental of 14+ days, is
  saved but flagged *for review* and drawn in amber. Think of it as a one-rule Carisma gatekeeper.
- **iCal feed**: `GET /api/cars/:id/calendar.ics` exports a car's bookings as all-day events, the
  format Turo and Google Calendar subscribe to for calendar sync.

### The overlap rule

Bookings are half-open date ranges `[start, end)`. A car returned on the 15th can be picked up on
the 15th. Two ranges clash when

```
existing.start < new.end   AND   existing.end > new.start
```

That predicate lives in [`src/lib/availability.ts`](src/lib/availability.ts) and is covered by
[`src/lib/availability.test.ts`](src/lib/availability.test.ts) (front/back/inside/containing
overlaps, identical ranges, back-to-back, separate). The same condition is expressed as the Prisma
`where` filter in the API so the DB and the helper can never disagree.

## API

| Method | Route | Response |
| --- | --- | --- |
| `GET` | `/api/cars` | Fleet with each car's confirmed bookings |
| `GET` | `/api/bookings?carId=` | Bookings, optionally for one car |
| `POST` | `/api/bookings` | `201` created · `400` invalid · `404` unknown car · `409` double-booking with `conflicts[]` |
| `GET` | `/api/availability?carId=&start=&end=` | `{ available, days, estimatedTotal, conflicts[] }` |
| `GET` | `/api/cars/:id/calendar.ics` | iCal feed of the car's bookings |

Try the conflict from a terminal (seeded: Toyota Camry is booked 3–6 days from today):

```bash
curl -s -X POST localhost:3000/api/bookings \
  -H 'content-type: application/json' \
  -d '{"carId":"<camry id from /api/cars>","renterName":"Test","startDate":"<today+4>","endDate":"<today+8>"}'
# -> 409 {"error":"Toyota Camry is already booked Oct 12–15 (Jane Smith).","code":"DOUBLE_BOOKING","conflicts":[...]}
```

## Stack

Next.js 16 (App Router, TypeScript, `src/`) · Tailwind CSS 4 · Prisma 6 + SQLite · Node's built-in
test runner via `tsx`.

```
prisma/schema.prisma          Car, Booking
prisma/seed.ts                6 cars, 8 bookings relative to today
src/lib/availability.ts       overlap predicate, date validation, helpers (pure, tested)
src/lib/risk.ts               review-flag rules
src/app/api/**                route handlers
src/app/page.tsx              dashboard (server component, streams the DB read)
src/components/FleetTimeline  per-car booking bars
src/components/BookingForm    live availability + create (client component)
```

## What I scoped out, and why

The brief asks for one small, real feature, so everything below is deliberately absent:

- **Login / auth / multi-tenant.** Explicitly out of scope per the brief. Every request acts as the
  single operator. In production each car and booking would carry an `operatorId` and the API
  would be behind a session.
- **Payments, deposits, rental agreements.** `totalPrice` is computed (days × daily rate) but
  nothing is charged. Stripe would hang off the `201` response.
- **Real Turo / insurance / fraud integrations.** The iCal feed is the export half of calendar
  sync; importing Turo's feed and blocking those dates is the obvious next step. The review flag
  is a single rule, not an ML or third-party identity check.
- **Editing and cancelling bookings.** The schema has a `status` column (`CONFIRMED` /
  `CANCELLED`) and the overlap check ignores cancelled rows, but there is no UI or endpoint for it.
- **Time-of-day and time zones.** Bookings are whole UTC calendar days. Operators rent by the day;
  hourly pick-up windows would make the range `[startAt, endAt)` with the same predicate.
- **Mock data.** Six cars and eight bookings are seeded relative to today so the demo never goes
  stale. There is no "add a car" screen.

## What I would build next

1. Import a Turo iCal feed per car and treat its events as bookings in the overlap check.
2. Cancel / reschedule with the same conflict rule.
3. A per-car utilisation and revenue summary from the same booking table.
