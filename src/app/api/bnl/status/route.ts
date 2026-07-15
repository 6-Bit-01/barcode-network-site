import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import {
  BNLContractConflictError,
  BNLContractValidationError,
  BNL_V1_HISTORY_KEY,
  BNL_V1_STATUS_KEY,
  BNL_V2_PRESENCE_KEY,
  BNL_V2_RELAY_CURRENT_KEY,
  BNL_V2_RELAY_HISTORY_KEY,
  appendV1HistoryEntry,
  buildCurrentView,
  errorStatus,
  isV2Envelope,
  parseV1Write,
  parseV2PresenceWrite,
  parseV2RelayWrite,
  decideRelayStorage,
  sanitizeRelayHistory,
  sanitizeStoredV1Status,
  sanitizeV1History,
  sanitizeStoredV2Relay,
  serializePublicCurrentView,
  v1HistoryEntryFromStatus,
  type BNLV1HistoryEntry,
  type BNLV1Status,
} from "@/lib/bnl-presence-relay-contract";

export const dynamic = "force-dynamic";

let memoryStatus: BNLV1Status = sanitizeStoredV1Status(null);
let memoryHistory: BNLV1HistoryEntry[] = [];
let memoryPresence: unknown = null;
let memoryRelay: unknown = null;
let memoryRelayHistory: unknown[] = [];

function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

async function appendHistory(redis: Redis | null, entry: BNLV1HistoryEntry) {
  const current = redis ? sanitizeV1History(await redis.get<unknown>(BNL_V1_HISTORY_KEY)) : memoryHistory;
  const nextHistory = appendV1HistoryEntry(current, entry);
  if (redis) await redis.set(BNL_V1_HISTORY_KEY, nextHistory);
  memoryHistory = nextHistory;
}

export async function GET() {
  const redis = getRedis();
  const [v1, presence, relay] = redis
    ? await Promise.all([
        redis.get<unknown>(BNL_V1_STATUS_KEY),
        redis.get<unknown>(BNL_V2_PRESENCE_KEY),
        redis.get<unknown>(BNL_V2_RELAY_CURRENT_KEY),
      ])
    : [memoryStatus, memoryPresence, memoryRelay];
  const view = buildCurrentView({ v1, presence, relay, persisted: Boolean(redis) });
  memoryStatus = sanitizeStoredV1Status(v1);
  memoryPresence = presence;
  memoryRelay = relay;
  return NextResponse.json(serializePublicCurrentView(view));
}

export async function POST(req: Request) {
  const expectedApiKey = process.env.BNL_API_KEY;
  const providedApiKey = req.headers.get("x-api-key");
  if (!expectedApiKey || providedApiKey !== expectedApiKey) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json().catch(() => { throw new BNLContractValidationError(); });
    const now = new Date().toISOString();
    const redis = getRedis();

    if (isV2Envelope(body)) {
      if ((body as Record<string, unknown>).kind === "presence") {
        const presence = parseV2PresenceWrite(body, now);
        if (redis) await redis.set(BNL_V2_PRESENCE_KEY, presence);
        memoryPresence = presence;
        return NextResponse.json({ ok: true, presence, persisted: Boolean(redis) });
      }

      const relay = parseV2RelayWrite(body, now);
      const currentHistory = redis ? sanitizeRelayHistory(await redis.get<unknown>(BNL_V2_RELAY_HISTORY_KEY)) : sanitizeRelayHistory(memoryRelayHistory);
      const currentRelay = redis ? sanitizeStoredV2Relay(await redis.get<unknown>(BNL_V2_RELAY_CURRENT_KEY)) : sanitizeStoredV2Relay(memoryRelay);
      const decision = decideRelayStorage({ current: currentRelay, history: currentHistory, relay });
      if (decision.action === "conflict") throw new BNLContractConflictError();
      if (decision.action === "insert") {
        if (redis) {
          await redis.multi().set(BNL_V2_RELAY_CURRENT_KEY, decision.relay).set(BNL_V2_RELAY_HISTORY_KEY, decision.history).exec();
        }
        memoryRelay = decision.relay;
        memoryRelayHistory = decision.history;
      }
      return NextResponse.json({ ok: true, relay: decision.relay, idempotent: decision.action === "idempotent", persisted: Boolean(redis) });
    }

    const nextStatus = parseV1Write(body, now);
    if (redis) await redis.set(BNL_V1_STATUS_KEY, nextStatus);
    memoryStatus = nextStatus;
    await appendHistory(redis, v1HistoryEntryFromStatus(nextStatus, now, Boolean(redis)));
    return NextResponse.json({ ok: true, status: nextStatus, persisted: Boolean(redis) });
  } catch (error) {
    console.error("[bnl/status] error:", error);
    const status = errorStatus(error);
    return NextResponse.json({ error: error instanceof BNLContractConflictError ? "Relay ID conflict" : status === 400 ? "Invalid payload" : "Failed to update status" }, { status });
  }
}
