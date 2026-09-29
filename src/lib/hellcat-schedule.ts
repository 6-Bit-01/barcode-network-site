// The supplied schedule is NZST (fixed UTC+12), not seasonal NZDT.
// Saturday 14:45 NZST is Saturday 02:45 UTC.
export function nextHellcatContest(now: Date): Date {
  const next = new Date(now);
  next.setUTCHours(2, 45, 0, 0);
  next.setUTCDate(next.getUTCDate() + (6 - next.getUTCDay() + 7) % 7);
  if (next.getTime() < now.getTime()) next.setUTCDate(next.getUTCDate() + 7);
  return next;
}
