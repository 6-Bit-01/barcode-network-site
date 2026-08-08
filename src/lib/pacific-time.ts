export const BARCODE_TIME_ZONE = "America/Los_Angeles";

export function pacificDateString(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BARCODE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function pacificClockLabel(iso: string | null | undefined, now = new Date()): string | null {
  if (!iso || !Number.isFinite(Date.parse(iso))) return null;
  const date = new Date(iso);
  const clock = new Intl.DateTimeFormat("en-US", { timeZone: BARCODE_TIME_ZONE, hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(date);
  const today = pacificDateString(now);
  const target = pacificDateString(date);
  if (target === today) return clock;
  const tomorrow = pacificDateString(new Date(now.getTime() + 24 * 60 * 60 * 1000));
  return target === tomorrow ? `${clock} tomorrow` : `${clock} · ${target}`;
}
