// ============================================================
// BARCODE DISCORD BOT — API Client
// ============================================================
// Fetches data from the BARCODE Network website API.
// ============================================================

const API_URL = process.env.BARCODE_API_URL || "https://barcode-network.com";
const API_KEY = process.env.QUEUE_API_KEY || "";

/**
 * Fetch the current queue state (public, no auth needed)
 * @returns {Promise<{nowPlaying: object|null, queue: object[], history: object[], totalPlayed: number, streamStatus: string}>}
 */
export async function getQueueState() {
  const res = await fetch(`${API_URL}/api/queue`);
  if (!res.ok) throw new Error(`Queue API error: ${res.status}`);
  return res.json();
}

/**
 * Submit a free entry to the queue
 * @param {string} artist
 * @param {string} title
 * @param {string} link
 * @returns {Promise<{entry: object}>}
 */
export async function submitFreeEntry(artist, title, link) {
  const res = await fetch(`${API_URL}/api/queue/free`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ artist, title, link }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Submit failed: ${res.status}`);
  return data;
}

/**
 * Advance to next track (requires API key)
 * @returns {Promise<object>}
 */
export async function skipTrack() {
  const res = await fetch(`${API_URL}/api/queue/next`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Skip failed: ${res.status}`);
  return data;
}

/**
 * Get live status
 * @returns {Promise<{isLive: boolean, isScheduled: boolean, streamUrl: string, manualOverride: boolean}>}
 */
export async function getLiveStatus() {
  const res = await fetch(`${API_URL}/api/admin/live`);
  if (!res.ok) throw new Error(`Live status error: ${res.status}`);
  return res.json();
}

// Tier display config
export const TIER_INFO = {
  free:     { name: "Free",      emoji: "⚪", color: 0x666666 },
  featured: { name: "Featured",  emoji: "🟢", color: 0x00ff88 },
  fastlane: { name: "Fast Lane", emoji: "🟡", color: 0xffaa00 },
  frontrow: { name: "Front Row", emoji: "🔴", color: 0xff4444 },
  // Legacy tier names (Redis migration)
  expedited: { name: "Featured", emoji: "🟢", color: 0x00ff88 },
  priority:  { name: "Fast Lane", emoji: "🟡", color: 0xffaa00 },
  vip:       { name: "Front Row", emoji: "🔴", color: 0xff4444 },
};