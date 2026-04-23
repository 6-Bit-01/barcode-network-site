// ============================================================
// QUEUE OPERATIONS — Upstash Redis
// ============================================================
// Uses sorted sets for priority ordering.
// Falls back to in-memory store when Redis is not configured.
// ============================================================

import { Redis } from "@upstash/redis";
import { QueueEntry, QueueState, TIERS, generateQueueId } from "./queue-types";
import type { QueueTier } from "./queue-types";

// --------------- Redis client ---------------

function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

// Redis keys
const KEYS = {
  queue: "queue:entries",       // sorted set: score = priority*1e13 + (1e13 - timestamp)
  nowPlaying: "queue:current",  // string (JSON)
  history: "queue:history",     // list (JSON entries, most recent first)
  totalPlayed: "queue:played",  // counter
  streamStatus: "queue:status", // string: "online" | "offline"
  entry: (id: string) => `queue:entry:${id}`, // hash
};

// --------------- In-memory fallback (dev) ---------------

const mem: {
  entries: QueueEntry[];
  nowPlaying: QueueEntry | null;
  history: QueueEntry[];
  totalPlayed: number;
  streamStatus: "online" | "offline";
} = {
  entries: [],
  nowPlaying: null,
  history: [],
  totalPlayed: 0,
  streamStatus: "offline",
};

// --------------- Priority score ---------------

function priorityScore(tier: QueueTier, createdAt: string): number {
  const tierWeight = TIERS[tier].priority;
  const ts = new Date(createdAt).getTime();
  // Higher tier = higher score. Within same tier, earlier = higher score.
  return tierWeight * 1e13 + (1e13 - ts);
}

// --------------- Public API ---------------

/** Add a confirmed entry to the queue */
export async function addToQueue(entry: Omit<QueueEntry, "id" | "status" | "playedAt">): Promise<QueueEntry> {
  const full: QueueEntry = {
    ...entry,
    id: generateQueueId(),
    status: "queued",
    playedAt: null,
  };

  const redis = getRedis();
  if (redis) {
    const score = priorityScore(full.tier, full.createdAt);
    await redis.zadd(KEYS.queue, { score, member: JSON.stringify(full) });
    await redis.set(KEYS.entry(full.id), JSON.stringify(full));
  } else {
    mem.entries.push(full);
    // Sort: higher priority first, then earlier timestamp
    mem.entries.sort((a, b) => priorityScore(b.tier, b.createdAt) - priorityScore(a.tier, a.createdAt));
  }

  return full;
}

/** Get the full queue state */
export async function getQueueState(): Promise<QueueState> {
  const redis = getRedis();

  if (redis) {
    const [queueRaw, nowPlayingRaw, historyRaw, totalPlayed, streamStatus] = await Promise.all([
      redis.zrange(KEYS.queue, 0, -1, { rev: true }),
      redis.get<string>(KEYS.nowPlaying),
      redis.lrange(KEYS.history, 0, 19), // last 20
      redis.get<number>(KEYS.totalPlayed),
      redis.get<string>(KEYS.streamStatus),
    ]);

    const queue: QueueEntry[] = (queueRaw as string[]).map((raw) =>
      typeof raw === "string" ? JSON.parse(raw) : raw
    );

    const nowPlaying: QueueEntry | null = nowPlayingRaw
      ? (typeof nowPlayingRaw === "string" ? JSON.parse(nowPlayingRaw) : nowPlayingRaw)
      : null;

    const history: QueueEntry[] = (historyRaw as string[]).map((raw) =>
      typeof raw === "string" ? JSON.parse(raw) : raw
    );

    return {
      nowPlaying,
      queue,
      history,
      totalPlayed: totalPlayed ?? 0,
      streamStatus: (streamStatus as "online" | "offline") ?? "offline",
    };
  }

  // In-memory fallback
  return {
    nowPlaying: mem.nowPlaying,
    queue: [...mem.entries],
    history: mem.history.slice(0, 20),
    totalPlayed: mem.totalPlayed,
    streamStatus: mem.streamStatus,
  };
}

/** Advance: move current to history, pop next from queue */
export async function advanceQueue(): Promise<QueueEntry | null> {
  const redis = getRedis();

  if (redis) {
    // Move current to history
    const currentRaw = await redis.get<string>(KEYS.nowPlaying);
    if (currentRaw) {
      const current: QueueEntry = typeof currentRaw === "string" ? JSON.parse(currentRaw) : currentRaw;
      current.status = "played";
      current.playedAt = new Date().toISOString();
      await redis.lpush(KEYS.history, JSON.stringify(current));
      await redis.ltrim(KEYS.history, 0, 99); // keep last 100
      await redis.incr(KEYS.totalPlayed);
      await redis.del(KEYS.entry(current.id));
    }

    // Pop highest priority entry
    const top = await redis.zrange(KEYS.queue, -1, -1);
    if (!top || top.length === 0) {
      await redis.del(KEYS.nowPlaying);
      return null;
    }

    const nextRaw = top[0] as string;
    const next: QueueEntry = typeof nextRaw === "string" ? JSON.parse(nextRaw) : nextRaw;
    next.status = "playing";

    // Remove from sorted set and set as now playing
    await redis.zrem(KEYS.queue, nextRaw);
    await redis.set(KEYS.nowPlaying, JSON.stringify(next));
    await redis.set(KEYS.entry(next.id), JSON.stringify(next));

    return next;
  }

  // In-memory fallback
  if (mem.nowPlaying) {
    mem.nowPlaying.status = "played";
    mem.nowPlaying.playedAt = new Date().toISOString();
    mem.history.unshift(mem.nowPlaying);
    if (mem.history.length > 100) mem.history.pop();
    mem.totalPlayed++;
  }

  const next = mem.entries.shift() ?? null;
  if (next) next.status = "playing";
  mem.nowPlaying = next;
  return next;
}

