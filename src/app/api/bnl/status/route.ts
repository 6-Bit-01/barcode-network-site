import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";

export const dynamic = "force-dynamic";

type BNLStatusValue = "ONLINE" | "OFFLINE";
type BNLModeValue =
  | "STANDBY"
  | "OBSERVATION"
  | "ACTIVE_LIAISON"
  | "SIGNAL_DEGRADATION"
  | "RESTRICTED";
type BNLSourceValue = "bot" | "admin" | "showtest" | "heartbeat" | "unknown";

interface BNLStatus {
  status: BNLStatusValue;
  mode: BNLModeValue;
  message: string;
  lastSeen: string | null;
}

interface BNLHistoryEntry {
  timestamp: string;
  status: BNLStatusValue;
  mode: BNLModeValue;
  message: string;
  source: BNLSourceValue;
}

const KEY = "bnl:status";
const HISTORY_KEY = "bnl:history";
const DEFAULT_STATUS: BNLStatus = {
  status: "OFFLINE",
  mode: "STANDBY",
  message: "BNL-01 relay awaiting signal.",
  lastSeen: null,
};

const ALLOWED_STATUS = new Set<BNLStatusValue>(["ONLINE", "OFFLINE"]);
const ALLOWED_MODES = new Set<BNLModeValue>([
  "STANDBY",
  "OBSERVATION",
  "ACTIVE_LIAISON",
  "SIGNAL_DEGRADATION",
  "RESTRICTED",
]);
const ALLOWED_SOURCES = new Set<BNLSourceValue>(["bot", "admin", "showtest", "heartbeat", "unknown"]);

let memoryStatus: BNLStatus = { ...DEFAULT_STATUS };
let memoryHistory: BNLHistoryEntry[] = [];

function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

function sanitizeStoredStatus(value: unknown): BNLStatus {
  if (!value || typeof value !== "object") return { ...DEFAULT_STATUS };

  const record = value as Record<string, unknown>;
  const status = ALLOWED_STATUS.has(record.status as BNLStatusValue)
    ? (record.status as BNLStatusValue)
    : DEFAULT_STATUS.status;
  const mode = ALLOWED_MODES.has(record.mode as BNLModeValue)
    ? (record.mode as BNLModeValue)
    : DEFAULT_STATUS.mode;
  const message =
    typeof record.message === "string" && record.message.trim().length > 0
      ? record.message.trim().slice(0, 240)
      : DEFAULT_STATUS.message;
  const lastSeen =
    typeof record.lastSeen === "string" && record.lastSeen.length > 0
      ? record.lastSeen
      : null;

  return { status, mode, message, lastSeen };
}

function sanitizeHistory(value: unknown): BNLHistoryEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const rec = item as Record<string, unknown>;
      const status = ALLOWED_STATUS.has(rec.status as BNLStatusValue) ? (rec.status as BNLStatusValue) : null;
      const mode = ALLOWED_MODES.has(rec.mode as BNLModeValue) ? (rec.mode as BNLModeValue) : null;
      const source = ALLOWED_SOURCES.has(rec.source as BNLSourceValue)
        ? (rec.source as BNLSourceValue)
        : "unknown";
      const timestamp = typeof rec.timestamp === "string" && rec.timestamp ? rec.timestamp : null;
      const message = typeof rec.message === "string" ? rec.message.trim().slice(0, 240) : "";
      if (!status || !mode || !timestamp || !message) return null;
      return { timestamp, status, mode, message, source };
    })
    .filter((entry): entry is BNLHistoryEntry => Boolean(entry))
    .slice(0, 10);
}

async function appendHistory(redis: Redis | null, entry: BNLHistoryEntry) {
  const current = redis ? sanitizeHistory(await redis.get<unknown>(HISTORY_KEY)) : memoryHistory;
  const nextHistory = [entry, ...current].slice(0, 10);
  if (redis) await redis.set(HISTORY_KEY, nextHistory);
  memoryHistory = nextHistory;
}

export async function GET() {
  const redis = getRedis();

  if (redis) {
    const stored = await redis.get<unknown>(KEY);
    const resolved = sanitizeStoredStatus(stored);
    memoryStatus = resolved;
    return NextResponse.json({ ...resolved, persisted: true });
  }

  return NextResponse.json({ ...memoryStatus, persisted: false });
}

export async function POST(req: Request) {
  const expectedApiKey = process.env.BNL_API_KEY;
  const providedApiKey = req.headers.get("x-api-key");

  if (!expectedApiKey || providedApiKey !== expectedApiKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const allowedKeys = ["status", "mode", "message", "source"];
    const bodyKeys = Object.keys(body);
    const hasOnlyAllowedKeys = bodyKeys.every((key) => allowedKeys.includes(key));

    if (!hasOnlyAllowedKeys) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const status = body.status;
    const mode = body.mode;
    const message = body.message;
    const source = body.source;

    if (
      !ALLOWED_STATUS.has(status as BNLStatusValue) ||
      !ALLOWED_MODES.has(mode as BNLModeValue) ||
      typeof message !== "string" ||
      (source !== undefined && !ALLOWED_SOURCES.has(source as BNLSourceValue))
    ) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const now = new Date().toISOString();
    const trimmedMessage = message.trim().slice(0, 240);
    const nextStatus: BNLStatus = {
      status: status as BNLStatusValue,
      mode: mode as BNLModeValue,
      message: trimmedMessage,
      lastSeen: now,
    };

    const redis = getRedis();
    if (redis) await redis.set(KEY, nextStatus);
    memoryStatus = nextStatus;

    await appendHistory(redis, {
      timestamp: now,
      status: nextStatus.status,
      mode: nextStatus.mode,
      message: nextStatus.message,
      source: ALLOWED_SOURCES.has(source as BNLSourceValue) ? (source as BNLSourceValue) : "unknown",
    });

    return NextResponse.json({ ok: true, status: nextStatus, persisted: Boolean(redis) });
  } catch (error) {
    console.error("[bnl/status] error:", error);
    return NextResponse.json({ error: "Failed to update status" }, { status: 500 });
  }
}
