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

  let manualOverride: string | null = null;
  let streamUrl = DEFAULT_URL;

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
  if (!redis) {
    return NextResponse.json({ error: "Redis not configured" }, { status: 503 });
  }

  try {
    const body = await req.json();
    const { action, streamUrl } = body;

    if (action === "toggle") {
      // Toggle: null → "1", "1" → "0", "0" → null (cycle: auto → on → off → auto)
      const current = await redis.get<string>(KEYS.live);
      if (current === null) {
        await redis.set(KEYS.live, "1");
      } else if (current === "1") {
        await redis.set(KEYS.live, "0");
      } else {
        await redis.del(KEYS.live);
      }
    } else if (action === "setLive") {
      await redis.set(KEYS.live, "1");
    } else if (action === "setOffline") {
      await redis.set(KEYS.live, "0");
    } else if (action === "auto") {
      await redis.del(KEYS.live);
    }

    if (streamUrl && typeof streamUrl === "string") {
      await redis.set(KEYS.url, streamUrl);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[admin/live] error:", error);
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}
