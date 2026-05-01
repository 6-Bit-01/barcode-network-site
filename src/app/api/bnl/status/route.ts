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
type BNLSourceValue = "bot" | "startup" | "relay" | "heartbeat" | "showday" | "showtest" | "admin" | "reset" | "unknown";

interface BNLStatus {
  status: BNLStatusValue;
  mode: BNLModeValue;
  message: string;
  currentDirective: string;
  source: BNLSourceValue;
  lastSeen: string | null;
}

interface BNLHistoryEntry {
  timestamp: string;
  status: BNLStatusValue;
  mode: BNLModeValue;
  currentDirective?: string;
  message: string;
  source: BNLSourceValue;
  persisted?: boolean;
}

const KEY = "bnl:status";
const HISTORY_KEY = "bnl:history";
const MAX_MESSAGE_LENGTH = 600;
const DEFAULT_DIRECTIVE = "Monitoring Discord-side relay traffic.";
const DEFAULT_STATUS: BNLStatus = {
  status: "OFFLINE",
  mode: "STANDBY",
  message: "BNL-01 relay awaiting signal.",
  currentDirective: DEFAULT_DIRECTIVE,
  source: "unknown",
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
const ALLOWED_SOURCES = new Set<BNLSourceValue>(["bot", "startup", "relay", "heartbeat", "showday", "showtest", "admin", "reset", "unknown"]);

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
      ? record.message.trim().slice(0, MAX_MESSAGE_LENGTH)
      : DEFAULT_STATUS.message;
  const currentDirective =
    typeof record.currentDirective === "string" && record.currentDirective.trim().length > 0
      ? record.currentDirective.trim().slice(0, 160)
      : DEFAULT_STATUS.currentDirective;
  const source = ALLOWED_SOURCES.has(record.source as BNLSourceValue)
    ? (record.source as BNLSourceValue)
    : DEFAULT_STATUS.source;
  const lastSeen =
    typeof record.lastSeen === "string" && record.lastSeen.length > 0
      ? record.lastSeen
      : null;

  return { status, mode, message, currentDirective, source, lastSeen };
}

function sanitizeHistory(value: unknown): BNLHistoryEntry[] {
  if (!Array.isArray(value)) return [];
  const normalized: BNLHistoryEntry[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const status = ALLOWED_STATUS.has(rec.status as BNLStatusValue) ? (rec.status as BNLStatusValue) : null;
    const mode = ALLOWED_MODES.has(rec.mode as BNLModeValue) ? (rec.mode as BNLModeValue) : null;
    const source = ALLOWED_SOURCES.has(rec.source as BNLSourceValue)
      ? (rec.source as BNLSourceValue)
      : "unknown";
    const timestamp = typeof rec.timestamp === "string" && rec.timestamp ? rec.timestamp : null;
    const message = typeof rec.message === "string" ? rec.message.trim().slice(0, MAX_MESSAGE_LENGTH) : "";
    const currentDirective =
      typeof rec.currentDirective === "string" && rec.currentDirective.trim().length > 0
        ? rec.currentDirective.trim().slice(0, 160)
        : undefined;
    if (!status || !mode || !timestamp || !message) continue;
    normalized.push({ timestamp, status, mode, currentDirective, message, source });
  }
  return normalized.slice(0, 25);
}

function sameHistoryContent(a: BNLHistoryEntry, b: BNLHistoryEntry): boolean {
  return (
    a.status === b.status &&
    a.mode === b.mode &&
    a.source === b.source &&
    a.message === b.message &&
    (a.currentDirective ?? "") === (b.currentDirective ?? "")
  );
}

async function appendHistory(redis: Redis | null, entry: BNLHistoryEntry) {
  const current = redis ? sanitizeHistory(await redis.get<unknown>(HISTORY_KEY)) : memoryHistory;
  const latest = current[0];
  const nextHistory = latest && sameHistoryContent(latest, entry)
    ? current.slice(0, 25)
    : [entry, ...current].slice(0, 25);
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
    const allowedKeys = ["status", "mode", "message", "currentDirective", "source"];
    const bodyKeys = Object.keys(body);
    if (!bodyKeys.every((key) => allowedKeys.includes(key))) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const status = body.status;
    const mode = body.mode;
    const message = body.message;
    const currentDirective = body.currentDirective;
    const source = body.source;

    if (!ALLOWED_STATUS.has(status as BNLStatusValue) || !ALLOWED_MODES.has(mode as BNLModeValue) || typeof message !== "string") {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const trimmedMessage = message.trim();
    if (!trimmedMessage || trimmedMessage.length > MAX_MESSAGE_LENGTH) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    if (currentDirective !== undefined && (typeof currentDirective !== "string" || currentDirective.trim().length === 0 || currentDirective.trim().length > 160)) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    if (source !== undefined && (!ALLOWED_SOURCES.has(source as BNLSourceValue) || typeof source !== "string")) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const now = new Date().toISOString();
    const nextStatus: BNLStatus = {
      status: status as BNLStatusValue,
      mode: mode as BNLModeValue,
      message: trimmedMessage,
      currentDirective: typeof currentDirective === "string" ? currentDirective.trim() : DEFAULT_DIRECTIVE,
      source: typeof source === "string" && ALLOWED_SOURCES.has(source as BNLSourceValue) ? (source as BNLSourceValue) : "unknown",
      lastSeen: now,
    };

    const redis = getRedis();
    if (redis) await redis.set(KEY, nextStatus);
    memoryStatus = nextStatus;

    await appendHistory(redis, {
      timestamp: now,
      status: nextStatus.status,
      mode: nextStatus.mode,
      currentDirective: nextStatus.currentDirective,
      message: nextStatus.message,
      source: nextStatus.source,
      persisted: Boolean(redis),
    });

    return NextResponse.json({ ok: true, status: nextStatus, persisted: Boolean(redis) });
  } catch (error) {
    console.error("[bnl/status] error:", error);
    return NextResponse.json({ error: "Failed to update status" }, { status: 500 });
  }
}
