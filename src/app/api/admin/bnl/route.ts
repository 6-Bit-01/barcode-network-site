import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { verifyAdminToken, COOKIE_NAME } from "@/lib/auth";

export const dynamic = "force-dynamic";

type BNLStatusValue = "ONLINE" | "OFFLINE";
type BNLModeValue = "STANDBY" | "OBSERVATION" | "ACTIVE_LIAISON" | "SIGNAL_DEGRADATION" | "RESTRICTED";
type BNLSourceValue = "bot" | "startup" | "relay" | "heartbeat" | "showday" | "showtest" | "admin" | "reset" | "unknown";

type BNLFlags = {
  websiteRelayEnabled: boolean;
  showdayDiscordPostsEnabled: boolean;
  heartbeatEnabled: boolean;
};

const STATUS_KEY = "bnl:status";
const HISTORY_KEY = "bnl:history";
const FLAGS_KEY = "bnl:flags";

const DEFAULT_FLAGS: BNLFlags = {
  websiteRelayEnabled: true,
  showdayDiscordPostsEnabled: true,
  heartbeatEnabled: true,
};

const ALLOWED_STATUS = new Set<BNLStatusValue>(["ONLINE", "OFFLINE"]);
const ALLOWED_MODES = new Set<BNLModeValue>(["STANDBY", "OBSERVATION", "ACTIVE_LIAISON", "SIGNAL_DEGRADATION", "RESTRICTED"]);

let memoryHistory: Array<{ timestamp: string; status: BNLStatusValue; mode: BNLModeValue; currentDirective?: string; message: string; source: BNLSourceValue; persisted?: boolean }> = [];
let memoryFlags: BNLFlags = { ...DEFAULT_FLAGS };

function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

async function isAuthenticated(req: Request): Promise<boolean> {
  const cookieHeader = req.headers.get("cookie") || "";
  const cookies = Object.fromEntries(cookieHeader.split(";").map((c) => {
    const [k, ...v] = c.trim().split("=");
    return [k, v.join("=")];
  }));
  const token = cookies[COOKIE_NAME];
  return Boolean(token && (await verifyAdminToken(token)));
}

function sanitizeHistory(value: unknown): typeof memoryHistory {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const rec = item as Record<string, unknown>;
      if (!ALLOWED_STATUS.has(rec.status as BNLStatusValue) || !ALLOWED_MODES.has(rec.mode as BNLModeValue)) return null;
      if (typeof rec.timestamp !== "string" || typeof rec.message !== "string") return null;
      const source = rec.source as BNLSourceValue;
      return {
        timestamp: rec.timestamp,
        status: rec.status as BNLStatusValue,
        mode: rec.mode as BNLModeValue,
        currentDirective: typeof rec.currentDirective === "string" ? rec.currentDirective.trim().slice(0, 160) : undefined,
        message: rec.message.trim().slice(0, 240),
        source: source === "bot" || source === "startup" || source === "relay" || source === "heartbeat" || source === "showday" || source === "showtest" || source === "admin" || source === "reset" ? source : "unknown",
        persisted: typeof rec.persisted === "boolean" ? rec.persisted : undefined,
      };
    })
    .filter((item): item is (typeof memoryHistory)[number] => Boolean(item))
    .slice(0, 25);
}

function sanitizeFlags(value: unknown): BNLFlags {
  if (!value || typeof value !== "object") return { ...DEFAULT_FLAGS };
  const record = value as Record<string, unknown>;
  return {
    websiteRelayEnabled: typeof record.websiteRelayEnabled === "boolean" ? record.websiteRelayEnabled : DEFAULT_FLAGS.websiteRelayEnabled,
    showdayDiscordPostsEnabled: typeof record.showdayDiscordPostsEnabled === "boolean" ? record.showdayDiscordPostsEnabled : DEFAULT_FLAGS.showdayDiscordPostsEnabled,
    heartbeatEnabled: typeof record.heartbeatEnabled === "boolean" ? record.heartbeatEnabled : DEFAULT_FLAGS.heartbeatEnabled,
  };
}

