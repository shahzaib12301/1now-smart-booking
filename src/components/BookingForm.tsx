"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

interface CarOption {
  id: string;
  make: string;
  model: string;
  year: number;
  plate: string;
  dailyRate: number;
}

interface Conflict {
  id: string;
  renterName: string;
  label: string;
}

type Availability =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "invalid"; message: string }
  | { state: "available"; days: number; estimatedTotal: number }
  | { state: "conflict"; conflicts: Conflict[] };

type Result =
  | { kind: "success"; message: string; flagReason: string | null }
  | { kind: "conflict"; message: string; conflicts: Conflict[] }
  | { kind: "error"; message: string };

interface Props {
  cars: CarOption[];
  /** YYYY-MM-DD, used as the date input floor and the default start. */
  today: string;
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function BookingForm({ cars, today }: Props) {
  const router = useRouter();
  const [carId, setCarId] = useState(cars[0]?.id ?? "");
  const [renterName, setRenterName] = useState("");
  const [start, setStart] = useState(addDays(today, 3));
  const [end, setEnd] = useState(addDays(today, 6));
  // Result of the last server availability check, tagged with the inputs it answers.
  const [remote, setRemote] = useState<{ key: string; value: Availability } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Bumped after a successful save so the live check runs again for the same inputs.
  const [checkVersion, setCheckVersion] = useState(0);
  const [result, setResult] = useState<Result | null>(null);

  const car = useMemo(() => cars.find((c) => c.id === carId), [cars, carId]);

  // Client-side validation is derived, not stored.
  const requestKey = `${carId}|${start}|${end}`;
  const localProblem = !carId || !start || !end
    ? "idle"
    : start >= end
      ? "End date must be after the start date."
      : start < today
        ? "Start date cannot be in the past."
        : null;

  const availability: Availability =
    localProblem === "idle"
      ? { state: "idle" }
      : localProblem
        ? { state: "invalid", message: localProblem }
        : remote?.key === requestKey
          ? remote.value
          : { state: "checking" };

  // Live availability check, debounced, whenever car or dates change.
  useEffect(() => {
    if (localProblem) return;
    const [cId, s, e] = requestKey.split("|");
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      let value: Availability;
      try {
        const params = new URLSearchParams({ carId: cId, start: s, end: e });
        const res = await fetch(`/api/availability?${params}`, { signal: controller.signal });
        const data = await res.json();
        if (!res.ok) {
          value = { state: "invalid", message: data.error ?? "Could not check availability." };
        } else if (data.available) {
          value = { state: "available", days: data.days, estimatedTotal: data.estimatedTotal };
        } else {
          value = { state: "conflict", conflicts: data.conflicts };
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        value = { state: "invalid", message: "Could not check availability." };
      }
      setRemote({ key: requestKey, value });
    }, 250);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [requestKey, localProblem, checkVersion]);

  // Any edit clears the last submit result.
  const edit = <T,>(setter: (v: T) => void) => (v: T) => {
    setResult(null);
    setter(v);
  };
  const changeCar = edit(setCarId);
  const changeRenter = edit(setRenterName);
  const changeStart = edit(setStart);
  const changeEnd = edit(setEnd);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ carId, renterName, startDate: start, endDate: end }),
      });
      const data = await res.json();
      if (res.status === 201) {
        setResult({
          kind: "success",
          message: `Booked ${data.booking.car.make} ${data.booking.car.model} for ${data.booking.renterName} · $${data.booking.totalPrice}`,
          flagReason: data.booking.flagReason ?? null,
        });
        setRenterName("");
        setRemote(null); // the dates just booked are no longer available
        setCheckVersion((v) => v + 1);
        router.refresh(); // re-render the server timeline with the new bar
      } else if (res.status === 409) {
        setResult({ kind: "conflict", message: data.error, conflicts: data.conflicts ?? [] });
      } else {
        setResult({ kind: "error", message: data.error ?? `Request failed (${res.status})` });
      }
    } catch {
      setResult({ kind: "error", message: "Network error. Is the dev server running?" });
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit =
    !submitting &&
    renterName.trim().length > 0 &&
    (availability.state === "available" || availability.state === "conflict");

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
    >
      <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">New booking</h2>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        Availability is checked live as you pick dates. Overlaps are rejected on save.
      </p>

      <div className="mt-4 grid gap-4">
        <label className="grid gap-1 text-sm">
          <span className="font-medium text-zinc-700 dark:text-zinc-300">Car</span>
          <select
            suppressHydrationWarning
            value={carId}
            onChange={(e) => changeCar(e.target.value)}
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          >
            {cars.map((c) => (
              <option key={c.id} value={c.id}>
                {c.year} {c.make} {c.model} · {c.plate} · ${c.dailyRate}/day
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-1 text-sm">
          <span className="font-medium text-zinc-700 dark:text-zinc-300">Renter name</span>
          <input
            suppressHydrationWarning
            value={renterName}
            onChange={(e) => changeRenter(e.target.value)}
            placeholder="e.g. Maria Lopez"
            required
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">Pick-up</span>
            <input
              suppressHydrationWarning
              type="date"
              value={start}
              min={today}
              onChange={(e) => changeStart(e.target.value)}
              required
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">Return</span>
            <input
              suppressHydrationWarning
              type="date"
              value={end}
              min={addDays(start || today, 1)}
              onChange={(e) => changeEnd(e.target.value)}
              required
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            />
          </label>
        </div>

        <AvailabilityBanner availability={availability} car={car} />

        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {submitting ? "Saving…" : "Create booking"}
        </button>

        {result ? <ResultBanner result={result} /> : null}
      </div>
    </form>
  );
}

function AvailabilityBanner({ availability, car }: { availability: Availability; car?: CarOption }) {
  const base = "rounded-md px-3 py-2 text-sm";
  switch (availability.state) {
    case "idle":
      return null;
    case "checking":
      return <div className={`${base} bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300`}>Checking availability…</div>;
    case "invalid":
      return <div className={`${base} bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200`}>{availability.message}</div>;
    case "available":
      return (
        <div className={`${base} bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200`}>
          ✅ Available · {availability.days} day{availability.days === 1 ? "" : "s"} · est. ${availability.estimatedTotal}
        </div>
      );
    case "conflict":
      return (
        <div className={`${base} bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200`}>
          🚫 {car ? `${car.make} ${car.model}` : "This car"} is already booked{" "}
          {availability.conflicts.map((c, i) => (
            <span key={c.id}>
              {i > 0 ? " and " : ""}
              <strong>{c.label}</strong> ({c.renterName})
            </span>
          ))}
          .
        </div>
      );
  }
}

function ResultBanner({ result }: { result: Result }) {
  const base = "rounded-md px-3 py-2 text-sm";
  if (result.kind === "success") {
    return (
      <div className={`${base} bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200`} role="status">
        ✅ {result.message}
        {result.flagReason ? (
          <div className="mt-1 rounded bg-amber-100 px-2 py-1 text-xs text-amber-900 dark:bg-amber-900 dark:text-amber-100">
            ⚠ Flagged for review: {result.flagReason}
          </div>
        ) : null}
      </div>
    );
  }
  if (result.kind === "conflict") {
    return (
      <div className={`${base} bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200`} role="alert">
        🚫 <strong>Double-booking blocked (409).</strong> {result.message}
      </div>
    );
  }
  return (
    <div className={`${base} bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200`} role="alert">
      {result.message}
    </div>
  );
}
