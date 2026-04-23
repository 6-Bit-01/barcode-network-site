// ============================================================
// BARCODE STREAM ENGINE — API Client
// ============================================================
// Communicates with the BARCODE Network website API for queue
// state, track advancement, live status, and heartbeat.
// ============================================================

const API_URL = process.env.BARCODE_API_URL || "https://barcode-network.com";
const API_KEY = process.env.QUEUE_API_KEY || "";

/**
 * Fetch the current queue state
 * @returns {Promise<{nowPlaying: object|null, queue: object[], history: object[], totalPlayed: number}>}
 */
export async function getQueueState() {
  const res = await fetch(`${API_URL}/api/queue`);
  if (!res.ok) throw new Error(`Queue API ${res.status}`);
  return res.json();
}

/**
 * Advance to the next track in the queue
 * @returns {Promise<{message: string, nowPlaying: object|null}>}
 */
export async function advanceTrack() {
  const res = await fetch(`${API_URL}/api/queue/next`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Advance failed: ${res.status}`);
  return data;
}

/**
 * Update live status
 * @param {"on"|"off"|"auto"} override
 * @param {string} [streamUrl]
 */
export async function setLiveStatus(override, streamUrl) {
  // This requires admin auth, but we can also use the API key approach
  // For the stream engine, we'll use a direct Redis update via a new endpoint
  const body = { override };
  if (streamUrl) body.streamUrl = streamUrl;

  const res = await fetch(`${API_URL}/api/stream-engine/heartbeat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Heartbeat failed: ${res.status}`);
  }
  return res.json();
}

/**
 * Send a heartbeat to indicate the stream engine is alive
 * @param {object} status
 * @param {string} status.scene - Current OBS scene
 * @param {boolean} status.obsConnected - Whether OBS is connected
 * @param {boolean} status.streaming - Whether OBS is actively streaming
 * @param {string|null} status.currentTrack - Current track identifier
 * @param {number} status.uptime - Engine uptime in seconds
 */
export async function sendHeartbeat(status) {
  const res = await fetch(`${API_URL}/api/stream-engine/heartbeat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
    },
    body: JSON.stringify({ type: "heartbeat", ...status }),
  });
  if (!res.ok) {
    // Don't throw on heartbeat failure — just log
    console.warn("[API] Heartbeat failed:", res.status);
    return null;
  }
  return res.json();
}