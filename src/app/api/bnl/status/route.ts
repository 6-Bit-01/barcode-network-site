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

interface BNLStatus {
  status: BNLStatusValue;
  mode: BNLModeValue;
  message: string;
  lastSeen: string | null;
}

const KEY = "bnl:status";
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

let memoryStatus: BNLStatus = { ...DEFAULT_STATUS };

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

export async function GET() {
  const redis = getRedis();

  if (redis) {
    const stored = await redis.get<unknown>(KEY);
    const resolved = sanitizeStoredStatus(stored);
    memoryStatus = resolved;
    return NextResponse.json(resolved);
  }

  return NextResponse.json(memoryStatus);
}

export async function POST(req: Request) {
  const expectedApiKey = process.env.BNL_API_KEY;
  const providedApiKey = req.headers.get("x-api-key");

  if (!expectedApiKey || providedApiKey !== expectedApiKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const allowedKeys = ["status", "mode", "message"];
    const bodyKeys = Object.keys(body);
    const hasOnlyAllowedKeys = bodyKeys.every((key) => allowedKeys.includes(key));

    if (!hasOnlyAllowedKeys) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const status = body.status;
    const mode = body.mode;
    const message = body.message;

    if (
      !ALLOWED_STATUS.has(status as BNLStatusValue) ||
      !ALLOWED_MODES.has(mode as BNLModeValue) ||
      typeof message !== "string"
    ) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const nextStatus: BNLStatus = {
      status: status as BNLStatusValue,
      mode: mode as BNLModeValue,
      message: message.trim().slice(0, 240),
      lastSeen: new Date().toISOString(),
    };

    const redis = getRedis();
    if (redis) await redis.set(KEY, nextStatus);
    memoryStatus = nextStatus;

    return NextResponse.json({ ok: true, status: nextStatus, persisted: Boolean(redis) });
  } catch (error) {
    console.error("[bnl/status] error:", error);
    return NextResponse.json({ error: "Failed to update status" }, { status: 500 });
  }
}
