"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DatePicker, TimePicker, type BookedSpan } from "./DatePicker";

interface CarOption {
  id: string;
  make: string;
  model: string;
  year: number;
  plate: string;
  dailyRate: number;
  bookings: BookedSpan[];
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
  /** YYYY-MM-DD, used as the date floor and the default start. */
  today: string;
}

export const PICKUP_LOCATIONS = [
  "Main office",
  "Airport",
  "Downtown lot",
  "Delivery to renter",
];

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const inputCls =
  "w-full min-w-0 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950";
const labelCls = "font-medium text-zinc-700 dark:text-zinc-300";

export function BookingForm({ cars, today }: Props) {
  const router = useRouter();
  const [carId, setCarId] = useState(cars[0]?.id ?? "");
  const [renterName, setRenterName] = useState("");
  const [renterEmail, setRenterEmail] = useState("");
  const [renterPhone, setRenterPhone] = useState("");
  const [pickupLocation, setPickupLocation] = useState(PICKUP_LOCATIONS[0]);
  const [notes, setNotes] = useState("");
  const [start, setStart] = useState(addDays(today, 3));
  const [startTime, setStartTime] = useState("10:00");
  const [end, setEnd] = useState(addDays(today, 6));
  const [endTime, setEndTime] = useState("10:00");

  // Result of the last server availability check, tagged with the inputs it answers.
  const [remote, setRemote] = useState<{ key: string; value: Availability } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Bumped after a successful save so the live check runs again for the same inputs.
  const [checkVersion, setCheckVersion] = useState(0);
  const [result, setResult] = useState<Result | null>(null);

  const car = useMemo(() => cars.find((c) => c.id === carId), [cars, carId]);

  // Client-side validation is derived, not stored.
  const requestKey = `${carId}|${start}|${startTime}|${end}|${endTime}`;
  const startAt = `${start}T${startTime}`;
  const endAt = `${end}T${endTime}`;
  const localProblem = !carId || !start || !end
    ? "idle"
    : startAt >= endAt
      ? "Return must be after pick-up."
      : start < today
        ? "Pick-up cannot be in the past."
        : null;

  const availability: Availability =
    localProblem === "idle"
      ? { state: "idle" }
      : localProblem
        ? { state: "invalid", message: localProblem }
        : remote?.key === requestKey
          ? remote.value
          : { state: "checking" };

  // Live availability check, debounced, whenever car, dates or times change.
  useEffect(() => {
    if (localProblem) return;
    const [cId, s, st, e, et] = requestKey.split("|");
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      let value: Availability;
      try {
        const params = new URLSearchParams({ carId: cId, start: s, startTime: st, end: e, endTime: et });
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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          carId,
          renterName,
          renterEmail,
          renterPhone,
          pickupLocation,
          notes,
          startDate: start,
          startTime,
          endDate: end,
          endTime,
        }),
      });
      const data = await res.json();
      if (res.status === 201) {
        setResult({
          kind: "success",
          message: `Booked ${data.booking.car.make} ${data.booking.car.model} for ${data.booking.renterName} · ${data.booking.totalPrice ? `$${data.booking.totalPrice}` : ""}`,
          flagReason: data.booking.flagReason ?? null,
        });
        setRenterName("");
        setRenterEmail("");
        setRenterPhone("");
        setNotes("");
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

      <div className="mt-4 grid gap-3">
        <label className="relative grid min-w-0 gap-1 text-sm">
          <span className={labelCls}>Car</span>
          <select suppressHydrationWarning value={carId} onChange={(e) => edit(setCarId)(e.target.value)} className={inputCls}>
            {cars.map((c) => (
              <option key={c.id} value={c.id}>
                {c.year} {c.make} {c.model} · {c.plate} · ${c.dailyRate}/day
              </option>
            ))}
          </select>
        </label>

        <label className="relative grid min-w-0 gap-1 text-sm">
          <span className={labelCls}>Renter name</span>
          <input
            suppressHydrationWarning
            autoComplete="off"
            data-lpignore="true"
            data-1p-ignore
            data-bwignore
            data-form-type="other"
            value={renterName}
            onChange={(e) => edit(setRenterName)(e.target.value)}
            placeholder="e.g. Maria Lopez"
            required
            className={inputCls}
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="relative grid min-w-0 gap-1 text-sm">
            <span className={labelCls}>Email</span>
            <input
              suppressHydrationWarning
              autoComplete="off"
              data-lpignore="true"
              data-1p-ignore
              data-bwignore
              data-form-type="other"
              type="email"
              value={renterEmail}
              onChange={(e) => edit(setRenterEmail)(e.target.value)}
              placeholder="maria@example.com"
              className={inputCls}
            />
          </label>
          <label className="relative grid min-w-0 gap-1 text-sm">
            <span className={labelCls}>Phone</span>
            <input
              suppressHydrationWarning
              autoComplete="off"
              data-lpignore="true"
              data-1p-ignore
              data-bwignore
              data-form-type="other"
              type="tel"
              value={renterPhone}
              onChange={(e) => edit(setRenterPhone)(e.target.value)}
              placeholder="+1 555 0100"
              className={inputCls}
            />
          </label>
        </div>

        <label className="relative grid min-w-0 gap-1 text-sm">
          <span className={labelCls}>Pick-up location</span>
          <select suppressHydrationWarning value={pickupLocation} onChange={(e) => edit(setPickupLocation)(e.target.value)} className={inputCls}>
            {PICKUP_LOCATIONS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-[1fr_110px] gap-3">
          <DatePicker
            label="Pick-up date"
            value={start}
            min={today}
            onChange={edit(setStart)}
            booked={car?.bookings ?? []}
          />
          <TimePicker label="Time" value={startTime} onChange={edit(setStartTime)} />
        </div>

        <div className="grid grid-cols-[1fr_110px] gap-3">
          <DatePicker
            label="Return date"
            value={end}
            min={start || today}
            onChange={edit(setEnd)}
            booked={car?.bookings ?? []}
          />
          <TimePicker label="Time" value={endTime} onChange={edit(setEndTime)} />
        </div>

        <AvailabilityBanner availability={availability} car={car} />

        <label className="relative grid min-w-0 gap-1 text-sm">
          <span className={labelCls}>Notes</span>
          <textarea
            suppressHydrationWarning
            value={notes}
            onChange={(e) => edit(setNotes)(e.target.value)}
            placeholder="Child seat, late arrival, anything the handover team should know"
            rows={2}
            className={inputCls}
          />
        </label>

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
