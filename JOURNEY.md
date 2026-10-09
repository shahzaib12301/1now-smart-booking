# Journey notes

Why this idea, how I worked, where I got stuck. Notes, not an essay.

## Why this idea

I read 1now.ai and the headline is stopping double bookings across Turo and the
operator's own site. That is the one bug that strands a customer, so I built the booking
flow around it: a fleet calendar where a new reservation is blocked if it overlaps an
existing one on the same car, and the operator sees exactly which booking it clashed with.

## How I worked with Claude Code

- Wrote the plan first in [CLAUDE.md](CLAUDE.md): the feature, data model, overlap rule,
  API, build order, and what to cut. Then had Claude Code execute it step by step.
- Reviewed each step, tested by hand in the browser, and pushed back when the UI or the
  behaviour was not right (see "Where I got stuck").
- Cut scope on purpose: no auth, no payments, no real Turo integration, no edit or cancel.
  The README says what was cut and why.

## Where I got stuck

- **Prisma version.** The `latest` tag on npm was an 8.0 release candidate, and v7 needs
  native driver adapters for SQLite. Pinned to v6 so a reviewer's `npm install` just works.
- **Next.js 16 Cache Components.** The dashboard reads today's date, and the prerenderer
  refused `new Date()`. Fixed with `await connection()` so the dashboard renders per request.
- **Timeline labels.** Short bookings truncated the renter's name and hid the dates.
  Reworked to fixed-width day columns and two-line bars: name on top, dates underneath.
- **Stale availability banner.** After saving a booking the form still said "Available"
  for the dates just taken. Added a re-check after every successful save.
- **Reseeding broke open pages.** The seed recreated cars with new IDs, so a form left
  open returned "Car not found". Gave seeded cars stable IDs like `car-flt-101`.
- **Hydration warning.** A browser extension injected attributes into the form fields and
  tripped React's hydration check. Suppressed on those four controls; harmless otherwise.

## What I verified

- 17 unit tests on the overlap rule: front, back, inside, containing, identical,
  back-to-back (allowed), separate, plus date parsing and validation.
- Every API status by curl: 201, 400 for each validation code, 404, 409 with conflicts.
- Four simultaneous identical bookings; exactly one returned 201, three returned 409.
- Lint, type check, and `next build` clean.

A step-by-step manual walkthrough is in [TESTING.md](TESTING.md).
