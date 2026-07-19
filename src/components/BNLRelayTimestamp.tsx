"use client";

import { useSyncExternalStore } from "react";

const subscribeToHydration = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

function tryFormatTransmissionTime(
  value: string,
  timeZone?: string,
): string | null {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;

  try {
    return new Intl.DateTimeFormat("en-US", {
      ...(timeZone ? { timeZone } : {}),
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZoneName: "short",
    }).format(parsed);
  } catch {
    return null;
  }
}

export function formatTransmissionTime(
  value: string,
  timeZone?: string,
): string {
  return tryFormatTransmissionTime(value, timeZone) ?? "Time unavailable";
}

export function BNLRelayTimestamp({ value }: { value: string }) {
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    getClientSnapshot,
    getServerSnapshot,
  );
  const utcFallback = formatTransmissionTime(value, "UTC");
  const localTime = hydrated ? tryFormatTransmissionTime(value) : null;

  return <time dateTime={value}>{localTime ?? utcFallback}</time>;
}
