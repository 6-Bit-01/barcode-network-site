import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";

export const dynamic = "force-dynamic";

type BNLFlags = {
  websiteRelayEnabled: boolean;
  showdayDiscordPostsEnabled: boolean;
  heartbeatEnabled: boolean;
};

const FLAGS_KEY = "bnl:flags";
const DEFAULT_FLAGS: BNLFlags = {
  websiteRelayEnabled: true,
  showdayDiscordPostsEnabled: true,
  heartbeatEnabled: true,
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
  };
}

function isAuthorized(req: Request): boolean {
  const expectedApiKey = process.env.BNL_API_KEY;
  const providedApiKey = req.headers.get("x-api-key");
  return Boolean(expectedApiKey && providedApiKey === expectedApiKey);
}

export async function GET() {
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
    const allowedKeys = ["websiteRelayEnabled", "showdayDiscordPostsEnabled", "heartbeatEnabled"];
    const keys = Object.keys(body);
    if (!keys.every((key) => allowedKeys.includes(key))) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    if (
      typeof body.websiteRelayEnabled !== "boolean" ||
      typeof body.showdayDiscordPostsEnabled !== "boolean" ||
      typeof body.heartbeatEnabled !== "boolean"
    ) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const nextFlags: BNLFlags = {
      websiteRelayEnabled: body.websiteRelayEnabled,
      showdayDiscordPostsEnabled: body.showdayDiscordPostsEnabled,
      heartbeatEnabled: body.heartbeatEnabled,
    };

    const redis = getRedis();
    if (redis) await redis.set(FLAGS_KEY, nextFlags);
    memoryFlags = nextFlags;

    return NextResponse.json({ ok: true, flags: nextFlags, persisted: Boolean(redis) });
  } catch (error) {
    console.error("[bnl/status/control-flags] error:", error);
    return NextResponse.json({ error: "Failed to update control flags" }, { status: 500 });
  }
}
