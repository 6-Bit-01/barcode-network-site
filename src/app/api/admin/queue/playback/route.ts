import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { COOKIE_NAME, verifyAdminToken } from "@/lib/auth";
import { getLiveOverlayPlayerSync, getStoredLiveOverlayState } from "@/lib/live-overlay";
import { getRadioQueueState, recordQueuePlaybackEvent } from "@/lib/queue";
import { buildQueuePlaybackDiagnosticExport } from "@/lib/queue-playback-diagnostics";
import { attachQueueLiveTiming } from "@/lib/queue-live-timing";
import type { QueuePlaybackErrorCode, QueuePlaybackLifecycleEventType, QueuePlaybackProvider } from "@/lib/queue-types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CLIENT_EVENT_TYPES = new Set<QueuePlaybackLifecycleEventType>(["ready", "play", "pause", "stall", "resume", "seek", "ended", "error"]);
const PROVIDERS = new Set<QueuePlaybackProvider>(["audio", "youtube", "tiktok", "external"]);
const ERROR_CODES = new Set<QueuePlaybackErrorCode>(["media_aborted", "network_error", "decode_error", "source_unsupported", "provider_error", "ready_timeout", "sync_error", "unknown"]);

async function assertAdmin(): Promise<boolean> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  return token ? verifyAdminToken(token) : false;
}

function optionalNumber(value: unknown): number | null | undefined {
  if (value === null || value === undefined) return null;
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export async function POST(req: Request) {
  if (!(await assertAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const trackId = typeof body.trackId === "string" ? body.trackId.trim() : "";
  const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : null;
  const provider = body.provider as QueuePlaybackProvider;
  const eventType = body.eventType as QueuePlaybackLifecycleEventType;
  const errorCode = body.errorCode as QueuePlaybackErrorCode | null | undefined;
  if (!trackId || !PROVIDERS.has(provider) || !CLIENT_EVENT_TYPES.has(eventType) || (errorCode && !ERROR_CODES.has(errorCode))) {
    return NextResponse.json({ error: "Invalid playback event." }, { status: 400 });
  }
  const values = {
    currentTimeSeconds: optionalNumber(body.currentTimeSeconds),
    durationSeconds: optionalNumber(body.durationSeconds),
    readyState: optionalNumber(body.readyState),
    networkState: optionalNumber(body.networkState),
  };
  if (Object.values(values).some((value) => value === undefined)) return NextResponse.json({ error: "Invalid playback event." }, { status: 400 });

  const receipt = await recordQueuePlaybackEvent({
    sessionId,
    trackId,
    provider,
    eventType,
    ...values,
    errorCode: errorCode ?? null,
  });
  return NextResponse.json(receipt, { status: receipt.accepted ? 202 : receipt.reason === "track_not_loaded" ? 409 : 400 });
}

export async function GET(req: Request) {
  if (!(await assertAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sessionId = new URL(req.url).searchParams.get("sessionId") ?? undefined;
  const now = new Date();
  const [state, playerSync, overlayState] = await Promise.all([
    getRadioQueueState(sessionId),
    getLiveOverlayPlayerSync(),
    getStoredLiveOverlayState(),
  ]);
  const stateWithLiveTiming = state.isCurrentSession === false ? state : attachQueueLiveTiming(state, playerSync, overlayState, now);
  const exported = buildQueuePlaybackDiagnosticExport(stateWithLiveTiming, now);
  const filenameDate = state.session?.showDate?.replace(/[^0-9-]/g, "") || now.toISOString().slice(0, 10);
  return NextResponse.json(exported, {
    headers: {
      "cache-control": "private, no-store",
      "content-disposition": `attachment; filename="barcode-radio-playback-${filenameDate}.json"`,
      "x-content-type-options": "nosniff",
    },
  });
}
