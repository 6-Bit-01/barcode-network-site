// Keep Redis-backed live surfaces responsive without allowing a single open
// browser/OBS source to consume the database's monthly command allowance.
// These receivers display events that exist for only 2.2-3 seconds. Keep the
// Keep the transient live receiver subsecond, the visual cue receiver at 1 Hz,
// and the foreground receiver at two polls per 3 seconds.
export const LIVE_OVERLAY_POLL_INTERVAL_MS = 650;
export const FOREGROUND_OVERLAY_POLL_INTERVAL_MS = 1_500;
export const RADIO_VISUALS_ACTIVE_POLL_INTERVAL_MS = 1_000;
export const RADIO_VISUALS_STANDBY_POLL_INTERVAL_MS = 15_000;
export const WHEEL_OVERLAY_ACTIVE_POLL_INTERVAL_MS = 1_000;
export const WHEEL_OVERLAY_SHOW_IDLE_POLL_INTERVAL_MS = 2_000;
export const WHEEL_OVERLAY_STANDBY_POLL_INTERVAL_MS = 15_000;
export const PUBLIC_QUEUE_POLL_INTERVAL_MS = 10_000;
export const ADMIN_QUEUE_POLL_INTERVAL_MS = 10_000;
export const SITE_LIVE_STATUS_POLL_INTERVAL_MS = 15_000;
