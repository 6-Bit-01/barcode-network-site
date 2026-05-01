import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";

export const dynamic = "force-dynamic";

type BNLCheckInControlFlags = {
  requestImmediateCheckIn: boolean;
  requestedAt: string | null;
  consumedAt: string | null;
  lastConsumedAt: string | null;
};

const FLAGS_KEY = "bnl:flags";

function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

function asIsoOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function sanitizeCheckInFlags(value: unknown): BNLCheckInControlFlags {
  if (!value || typeof value !== "object") {
    return {
      requestImmediateCheckIn: false,
      requestedAt: null,
      consumedAt: null,
      lastConsumedAt: null,
    };
  }

  const record = value as Record<string, unknown>;
  const consumedAt = asIsoOrNull(record.consumedAt);
  const lastConsumedAt = asIsoOrNull(record.lastConsumedAt);

  return {
    requestImmediateCheckIn: typeof record.requestImmediateCheckIn === "boolean" ? record.requestImmediateCheckIn : false,
    requestedAt: asIsoOrNull(record.requestedAt),
    consumedAt,
    lastConsumedAt: lastConsumedAt ?? consumedAt,
  };
}

export async function GET() {
  const redis = getRedis();

  if (redis) {
    const storedFlags = await redis.get<unknown>(FLAGS_KEY);
    const flags = sanitizeCheckInFlags(storedFlags);
    return NextResponse.json({ ...flags, persisted: true });
  }

  const flags = sanitizeCheckInFlags(null);
  return NextResponse.json({ ...flags, persisted: false });
}
