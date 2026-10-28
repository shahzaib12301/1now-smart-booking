import { formatRange, formatRangeWithTime, toDateOnly } from "@/lib/availability";

export interface TimelineBooking {
  id: string;
  renterName: string;
  startDate: string; // ISO
  endDate: string; // ISO
  totalPrice: number;
  flagged: boolean;
  flagReason: string | null;
  renterEmail?: string | null;
  renterPhone?: string | null;
  pickupLocation?: string | null;
  notes?: string | null;
}

export interface TimelineCar {
  id: string;
  make: string;
  model: string;
  year: number;
  plate: string;
  dailyRate: number;
  color: string | null;
  status: string;
  bookings: TimelineBooking[];
}

const DAY_MS = 86_400_000;
/** Width of one day column in pixels. Fixed so bar labels always have room. */
const DAY_PX = 56;
const LABEL_PX = 224;

interface Props {
  cars: TimelineCar[];
  /** First day shown on the timeline (UTC midnight). */
  windowStart: Date;
  /** Number of days to show. */
  windowDays: number;
  /** Today (UTC midnight), for the marker line. */
  today: Date;
}

export function FleetTimeline({ cars, windowStart, windowDays, today }: Props) {
  const windowEnd = new Date(windowStart.getTime() + windowDays * DAY_MS);
  const trackWidth = windowDays * DAY_PX;
  const days = Array.from({ length: windowDays }, (_, i) => {
    return new Date(windowStart.getTime() + i * DAY_MS);
  });

  /** Pixel offset of a date from the left edge of the track, clamped to the window. */
  const px = (d: Date) => {
    const raw = ((d.getTime() - windowStart.getTime()) / DAY_MS) * DAY_PX;
    return Math.min(trackWidth, Math.max(0, raw));
  };
  const todayPx = px(today);

  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div style={{ width: LABEL_PX + trackWidth }}>
        {/* Header row: day ticks */}
        <div className="flex border-b border-zinc-200 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
          <div
            className="sticky left-0 z-10 shrink-0 bg-white px-4 py-2 font-medium dark:bg-zinc-900"
            style={{ width: LABEL_PX }}
          >
            Car
          </div>
          <div className="flex shrink-0" style={{ width: trackWidth }}>
            {days.map((d) => {
              const isToday = d.getTime() === today.getTime();
              const isMonthStart =
                d.getUTCDate() === 1 || d.getTime() === windowStart.getTime();
              return (
                <div
                  key={d.toISOString()}
                  className={`shrink-0 whitespace-nowrap border-l border-zinc-100 py-2 text-center dark:border-zinc-800 ${
                    isToday ? "font-semibold text-emerald-600 dark:text-emerald-400" : ""
                  }`}
                  style={{ width: DAY_PX }}
                  title={toDateOnly(d)}
                >
                  {isMonthStart ? (
                    <span className="mr-1 text-[10px] uppercase tracking-wide">
                      {d.toLocaleDateString("en-US", { timeZone: "UTC", month: "short" })}
                    </span>
                  ) : null}
                  {d.getUTCDate()}
                </div>
              );
            })}
          </div>
        </div>

        {cars.map((car) => (
          <div
            key={car.id}
            className="flex border-b border-zinc-100 last:border-b-0 dark:border-zinc-800"
          >
            <div
              className="sticky left-0 z-10 shrink-0 bg-white px-4 py-3 dark:bg-zinc-900"
              style={{ width: LABEL_PX }}
            >
              <div className="flex items-center gap-2">
                <span
                  className="inline-block h-3 w-3 shrink-0 rounded-full border border-black/20 ring-1 ring-white/40"
                  style={{ backgroundColor: car.color ?? "#999" }}
                  aria-hidden
                />
                <span className="truncate font-medium text-zinc-900 dark:text-zinc-50">
                  {car.make} {car.model}
                </span>
              </div>
              <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                {car.year} · {car.plate} · ${car.dailyRate}/day
              </div>
              <div className="mt-1 flex items-center gap-2 text-[11px]">
                <StatusPill status={car.status} />
                <a
                  href={`/api/cars/${car.id}/calendar.ics`}
                  className="text-zinc-500 underline-offset-2 hover:underline dark:text-zinc-400"
                  title="iCal feed for calendar sync (e.g. Turo)"
                >
                  .ics
                </a>
              </div>
            </div>

            <div className="relative shrink-0" style={{ width: trackWidth }}>
              {/* day grid */}
              <div className="absolute inset-0 flex">
                {days.map((d) => (
                  <div
                    key={d.toISOString()}
                    className="shrink-0 border-l border-zinc-100 dark:border-zinc-800"
                    style={{ width: DAY_PX }}
                  />
                ))}
              </div>
              {/* today marker */}
              {todayPx > 0 && todayPx < trackWidth ? (
                <div
                  className="absolute inset-y-0 w-px bg-emerald-500/70"
                  style={{ left: todayPx }}
                  aria-hidden
                />
              ) : null}
              {/* booking bars */}
              <div className="relative h-full min-h-[92px]">
                {car.bookings
                  .filter(
                    (b) =>
                      new Date(b.endDate) > windowStart &&
                      new Date(b.startDate) < windowEnd,
                  )
                  .map((b) => {
                    const s = new Date(b.startDate);
                    const e = new Date(b.endDate);
                    const left = px(s);
                    const width = px(e) - left;
                    const label = formatRange({ startDate: s, endDate: e });
                    return (
                      <div
                        key={b.id}
                        className={`absolute top-1/2 flex -translate-y-1/2 flex-col justify-center overflow-hidden rounded-md px-2 text-white shadow-sm ${
                          b.flagged ? "bg-amber-500" : "bg-sky-600"
                        }`}
                        style={{ left: left + 2, width: width - 4, height: 44 }}
                        title={[
                          `${b.renterName} · ${formatRangeWithTime({ startDate: s, endDate: e })} · ${b.totalPrice}`,
                          b.pickupLocation ? `Pick-up: ${b.pickupLocation}` : null,
                          b.renterPhone ? `Phone: ${b.renterPhone}` : null,
                          b.renterEmail ? `Email: ${b.renterEmail}` : null,
                          b.notes ? `Notes: ${b.notes}` : null,
                          b.flagged ? `⚠ ${b.flagReason}` : null,
                        ]
                          .filter(Boolean)
                          .join(String.fromCharCode(10))}
                      >
                        <span className="block truncate text-[11px] font-medium leading-4">
                          {b.flagged ? "⚠ " : ""}
                          {b.renterName}
                        </span>
                        <span className="block truncate text-[10px] leading-4 opacity-90">
                          {label}
                        </span>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const styles =
    status === "ACTIVE"
      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
      : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300";
  return (
    <span className={`rounded-full px-2 py-0.5 font-medium ${styles}`}>
      {status === "ACTIVE" ? "Active" : "In service"}
    </span>
  );
}
