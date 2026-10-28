"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import type { BookingForm as BookingFormType } from "./BookingForm";

/**
 * Renders the booking form on the client only.
 *
 * The form is interactive from the first paint anyway, and skipping its server
 * HTML means browser extensions that inject elements into inputs (password
 * managers, autofill helpers) can no longer cause React hydration mismatches.
 */
const BookingForm = dynamic(
  () => import("./BookingForm").then((m) => m.BookingForm),
  {
    ssr: false,
    loading: () => (
      <div className="h-[640px] animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800" />
    ),
  },
);

export function BookingFormClient(props: ComponentProps<typeof BookingFormType>) {
  return <BookingForm {...props} />;
}
