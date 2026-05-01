export const BROADCAST_TZ = "America/Los_Angeles";
export const BROADCAST_DAY_SHORT = "Fri";
export const BROADCAST_START_MINUTES = 18 * 60 + 40; // 6:40 PM PT
export const BROADCAST_END_MINUTES = 23 * 60; // 11:00 PM PT

export function isWithinBroadcastWindow(date = new Date()): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BROADCAST_TZ,
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(date);

  const weekday = parts.find((p) => p.type === "weekday")?.value;
  const hour = parseInt(parts.find((p) => p.type === "hour")?.value || "0", 10);
  const minute = parseInt(parts.find((p) => p.type === "minute")?.value || "0", 10);

  if (weekday !== BROADCAST_DAY_SHORT) return false;
  const t = hour * 60 + minute;
  return t >= BROADCAST_START_MINUTES && t < BROADCAST_END_MINUTES;
}
