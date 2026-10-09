# Testing guide and feature review

This document walks a reviewer through every scenario the feature handles, in the
order that tells the story best, and closes with a short honest review of what was
built and what was not.

## Setup

```bash
npm install
npx prisma migrate dev      # creates the SQLite DB and seeds demo data
npm run dev                 # http://localhost:3000
```

Use a private/incognito browser window. Some browser extensions inject attributes into
form fields and trigger a harmless React hydration warning in the dev overlay.

The seed is relative to "today", so the exact dates below shift with the calendar.
Read the timeline first and substitute the dates you see. The relationships never change:

| Car | Seeded bookings (relative to today) |
| --- | --- |
| Toyota Camry | Jane Smith, day +3 to +6 · Omar Ali, day +10 to +14 |
| Honda CR-V | Maria Lopez, day −2 to +2 · Chen Wei, day +8 to +12 |
| Tesla Model 3 | David Park, day +1 to +4 · Aisha Khan, day +4 to +9 (back-to-back) |
| Ford Mustang GT | Liam O'Connor, day +5 to +7 |
| Jeep Wrangler | Sofia Rossi, day +13 to +20 |
| BMW X5 | none, status *In service* so it is not bookable |

In the examples below, today is 9 October 2026, so Jane Smith is Oct 12–15 and
Omar Ali is Oct 19–23.

## Automated tests

```bash
npm test
```

Runs 17 unit tests against the pure overlap logic in `src/lib/availability.ts`:
partial overlap at the front and back, a range inside another, a range containing
another, identical ranges, back-to-back ranges (must be allowed), separate ranges,
date parsing including impossible dates like 31 February, and the three validation
rules (valid dates, end after start, start not in the past).

## Manual scenarios

### 1. Normal booking, expect success

| Field | Value |
| --- | --- |
| Car | Toyota Camry |
| Renter | your name |
| Pick-up | Oct 25 |
| Return | Oct 28 |

The banner under the dates turns green: *Available · 3 days · est. $165*.
Click **Create booking**. A green success message appears, a new bar is drawn in the
Camry row, and the banner immediately flips to red because those dates are now taken.

### 2. Double booking, expect block

| Field | Value |
| --- | --- |
| Car | Toyota Camry |
| Pick-up | Oct 13 |
| Return | Oct 17 |

The banner turns red as soon as the dates are set:
*Toyota Camry is already booked Oct 12–15 (Jane Smith).*

Click **Create booking** anyway. The button is deliberately left enabled so you can
prove the server enforces the rule, not just the form. The API answers **409** and the
form shows *Double-booking blocked (409)* with the same conflict. Nothing is added.

### 3. Range spanning two bookings, expect block naming both

| Field | Value |
| --- | --- |
| Car | Toyota Camry |
| Pick-up | Oct 14 |
| Return | Oct 20 |

The banner names both conflicts: *Oct 12–15 (Jane Smith) and Oct 19–23 (Omar Ali)*.

### 4. Back-to-back, expect success

| Field | Value |
| --- | --- |
| Car | Toyota Camry |
| Pick-up | Oct 15 |
| Return | Oct 19 |

Pick-up is the day Jane returns; return is the day Omar picks up. Ranges are
half-open `[start, end)`, so this is allowed. After saving, the Camry row shows three
bars touching with no gap.

### 5. Invalid dates, expect disabled button

Set Return earlier than Pick-up. The banner says *End date must be after the start
date* and the button is disabled. The date pickers also refuse days before today.

The API applies the same rules independently and returns **400** with a code:
`INVALID_DATE`, `END_BEFORE_START`, or `IN_THE_PAST`.

### 6. Review flag, expect saved but flagged

| Field | Value |
| --- | --- |
| Car | Ford Mustang GT ($165/day) |
| Pick-up | today |
| Return | today + 2 |

The booking saves, the success message adds *Flagged for review: Same-day booking of
a high-value car*, and the bar is amber instead of blue. A rental of 14 days or more
is flagged the same way. Flags never block; they tell the operator to look before
handing over the keys.

### 7. Calendar export

Click the small **.ics** link under any car, or open
`/api/cars/car-flt-101/calendar.ics` directly. A standard iCal file downloads with one
all-day event per confirmed booking. Google Calendar, Outlook, and Turo can subscribe
to this URL to block the same dates on their side.

### 8. Race condition, API only

Fire several identical requests at once:

```bash
for i in 1 2 3 4; do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST localhost:3000/api/bookings \
    -H 'content-type: application/json' \
    -d '{"carId":"car-flt-105","renterName":"Racer","startDate":"2026-11-10","endDate":"2026-11-12"}' &
done; wait
```

Exactly one request returns **201**; the rest return **409**. The check and insert run
inside a serializable transaction, so two operators clicking at the same second cannot
both win.

### Reset

```bash
npx prisma db seed
```

Restores the original six cars and eight bookings. Refresh the page afterwards.

## Feature review

**What it does well**

- The one rule that matters, overlap detection, is isolated in a pure function, unit
  tested, and expressed identically as the database filter, so the UI, the API, and the
  DB can never disagree.
- Enforcement is server-side and transaction-safe. The live banner is a convenience;
  the 409 is the guarantee.
- Conflicts are reported precisely: which booking, which dates, which renter. An
  operator can act on that without opening another screen.
- Setup is three commands with no external services, which is what a reviewer needs.

**Known limitations**

- Bookings are whole UTC calendar days. "Today" is UTC midnight, so in time zones far
  from UTC the date floor can lag the local date by a few hours.
- There is no edit or cancel. The schema has a `status` column and the overlap check
  ignores cancelled rows, but no endpoint or UI exposes it.
- The review flag is one hard-coded rule, not a risk model.
- The iCal feed is export only. Importing a Turo feed and treating its events as
  bookings is the natural next step.
- No auth, no multi-tenant, no payments, per the brief.

**What I would build next, in order**

1. Turo iCal import per car, feeding the same overlap check.
2. Cancel and reschedule using the same conflict rule.
3. Per-car utilisation and revenue summary from the booking table.
