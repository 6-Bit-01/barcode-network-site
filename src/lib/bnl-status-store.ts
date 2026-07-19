import { Redis } from "@upstash/redis";
import {
  BNL_V1_HISTORY_KEY,
  BNL_V1_STATUS_KEY,
  BNL_V2_PRESENCE_KEY,
  BNL_V2_RELAY_CURRENT_KEY,
  BNL_V2_RELAY_HISTORY_KEY,
  DEFAULT_STATUS,
  appendV1HistoryEntry,
  buildCurrentView,
  decideRelayStorage,
  sanitizeRelayHistory,
  sanitizeStoredV1Status,
  sanitizeStoredV2Relay,
  sanitizeStoredV2Presence,
  sanitizeV1History,
  serializePublicCurrentView,
  serializePublicRelayHistory,
  v1HistoryEntryFromStatus,
  type BNLCurrentView,
  type BNLV1HistoryEntry,
  type BNLV1Status,
  type BNLV2PresenceRecord,
  type BNLV2RelayRecord,
  type BNLPublicRelayHistoryEntry,
} from "@/lib/bnl-presence-relay-contract";

export const BNL_NO_STORE_HEADERS = { "Cache-Control": "no-store, no-cache, must-revalidate" };

let memoryStatus: BNLV1Status = { ...DEFAULT_STATUS };
let memoryHistory: BNLV1HistoryEntry[] = [];
let memoryPresence: BNLV2PresenceRecord | null = null;
let memoryRelay: BNLV2RelayRecord | null = null;
let memoryRelayHistory: BNLV2RelayRecord[] = [];

export function getBNLRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

export async function resolveBNLCurrentView(redis = getBNLRedis()): Promise<BNLCurrentView> {
  const [v1, presence, relay] = redis
    ? await Promise.all([
        redis.get<unknown>(BNL_V1_STATUS_KEY),
        redis.get<unknown>(BNL_V2_PRESENCE_KEY),
        redis.get<unknown>(BNL_V2_RELAY_CURRENT_KEY),
      ])
    : [memoryStatus, memoryPresence, memoryRelay];
  const view = buildCurrentView({ v1, presence, relay, persisted: Boolean(redis) });
  memoryStatus = sanitizeStoredV1Status(v1);
  memoryPresence = sanitizeStoredV2Presence(presence);
  memoryRelay = sanitizeStoredV2Relay(relay);
  return view;
}

export async function readBNLAdminState(redis = getBNLRedis()) {
  const view = await resolveBNLCurrentView(redis);
  const [v2History, legacyHistory] = redis
    ? await Promise.all([redis.get<unknown>(BNL_V2_RELAY_HISTORY_KEY), redis.get<unknown>(BNL_V1_HISTORY_KEY)])
    : [memoryRelayHistory, memoryHistory];
  memoryRelayHistory = sanitizeRelayHistory(v2History);
  memoryHistory = sanitizeV1History(legacyHistory);
  return {
    status: serializePublicCurrentView(view),
    history: memoryRelayHistory,
    legacyHistory: memoryHistory,
    persisted: Boolean(redis),
  };
}

export type BNLPublicRelayHistoryResult =
  | {
      ok: true;
      value: BNLPublicRelayHistoryEntry[];
      persisted: boolean;
    }
  | {
      ok: false;
      value: [];
      persisted: boolean;
      unavailable: true;
    };

export async function listBNLPublicRelayHistory(
  redis?: Redis | null,
): Promise<BNLPublicRelayHistoryResult> {
  let persisted = false;
  try {
    const relayRedis = redis === undefined ? getBNLRedis() : redis;
    persisted = Boolean(relayRedis);
    const stored = relayRedis
      ? await relayRedis.get<unknown>(BNL_V2_RELAY_HISTORY_KEY)
      : memoryRelayHistory;
    memoryRelayHistory = sanitizeRelayHistory(stored);
    return {
      ok: true,
      value: serializePublicRelayHistory(memoryRelayHistory),
      persisted,
    };
  } catch {
    return {
      ok: false,
      value: [],
      persisted,
      unavailable: true,
    };
  }
}

export async function appendLegacyBNLHistory(entry: BNLV1HistoryEntry, redis = getBNLRedis()) {
  const current = redis ? sanitizeV1History(await redis.get<unknown>(BNL_V1_HISTORY_KEY)) : memoryHistory;
  const nextHistory = appendV1HistoryEntry(current, entry);
  if (redis) await redis.set(BNL_V1_HISTORY_KEY, nextHistory);
  memoryHistory = nextHistory;
}

export async function writeLegacyBNLStatus(status: BNLV1Status, redis = getBNLRedis()) {
  if (redis) await redis.set(BNL_V1_STATUS_KEY, status);
  memoryStatus = status;
  await appendLegacyBNLHistory(v1HistoryEntryFromStatus(status, status.lastSeen ?? new Date().toISOString(), Boolean(redis)), redis);
}

export async function writeBNLPresence(presence: BNLV2PresenceRecord, redis = getBNLRedis()) {
  if (redis) await redis.set(BNL_V2_PRESENCE_KEY, presence);
  memoryPresence = presence;
}

export async function writeBNLRelay(relay: BNLV2RelayRecord, redis = getBNLRedis()) {
  const currentHistory = redis ? sanitizeRelayHistory(await redis.get<unknown>(BNL_V2_RELAY_HISTORY_KEY)) : memoryRelayHistory;
  const currentRelay = redis ? sanitizeStoredV2Relay(await redis.get<unknown>(BNL_V2_RELAY_CURRENT_KEY)) : memoryRelay;
  const decision = decideRelayStorage({ current: currentRelay, history: currentHistory, relay });
  if (decision.action === "conflict") return decision;
  if (decision.action === "insert") {
    if (redis) await redis.multi().set(BNL_V2_RELAY_CURRENT_KEY, decision.relay).set(BNL_V2_RELAY_HISTORY_KEY, decision.history).exec();
    memoryRelay = decision.relay;
    memoryRelayHistory = decision.history;
  }
  return decision;
}

export async function clearLegacyBNLHistory(redis = getBNLRedis()) {
  if (redis) await redis.set(BNL_V1_HISTORY_KEY, []);
  memoryHistory = [];
}
