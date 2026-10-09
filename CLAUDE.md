# 1Now Engineering Assessment — Project Context & Build Plan

> This file is the single source of truth for this assessment project. Open this
> directory (`onenow-fleet-booking`) in Claude Code and continue from the
> **Build plan** section below. Everything you need is here.

---

## 1. The assessment (what we're graded on)

Job: **Developer/Engineer at 1Now** (car-rental fleet software). Portal: https://jobs.1now.ai/

Requirements:
- Ship **ONE small, real, working feature** an operator would actually use (they suggest booking, payouts, fraud check, calendar sync — or any real 1Now problem).
- **Real end-to-end working code** — not a write-up or design doc. A reviewer runs it and it works.
- **Keep scope small.** One feature is enough. Skip login/auth & infra. Mock/sample data is fine — just document what was left out and why.
- **Use Claude / Claude Code ONLY** — no other AI tools for the final work.

Deliverables (first two are REQUIRED):
- ✅ **GitHub repo** — working code, public or shared.
- ✅ **Loom video** — up to 3 min: brief self-intro + the problem picked + live demo of the feature working.
- ⬜ (Optional) resume / notes (PDF or Word).

**Deadline: Sunday 11 October 2026, midnight.** Reply to the HR email once submitted.
Applicant: **Shahzaib Sharafat**.

---

## 2. Who 1Now is (context for a "relevant" pick)

Car-rental software for **independent operators & Turo hosts**. It moves their bookings off marketplaces (Turo) onto their **own branded booking site**, and runs the fleet:
- Booking calendar + **double-booking prevention / Turo calendar sync** (their headline feature)
- Renter verification & **fraud / "gatekeeper" checks** (AI agent "Carisma" flags risky bookings)
- Payments, deposits, rental agreements, profit-per-car reporting

An **operator** = a small car-rental business owner managing cars, bookings, and renters.

---

## 3. Decision — what we're building

**Feature: "Smart Booking" — fleet booking with automatic double-booking prevention.**
Chosen because it's 1Now's #1 core workflow, hits both "booking" AND their headline "prevent double-booking / calendar sync," shows real engineering (date-range overlap detection), and demos unmistakably in under 3 minutes.

**Stack:** Next.js (TypeScript, App Router, `src/` dir) + Tailwind CSS + **Prisma + SQLite** (zero DB setup for the reviewer), seeded with mock cars & bookings.

---

## 4. Current status

- ✅ Next.js + TS + Tailwind + ESLint scaffolded (App Router, `src/` dir, import alias `@/*`).
- ⬜ Everything in the Build plan below is still TODO.

Run the dev server: `npm run dev` → http://localhost:3000

---

## 5. Feature design

### Data model (Prisma / SQLite)
- **Car**: `id, make, model, year, plate, dailyRate, status` (+ optional `color/imageUrl`)
- **Booking**: `id, carId (FK), renterName, startDate, endDate, status (CONFIRMED), totalPrice, createdAt`

### Core logic — availability / overlap detection (the engineering centerpiece)
A car is **unavailable** for a requested `[start, end)` if an existing booking on that car overlaps:
```
existingStart < newEnd  AND  existingEnd > newStart
```
`POST /api/bookings` must run this check and **reject overlaps with HTTP 409**, returning exactly which existing booking it clashed with (dates + renter). Also validate: `start < end`, not in the past.

### API routes (Next.js App Router, under `src/app/api/`)
- `GET  /api/cars` — list fleet
- `GET  /api/bookings` — list bookings (optional `?carId=`)
- `POST /api/bookings` — create booking (runs overlap check; 201 ok / 409 conflict / 400 invalid)
- `GET  /api/availability?carId=&start=&end=` — live availability check for the form

### UI (Tailwind, clean & demo-friendly)
- **Fleet dashboard** (`/`) — cars with status + a **per-car booking timeline** (bars for booked ranges)
- **New Booking form** — pick car + renter + dates → instant **success** or clear **"🚫 Already booked Oct 12–15 (J. Smith)"** conflict message
- Live availability feedback as dates are picked (calls `/api/availability`)

### Seed / mock data
A `prisma/seed.ts` with ~5–6 cars and a handful of existing bookings (so the double-booking demo works immediately).

---

## 6. Build plan (ordered — do these next)

1. **Add Prisma + SQLite**: `npm i -D prisma && npm i @prisma/client && npx prisma init --datasource-provider sqlite`. Define `Car` + `Booking` in `schema.prisma`. `npx prisma migrate dev --name init`.
2. **Seed script** (`prisma/seed.ts`) with mock cars + bookings; wire `prisma db seed`.
3. **DB client singleton** (`src/lib/prisma.ts`).
4. **Availability helper** (`src/lib/availability.ts`) — pure overlap function + unit-testable; (optional: a tiny `*.test.ts`).
5. **API routes** — cars, bookings (GET+POST with overlap check), availability.
6. **UI** — fleet dashboard with per-car timeline + the new-booking form with live conflict feedback (Tailwind).
7. **(Bonus, if time)** risk flag on a booking (same-day booking of a high-value car → "flag for review") = nod to Carisma gatekeeper; and/or `GET /api/cars/[id]/calendar.ics` iCal export = nod to Turo calendar sync.
8. **README.md** — what it is, how to run (`npm install && npx prisma migrate dev && npm run dev`), the feature, and the **"What I scoped out and why"** section (auth, payments, real Turo/insurance integrations, multi-tenant).
9. **Polish** the UI for the demo; verify the full end-to-end flow.

### Deliberately scoped OUT (state in README)
Login/auth, real payments, real Turo/insurance/fraud integrations, multi-tenant infra — all explicitly fine to skip per the brief. Mock data by design.

---

## 7. Submission checklist

- ⬜ Code complete & runs end-to-end (`npm install && npx prisma migrate dev && npm run dev`)
- ⬜ README with run steps + "what I left out and why"
- ⬜ Public **GitHub repo** pushed (decide repo name later; e.g. `1now-smart-booking`)
- ⬜ **Loom (≤3 min)** recorded
- ⬜ Replied to HR email confirming submission

### Loom script (≤3 min)
1. **(20s) Intro** — "Hi, I'm Shahzaib, a full-stack developer…"
2. **(30s) Problem** — Double-booking is the #1 risk for a car-rental operator; 1Now's headline is preventing it. I built a booking feature that blocks overlapping reservations on the same car.
3. **(90s) Demo** — show the fleet + timeline → create a valid booking (success) → try to book the same car on overlapping dates → **blocked with the exact conflict** → (bonus) show the risk flag / iCal.
4. **(20s) Wrap** — stack, what I scoped out & why, what I'd build next.

---

## 8. Rules reminder
- **Claude / Claude Code only** for the build.
- Keep it **small and working** over big and broken — that's the grading bar.
