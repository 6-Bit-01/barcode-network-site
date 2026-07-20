"use client";

import { useSyncExternalStore } from "react";

const subscribeToHydration = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

function tryFormatJournalDate(
  value: string,
  timeZone?: string,
): string | null {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;

  try {
    return new Intl.DateTimeFormat("en-US", {
      ...(timeZone ? { timeZone } : {}),
      month: "long",
      day: "numeric",
      year: "numeric",
    }).format(parsed);
  } catch {
    return null;
  }
}

export function formatJournalDate(value: string, timeZone?: string): string {
  return tryFormatJournalDate(value, timeZone) ?? "Date unavailable";
}

export function JournalDate({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    getClientSnapshot,
    getServerSnapshot,
  );
  const utcFallback = formatJournalDate(value, "UTC");
  const localDate = hydrated ? tryFormatJournalDate(value) : null;

  return (
    <time className={className} dateTime={value}>
      {localDate ?? utcFallback}
    </time>
  );
}