export async function GET(req: Request) {
  if (!(await isAuthenticated(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const redis = getRedis();
  let status: unknown = null;
  let history = memoryHistory;
  let flags = memoryFlags;

  if (redis) {
    const [s, h, f] = await Promise.all([
      redis.get<unknown>(STATUS_KEY),
      redis.get<unknown>(HISTORY_KEY),
      redis.get<unknown>(FLAGS_KEY),
    ]);
    status = s;
    history = sanitizeHistory(h) as typeof memoryHistory;
    flags = sanitizeFlags(f);
    memoryHistory = history;
    memoryFlags = flags;
  }

  return NextResponse.json({ status, history, flags, persisted: Boolean(redis) });
}

export async function POST(req: Request) {
  if (!(await isAuthenticated(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const action = body.action;
    const redis = getRedis();

    if (action === "updateStatus" || action === "resetStandby") {
      const status = action === "resetStandby" ? "ONLINE" : body.status;
      const mode = action === "resetStandby" ? "OBSERVATION" : body.mode;
      const message = action === "resetStandby"
        ? "BNL-01 relay standing by. Discord-side signal monitoring active."
        : body.message;

      if (!ALLOWED_STATUS.has(status as BNLStatusValue) || !ALLOWED_MODES.has(mode as BNLModeValue) || typeof message !== "string") {
        return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
      }

      const trimmedMessage = message.trim().slice(0, 240);
      if (!trimmedMessage) return NextResponse.json({ error: "Message required" }, { status: 400 });

      const now = new Date().toISOString();
      const nextStatus = {
        status: status as BNLStatusValue,
        mode: mode as BNLModeValue,
        message: trimmedMessage,
        currentDirective: action === "resetStandby" ? "Monitoring Discord-side relay traffic." : undefined,
        source: action === "resetStandby" ? "reset" : "admin",
        lastSeen: now,
      };
      const nextEntry: (typeof memoryHistory)[number] = {
        timestamp: now,
        status: status as BNLStatusValue,
        mode: mode as BNLModeValue,
        currentDirective: nextStatus.currentDirective,
        message: trimmedMessage,
        source: action === "resetStandby" ? "reset" : "admin",
        persisted: Boolean(redis),
      };

      if (redis) {
        const priorHistory = sanitizeHistory(await redis.get<unknown>(HISTORY_KEY)) as typeof memoryHistory;
        await redis.set(STATUS_KEY, nextStatus);
        await redis.set(HISTORY_KEY, [nextEntry, ...priorHistory].slice(0, 25));
      } else {
        memoryHistory = [nextEntry, ...memoryHistory].slice(0, 25);
      }

      return NextResponse.json({ ok: true, status: nextStatus, persisted: Boolean(redis) });
    }

    if (action === "clearHistory") {
      if (redis) await redis.set(HISTORY_KEY, []);
      memoryHistory = [];
      return NextResponse.json({ ok: true, cleared: true, persisted: Boolean(redis) });
    }

    if (action === "updateFlags") {
      const rawFlags = body.flags;
      if (!rawFlags || typeof rawFlags !== "object") {
        return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
      }
      const rec = rawFlags as Record<string, unknown>;
      const allowedKeys = ["websiteRelayEnabled", "showdayDiscordPostsEnabled", "heartbeatEnabled"];
      const keys = Object.keys(rec);
      if (!keys.every((key) => allowedKeys.includes(key))) {
        return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
      }

      const nextFlags: BNLFlags = {
        websiteRelayEnabled: Boolean(rec.websiteRelayEnabled),
        showdayDiscordPostsEnabled: Boolean(rec.showdayDiscordPostsEnabled),
        heartbeatEnabled: Boolean(rec.heartbeatEnabled),
      };

      if (redis) await redis.set(FLAGS_KEY, nextFlags);
      memoryFlags = nextFlags;
      return NextResponse.json({ ok: true, flags: nextFlags, persisted: Boolean(redis) });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("[admin/bnl] error:", error);
    return NextResponse.json({ error: "Failed to update BNL controls" }, { status: 500 });
  }
}
