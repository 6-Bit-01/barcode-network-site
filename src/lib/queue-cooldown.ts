export function cooldownDeadlineFromRemaining(remainingSeconds: number, nowMs = Date.now()): number {
  const safeSeconds = Number.isFinite(remainingSeconds) ? Math.max(0, Math.ceil(remainingSeconds)) : 0;
  return nowMs + safeSeconds * 1000;
}

export function cooldownRemainingFromDeadline(deadlineMs: number, nowMs = Date.now()): number {
  if (!Number.isFinite(deadlineMs) || deadlineMs <= nowMs) return 0;
  return Math.max(0, Math.ceil((deadlineMs - nowMs) / 1000));
}
