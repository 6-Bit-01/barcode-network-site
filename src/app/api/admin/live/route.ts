// GET  /api/admin/live — Read live status (public, polled by LiveStatusProvider)
// POST /api/admin/live — Update live status (admin-only, requires auth cookie)
//
// Redis keys:
//   stream:live  — "1" | "0" | null (null = use schedule)
//   stream:url   — string (defaults to TikTok live URL)

import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { verifyAdminToken, COOKIE_NAME } from "@/lib/auth";
import { isWithinBroadcastWindow } from "@/lib/broadcastSchedule";

export const dynamic = "force-dynamic";

const KEYS = {
  live: "stream:live",   // "1" (force on), "0" (force off), or absent (auto-schedule)
  url: "stream:url",
};

const DEFAULT_URL = "https://www.tiktok.com/@six.bit/live";
let memoryLiveOverride: string | null = null;
let memoryStreamUrl: string = DEFAULT_URL;

function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

// ---- GET: Read status (public) ----

export async function GET() {
  const redis = getRedis();
  const isScheduled = isWithinBroadcastWindow();

  let manualOverride: string | null = memoryLiveOverride;
  let streamUrl = memoryStreamUrl;

  if (redis) {
    const [liveVal, urlVal] = await Promise.all([
      redis.get<string>(KEYS.live),
      redis.get<string>(KEYS.url),
    ]);
    manualOverride = liveVal;
    if (urlVal) streamUrl = urlVal;
  }

  // Resolve: manual override wins, else schedule
  let isLive: boolean;
  if (manualOverride === "1") {
    isLive = true;
  } else if (manualOverride === "0") {
    isLive = false;
  } else {
    isLive = isScheduled;
  }

  return NextResponse.json({
    isLive,
    isScheduled,
    streamUrl,
    manualOverride: manualOverride !== null,
  });
}

// ---- POST: Update status (admin-only) ----

export async function POST(req: Request) {
  // Verify admin token
  const cookieHeader = req.headers.get("cookie") || "";
  const cookies = Object.fromEntries(
    cookieHeader.split(";").map((c) => {
      const [k, ...v] = c.trim().split("=");
      return [k, v.join("=")];
    })
  );
  const token = cookies[COOKIE_NAME];
  if (!token || !(await verifyAdminToken(token))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const redis = getRedis();

  try {
    const body = await req.json();
    const { action, streamUrl } = body;

    const getCurrent = async () =>
      redis ? await redis.get<string>(KEYS.live) : memoryLiveOverride;
    const setLive = async (value: "1" | "0" | null) => {
      if (redis) {
        if (value === null) await redis.del(KEYS.live);
        else await redis.set(KEYS.live, value);
      }
      memoryLiveOverride = value;
    };

    if (action === "toggle") {
      // Toggle: null → "1", "1" → "0", "0" → null (cycle: auto → on → off → auto)
      const current = await getCurrent();
      if (current === null) {
        await setLive("1");
      } else if (current === "1") {
        await setLive("0");
      } else {
        await setLive(null);
      }
    } else if (action === "setLive") {
      await setLive("1");
    } else if (action === "setOffline") {
      await setLive("0");
    } else if (action === "auto") {
      await setLive(null);
    }

    if (streamUrl && typeof streamUrl === "string") {
      if (redis) await redis.set(KEYS.url, streamUrl);
      memoryStreamUrl = streamUrl;
    }

    return NextResponse.json({ ok: true, persisted: Boolean(redis) });
  } catch (error) {
    console.error("[admin/live] error:", error);
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}
