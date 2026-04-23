// ============================================================
// BARCODE NETWORK — Queue Cutoff Utility
// ============================================================
// Paid request submissions close at 11 PM PST nightly.
// Queue resets at midnight PST.
// ============================================================

const TIMEZONE = "America/Los_Angeles";
const CUTOFF_HOUR = 23; // 11 PM PST

/**
 * Check if the current time is past the 11 PM PST cutoff.
 * Returns true if paid submissions should be blocked.
 */
export function isPastCutoff(): boolean {
  const hourStr = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    hour: "numeric",
    hour12: false,
  }).format(new Date());

  return parseInt(hourStr, 10) >= CUTOFF_HOUR;
}

/**
 * Get detailed cutoff status for API responses and UI display.
 */
export function getCutoffStatus(): {
  isCutoff: boolean;
  message: string;
  currentTimePST: string;
  cutoffTime: string;
  resetTime: string;
} {
  const now = new Date();
  const isCutoff = isPastCutoff();

  const currentTimePST = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(now);

  return {
    isCutoff,
    message: isCutoff
      ? "Paid submissions are closed for today. Queue resets at midnight PST."
      : "Submissions are open.",
    currentTimePST,
    cutoffTime: "11:00 PM PST",
    resetTime: "12:00 AM PST",
  };
}