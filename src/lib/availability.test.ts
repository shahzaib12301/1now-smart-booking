import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  rangesOverlap,
  findConflicts,
  parseDateOnly,
  validateRange,
  rentalDays,
  formatRange,
} from "./availability";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const range = (start: string, end: string) => ({
  startDate: d(start),
  endDate: d(end),
});

describe("rangesOverlap (half-open [start, end))", () => {
  const existing = range("2026-10-12", "2026-10-15");

  it("detects a partial overlap at the front", () => {
    assert.equal(rangesOverlap(range("2026-10-10", "2026-10-13"), existing), true);
  });
  it("detects a partial overlap at the back", () => {
    assert.equal(rangesOverlap(range("2026-10-14", "2026-10-18"), existing), true);
  });
  it("detects a range fully inside another", () => {
    assert.equal(rangesOverlap(range("2026-10-13", "2026-10-14"), existing), true);
  });
  it("detects a range that fully contains another", () => {
    assert.equal(rangesOverlap(range("2026-10-01", "2026-10-31"), existing), true);
  });
  it("treats identical ranges as overlapping", () => {
    assert.equal(rangesOverlap(range("2026-10-12", "2026-10-15"), existing), true);
  });
  it("allows back-to-back rentals (end == next start)", () => {
    assert.equal(rangesOverlap(range("2026-10-15", "2026-10-18"), existing), false);
    assert.equal(rangesOverlap(range("2026-10-09", "2026-10-12"), existing), false);
  });
  it("is false for clearly separate ranges", () => {
    assert.equal(rangesOverlap(range("2026-11-01", "2026-11-05"), existing), false);
  });
});

describe("findConflicts", () => {
  const existing = [
    { id: "a", renterName: "Jane Smith", ...range("2026-10-12", "2026-10-15") },
    { id: "b", renterName: "Omar Ali", ...range("2026-10-20", "2026-10-22") },
  ];
  it("returns only the clashing bookings", () => {
    const hits = findConflicts(range("2026-10-14", "2026-10-21"), existing);
    assert.deepEqual(
      hits.map((h) => h.id),
      ["a", "b"],
    );
    assert.deepEqual(findConflicts(range("2026-10-15", "2026-10-20"), existing), []);
  });
});

describe("parseDateOnly", () => {
  it("parses a valid YYYY-MM-DD as UTC midnight", () => {
    assert.equal(parseDateOnly("2026-10-12")?.toISOString(), "2026-10-12T00:00:00.000Z");
  });
  it("rejects garbage and impossible dates", () => {
    assert.equal(parseDateOnly("12/10/2026"), null);
    assert.equal(parseDateOnly("2026-02-31"), null);
    assert.equal(parseDateOnly(undefined), null);
    assert.equal(parseDateOnly(""), null);
  });
});

describe("validateRange", () => {
  const now = d("2026-10-09");

  it("accepts a valid future range", () => {
    assert.equal(validateRange("2026-10-12", "2026-10-15", now).ok, true);
  });
  it("accepts a range starting today", () => {
    assert.equal(validateRange("2026-10-09", "2026-10-10", now).ok, true);
  });
  it("rejects end before or equal to start", () => {
    const r = validateRange("2026-10-15", "2026-10-12", now);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error.code, "END_BEFORE_START");
    assert.equal(validateRange("2026-10-12", "2026-10-12", now).ok, false);
  });
  it("rejects a start in the past", () => {
    const r = validateRange("2026-10-01", "2026-10-05", now);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error.code, "IN_THE_PAST");
  });
  it("rejects malformed dates", () => {
    const r = validateRange("soon", "2026-10-05", now);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error.code, "INVALID_DATE");
  });
});

describe("helpers", () => {
  it("counts rental days", () => {
    assert.equal(rentalDays(range("2026-10-12", "2026-10-15")), 3);
  });
  it("formats ranges", () => {
    assert.equal(formatRange(range("2026-10-12", "2026-10-15")), "Oct 12–15");
    assert.equal(formatRange(range("2026-10-30", "2026-11-02")), "Oct 30 – Nov 2");
  });
});
