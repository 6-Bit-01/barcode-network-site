// Keep Redis-backed live surfaces responsive without allowing a single open
// browser/OBS source to consume the database's monthly command allowance.
export const LIVE_OVERLAY_POLL_INTERVAL_MS = 2_000;
export const FOREGROUND_OVERLAY_POLL_INTERVAL_MS = 5_000;
export const PUBLIC_QUEUE_POLL_INTERVAL_MS = 15_000;
export const ADMIN_QUEUE_POLL_INTERVAL_MS = 10_000;
export const SITE_LIVE_STATUS_POLL_INTERVAL_MS = 15_000;
export const REDIS_POLL_ERROR_RETRY_INTERVAL_MS = 30_000;
