export const BROADCAST_TZ = "America/Los_Angeles";
export const BROADCAST_DAY_SHORT = "Fri";
export const BROADCAST_START_MINUTES = 18 * 60 + 40; // 6:40 PM PT
export const BROADCAST_END_MINUTES = 23 * 60; // 11:00 PM PT

function pacificParts(date: Date): Record<string, number> {
  return Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: BROADCAST_TZ, year: "numeric", month: "numeric", day: "numeric",
    hour: "numeric", minute: "numeric", second: "numeric", hourCycle: "h23",
  }).formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
}

function scheduledTime(day: Date, text: string): Date {
  const match = text.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) throw new Error("Invalid broadcast schedule time");
  const hour = Number(match[1]) % 12 + (match[3].toUpperCase() === "PM" ? 12 : 0);
  const wall = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hour, Number(match[2]));
  let instant = wall;
  for (let step = 0; step < 2; step++) {
    const p = pacificParts(new Date(instant));
    instant += wall - Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  }
  return new Date(instant);
}

/** Planned times only; never establishes live or intake status. Resolves DST on the show date. */
export function nextBroadcastSchedule(now: Date, times: { queueOpens: string; showBegins: string; firstTrack: string }) {
  const p = pacificParts(now);
  const day = new Date(Date.UTC(p.year, p.month - 1, p.day));
  day.setUTCDate(day.getUTCDate() + (5 - day.getUTCDay() + 7) % 7);
  if (scheduledTime(day, times.showBegins).getTime() <= now.getTime()) day.setUTCDate(day.getUTCDate() + 7);
  return {
    queue: scheduledTime(day, times.queueOpens),
    show: scheduledTime(day, times.showBegins),
    first: scheduledTime(day, times.firstTrack),
  };
}

export function broadcastCountdown(milliseconds: number): string {
  const minutes = Math.max(0, Math.ceil(milliseconds / 60_000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor(minutes % 1440 / 60);
  return `${days ? `${days}d ` : ""}${hours}h ${minutes % 60}m`;
}

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