/** Reset the queue (nightly). Refunds/carries over paid entries. */
export async function resetQueue(): Promise<{ cleared: number; preserved: number }> {
  const redis = getRedis();

  if (redis) {
    const allRaw = await redis.zrange(KEYS.queue, 0, -1);
    const entries: QueueEntry[] = (allRaw as string[]).map((raw) =>
      typeof raw === "string" ? JSON.parse(raw) : raw
    );

    // Paid entries that haven't played get preserved (carry-over)
    const paid = entries.filter((e) => e.amount > 0);
    const free = entries.filter((e) => e.amount === 0);

    // Clear the queue
    await redis.del(KEYS.queue);
    await redis.del(KEYS.nowPlaying);

    // Re-add paid entries
    if (paid.length > 0) {
      for (const e of paid) {
        await redis.zadd(KEYS.queue, {
          score: priorityScore(e.tier, e.createdAt),
          member: JSON.stringify(e),
        });
      }
    }

    return { cleared: free.length, preserved: paid.length };
  }

  // In-memory
  const paid = mem.entries.filter((e) => e.amount > 0);
  const cleared = mem.entries.length - paid.length;
  mem.entries = paid;
  mem.nowPlaying = null;
  return { cleared, preserved: paid.length };
}

/** Set stream status */
export async function setStreamStatus(status: "online" | "offline"): Promise<void> {
  const redis = getRedis();
  if (redis) {
    await redis.set(KEYS.streamStatus, status);
  } else {
    mem.streamStatus = status;
  }
}

/** Get a single entry by ID */
export async function getEntry(id: string): Promise<QueueEntry | null> {
  const redis = getRedis();
  if (redis) {
    const raw = await redis.get<string>(KEYS.entry(id));
    if (!raw) return null;
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  }
  const found = mem.entries.find((e) => e.id === id);
  if (found) return found;
  if (mem.nowPlaying?.id === id) return mem.nowPlaying;
  return null;
}

/** Upgrade an existing queue entry to a higher tier */
export async function upgradeEntryTier(id: string, newTier: QueueTier, additionalAmount: number): Promise<QueueEntry | null> {
  const redis = getRedis();

  if (redis) {
    // Find the entry in the sorted set
    const allRaw = await redis.zrange(KEYS.queue, 0, -1, { rev: true });
    let found: QueueEntry | null = null;
    let foundRaw: string | null = null;

    for (const raw of allRaw as string[]) {
      const entry: QueueEntry = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (entry.id === id) {
        found = entry;
        foundRaw = typeof raw === "string" ? raw : JSON.stringify(raw);
        break;
      }
    }

    if (!found || !foundRaw) return null;

    // Remove old entry from sorted set
    await redis.zrem(KEYS.queue, foundRaw);

    // Update tier and amount
    found.tier = newTier;
    found.amount += additionalAmount;

    // Re-add with new priority score
    const score = priorityScore(found.tier, found.createdAt);
    await redis.zadd(KEYS.queue, { score, member: JSON.stringify(found) });
    await redis.set(KEYS.entry(found.id), JSON.stringify(found));

    return found;
  }

  // In-memory fallback
  const idx = mem.entries.findIndex((e) => e.id === id);
  if (idx === -1) return null;

  mem.entries[idx].tier = newTier;
  mem.entries[idx].amount += additionalAmount;
  mem.entries.sort((a, b) => priorityScore(b.tier, b.createdAt) - priorityScore(a.tier, a.createdAt));

  return mem.entries[idx];
}

// --------------- Stripe session dedup ---------------

const STRIPE_KEY = (sessionId: string) => `queue:stripe:${sessionId}`;

/** Check if a Stripe session has already been processed */
export async function isStripeSessionProcessed(sessionId: string): Promise<boolean> {
  const redis = getRedis();
  if (redis) {
    const exists = await redis.exists(STRIPE_KEY(sessionId));
    return exists === 1;
  }
  // In-memory: check entries + nowPlaying + history
  return (
    mem.entries.some((e) => e.stripeSessionId === sessionId) ||
    mem.nowPlaying?.stripeSessionId === sessionId ||
    mem.history.some((e) => e.stripeSessionId === sessionId)
  );
}

/** Mark a Stripe session as processed (with 48h TTL) */
export async function markStripeSessionProcessed(sessionId: string): Promise<void> {
  const redis = getRedis();
  if (redis) {
    await redis.set(STRIPE_KEY(sessionId), "1", { ex: 172800 }); // 48h TTL
  }
  // In-memory: no-op (dedup handled by isStripeSessionProcessed check)
}