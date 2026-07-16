import { NextResponse } from "next/server";
import {
  BNLContractConflictError,
  BNLContractValidationError,
  errorStatus,
  isV2Envelope,
  parseV1Write,
  parseV2PresenceWrite,
  parseV2RelayWrite,
} from "@/lib/bnl-presence-relay-contract";
import {
  BNL_NO_STORE_HEADERS,
  getBNLRedis,
  resolveBNLCurrentView,
  writeBNLPresence,
  writeBNLRelay,
  writeLegacyBNLStatus,
} from "@/lib/bnl-status-store";
import { serializePublicCurrentView } from "@/lib/bnl-presence-relay-contract";

export const dynamic = "force-dynamic";

export async function GET() {
  const view = await resolveBNLCurrentView();
  return NextResponse.json(serializePublicCurrentView(view), { headers: BNL_NO_STORE_HEADERS });
}

export async function POST(req: Request) {
  const expectedApiKey = process.env.BNL_API_KEY;
  const providedApiKey = req.headers.get("x-api-key");
  if (!expectedApiKey || providedApiKey !== expectedApiKey) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: BNL_NO_STORE_HEADERS });

  try {
    const body = await req.json().catch(() => { throw new BNLContractValidationError(); });
    const now = new Date().toISOString();
    const redis = getBNLRedis();

    if (isV2Envelope(body)) {
      if ((body as Record<string, unknown>).kind === "presence") {
        const presence = parseV2PresenceWrite(body, now);
        await writeBNLPresence(presence, redis);
        return NextResponse.json({ ok: true, presence, persisted: Boolean(redis) }, { headers: BNL_NO_STORE_HEADERS });
      }

      const relay = parseV2RelayWrite(body, now);
      const decision = await writeBNLRelay(relay, redis);
      if (decision.action === "conflict") throw new BNLContractConflictError();
      return NextResponse.json({ ok: true, relay: decision.relay, idempotent: decision.action === "idempotent", persisted: Boolean(redis) }, { headers: BNL_NO_STORE_HEADERS });
    }

    const nextStatus = parseV1Write(body, now);
    await writeLegacyBNLStatus(nextStatus, redis);
    return NextResponse.json({ ok: true, status: nextStatus, persisted: Boolean(redis) }, { headers: BNL_NO_STORE_HEADERS });
  } catch (error) {
    console.error("[bnl/status] error:", error);
    const status = errorStatus(error);
    return NextResponse.json({ error: error instanceof BNLContractConflictError ? "Relay ID conflict" : status === 400 ? "Invalid payload" : "Failed to update status" }, { status, headers: BNL_NO_STORE_HEADERS });
  }
}
