import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { mergeBNLFlagsAtomic, type JournalControlRedis } from "@/lib/bnl-journal-control-store";

export const dynamic = "force-dynamic";

type BNLFlags = {
  websiteRelayEnabled: boolean;
  showdayDiscordPostsEnabled: boolean;
  heartbeatEnabled: boolean;
  journalAutoPublishEnabled: boolean;
  journalDailyEnabled: boolean;
  journalWeeklyEnabled: boolean;
};

const FLAGS_KEY = "bnl:flags";
const DEFAULT_FLAGS: BNLFlags = {
  websiteRelayEnabled: true,
  showdayDiscordPostsEnabled: true,
  heartbeatEnabled: true,
  journalAutoPublishEnabled: true,
  journalDailyEnabled: true,
  journalWeeklyEnabled: true,
};

let memoryFlags: BNLFlags = { ...DEFAULT_FLAGS };

function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

function sanitizeFlags(value: unknown): BNLFlags {
  if (!value || typeof value !== "object") return { ...DEFAULT_FLAGS };
  const record = value as Record<string, unknown>;
  return {
    websiteRelayEnabled: typeof record.websiteRelayEnabled === "boolean" ? record.websiteRelayEnabled : DEFAULT_FLAGS.websiteRelayEnabled,
    showdayDiscordPostsEnabled: typeof record.showdayDiscordPostsEnabled === "boolean" ? record.showdayDiscordPostsEnabled : DEFAULT_FLAGS.showdayDiscordPostsEnabled,
    heartbeatEnabled: typeof record.heartbeatEnabled === "boolean" ? record.heartbeatEnabled : DEFAULT_FLAGS.heartbeatEnabled,
    journalAutoPublishEnabled: typeof record.journalAutoPublishEnabled === "boolean" ? record.journalAutoPublishEnabled : DEFAULT_FLAGS.journalAutoPublishEnabled,
    journalDailyEnabled: typeof record.journalDailyEnabled === "boolean" ? record.journalDailyEnabled : DEFAULT_FLAGS.journalDailyEnabled,
    journalWeeklyEnabled: typeof record.journalWeeklyEnabled === "boolean" ? record.journalWeeklyEnabled : DEFAULT_FLAGS.journalWeeklyEnabled,
  };
}

function isAuthorized(req: Request): boolean {
  const expectedApiKey = process.env.BNL_API_KEY;
  const providedApiKey = req.headers.get("x-api-key");
  return Boolean(expectedApiKey && providedApiKey === expectedApiKey);
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const redis = getRedis();

  if (redis) {
    const storedFlags = await redis.get<unknown>(FLAGS_KEY);
    const resolved = sanitizeFlags(storedFlags);
    memoryFlags = resolved;
    return NextResponse.json({ ...resolved, persisted: true });
  }

  return NextResponse.json({ ...memoryFlags, persisted: false });
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as Record<string, unknown>;
    // Journal automation flags are intentionally read-only on this legacy
    // endpoint. Their mutations require the Redis-only Journal control plane.
    const allowedKeys = ["websiteRelayEnabled", "showdayDiscordPostsEnabled", "heartbeatEnabled"];
    const keys = Object.keys(body);
    if (keys.length === 0 || !keys.every((key) => allowedKeys.includes(key))) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    if (!keys.every((key) => typeof body[key] === "boolean")) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const redis = getRedis();
    const nextFlags = redis
      ? sanitizeFlags(
          await mergeBNLFlagsAtomic(
            body,
            redis as unknown as JournalControlRedis,
          ),
        )
      : sanitizeFlags({ ...memoryFlags, ...body });
    memoryFlags = nextFlags;

    return NextResponse.json({ ok: true, flags: nextFlags, persisted: Boolean(redis) });
  } catch (error) {
    console.error("[bnl/status/control-flags] error:", error);
    return NextResponse.json({ error: "Failed to update control flags" }, { status: 500 });
  }
}
