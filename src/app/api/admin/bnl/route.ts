import { NextResponse } from "next/server";
import { verifyAdminToken, COOKIE_NAME } from "@/lib/auth";
import {
  isPendingForcePull,
  normalizePendingForcePullStatus,
  pollForcePullStatus,
  resumeForcePullAttempt,
  sanitizeStoredForcePullAttempt,
  storeForcePullAttempt,
  type StoredForcePullAttempt,
} from "@/lib/bnl-force-pull";
import { BNL_NO_STORE_HEADERS, clearLegacyBNLHistory, getBNLRedis, readBNLAdminState, writeBNLPresence, writeBNLRelay } from "@/lib/bnl-status-store";
import { parseV2RelayWrite, type BNLV2PresenceRecord } from "@/lib/bnl-presence-relay-contract";

export const dynamic = "force-dynamic";

type BNLStatusValue = "ONLINE" | "OFFLINE";
type BNLModeValue = "STANDBY" | "OBSERVATION" | "ACTIVE_LIAISON" | "SIGNAL_DEGRADATION" | "RESTRICTED";
type BNLFlags = {
  websiteRelayEnabled: boolean;
  showdayDiscordPostsEnabled: boolean;
  heartbeatEnabled: boolean;
};

const FLAGS_KEY = "bnl:flags";
const FORCE_PULL_KEY = "bnl:force_pull_requested_at";
const FORCE_PULL_ATTEMPT_KEY = "bnl:force_pull_latest_attempt";
const MAX_MESSAGE_LENGTH = 600;
const MAX_DIRECTIVE_LENGTH = 800;

const DEFAULT_FLAGS: BNLFlags = {
  websiteRelayEnabled: true,
  showdayDiscordPostsEnabled: true,
  heartbeatEnabled: true,
};



const ALLOWED_STATUS = new Set<BNLStatusValue>(["ONLINE", "OFFLINE"]);
const ALLOWED_MODES = new Set<BNLModeValue>(["STANDBY", "OBSERVATION", "ACTIVE_LIAISON", "SIGNAL_DEGRADATION", "RESTRICTED"]);

let memoryFlags: BNLFlags = { ...DEFAULT_FLAGS };
let memoryForcePullAttempt: StoredForcePullAttempt | null = null;

async function isAuthenticated(req: Request): Promise<boolean> {
  const cookieHeader = req.headers.get("cookie") || "";
  const cookies = Object.fromEntries(cookieHeader.split(";").map((c) => {
    const [k, ...v] = c.trim().split("=");
    return [k, v.join("=")];
  }));
  const token = cookies[COOKIE_NAME];
  return Boolean(token && (await verifyAdminToken(token)));
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

async function notifyForcePull(now: string): Promise<StoredForcePullAttempt & { delivered: boolean; httpStatus?: number }> {
  const webhookUrl = process.env.BNL_FORCE_PULL_WEBHOOK_URL;
  if (!webhookUrl) return { requestedAt: now, requestId: null, status: "delivery_failed", delivered: false, reason: "Immediate check-in relay is not configured." };
  const sharedSecret = process.env.BNL_FORCE_PULL_SHARED_SECRET || "";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(webhookUrl, { method: "POST", headers: { "Content-Type": "application/json", ...(sharedSecret ? { "x-bnl-secret": sharedSecret } : {}) }, body: JSON.stringify({ action: "forcePull", requestedAt: now, source: "website-admin" }), cache: "no-store", signal: controller.signal });
    clearTimeout(timeout);
    if (!response.ok) return { requestedAt: now, requestId: null, status: "delivery_failed", delivered: false, httpStatus: response.status, reason: `Webhook returned ${response.status}` };
    let body: Record<string, unknown>;
    try { body = await response.json(); } catch { return { requestedAt: now, requestId: null, status: "unconfirmed", delivered: true, httpStatus: response.status, warning: "Malformed webhook JSON" }; }
    const requestId = typeof body.request_id === "string" ? body.request_id.slice(0, 120) : null;
    const rawStatus = typeof body.status === "string" ? body.status : undefined;
    if (!requestId) return { requestedAt: now, requestId: null, status: "legacy", delivered: true, httpStatus: response.status, warning: "Legacy bot response did not include request_id" };
    if (!isPendingForcePull(rawStatus)) return { requestedAt: now, requestId, status: "unconfirmed", delivered: true, httpStatus: response.status, warning: "Unexpected webhook status" };
    const statusPath = typeof body.status_url === "string" ? body.status_url.slice(0, 500) : undefined;
    const polled = statusPath ? await pollForcePullStatus({ webhookUrl, sharedSecret, statusPath, requestedAt: now, requestId }) : { requestedAt: now, requestId, status: normalizePendingForcePullStatus(rawStatus ?? "processing"), warning: "No status URL returned" };
    return { ...polled, delivered: true, httpStatus: response.status };
  } catch {
    clearTimeout(timeout);
    return { requestedAt: now, requestId: null, status: "delivery_failed", delivered: false, reason: "Webhook request failed" };
  }
}


export async function GET(req: Request) {
  if (!(await isAuthenticated(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: BNL_NO_STORE_HEADERS });
  }

  const redis = getBNLRedis();
  let flags = memoryFlags;
  let forcePullRequestedAt: string | null = null;
  let forcePullAttempt = memoryForcePullAttempt;

  if (redis) {
    const [f, fp, fpa] = await Promise.all([
      redis.get<unknown>(FLAGS_KEY),
      redis.get<unknown>(FORCE_PULL_KEY),
      redis.get<unknown>(FORCE_PULL_ATTEMPT_KEY),
    ]);
    flags = sanitizeFlags(f);
    forcePullRequestedAt = typeof fp === "string" ? fp : null;
    memoryFlags = flags;
    forcePullAttempt = sanitizeStoredForcePullAttempt(fpa);
    memoryForcePullAttempt = forcePullAttempt;
  }

  const publicForcePullAttempt = await resumeForcePullAttempt(redis, FORCE_PULL_ATTEMPT_KEY, forcePullAttempt, { webhookUrl: process.env.BNL_FORCE_PULL_WEBHOOK_URL, sharedSecret: process.env.BNL_FORCE_PULL_SHARED_SECRET || "" }, (record) => { memoryForcePullAttempt = record; });
  const canonical = await readBNLAdminState(redis);

  return NextResponse.json({ ...canonical, flags, forcePullRequestedAt, forcePullAttempt: publicForcePullAttempt, persisted: Boolean(redis) }, { headers: BNL_NO_STORE_HEADERS });
}

export async function POST(req: Request) {
  if (!(await isAuthenticated(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: BNL_NO_STORE_HEADERS });
  }

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const action = body.action;
    const redis = getBNLRedis();

    if (action === "updateStatus" || action === "resetStandby") {
      const status = action === "resetStandby" ? "ONLINE" : body.status;
      const mode = action === "resetStandby" ? "STANDBY" : body.mode;
      if (!ALLOWED_STATUS.has(status as BNLStatusValue) || !ALLOWED_MODES.has(mode as BNLModeValue)) {
        return NextResponse.json({ error: "Invalid payload" }, { status: 400, headers: BNL_NO_STORE_HEADERS });
      }
      const now = new Date().toISOString();
      let manualRelay = null;
      if (action === "updateStatus") {
        if (typeof body.message !== "string") return NextResponse.json({ error: "Invalid payload" }, { status: 400, headers: BNL_NO_STORE_HEADERS });
        const trimmedMessage = body.message.trim().slice(0, MAX_MESSAGE_LENGTH);
        if (!trimmedMessage) return NextResponse.json({ error: "Message required" }, { status: 400, headers: BNL_NO_STORE_HEADERS });
        const relayBody = { contractVersion: 2, kind: "relay", relay: { relayId: `admin-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`, message: trimmedMessage, currentDirective: typeof body.currentDirective === "string" && body.currentDirective.trim() ? body.currentDirective.trim().slice(0, MAX_DIRECTIVE_LENGTH) : "Monitoring Discord-side relay traffic.", sourceClass: "approved_canon", trigger: "manual" } };
        manualRelay = parseV2RelayWrite(relayBody, now);
      }

      const presence: BNLV2PresenceRecord = { contractVersion: 2, status: status as BNLStatusValue, mode: mode as BNLModeValue, source: action === "resetStandby" ? "reset" : "admin", receivedAt: now };
      await writeBNLPresence(presence, redis);
      if (manualRelay) await writeBNLRelay(manualRelay, redis);

      const canonical = await readBNLAdminState(redis);
      return NextResponse.json({ ok: true, ...canonical }, { headers: BNL_NO_STORE_HEADERS });
    }

    if (action === "clearHistory") {
      await clearLegacyBNLHistory(redis);
      return NextResponse.json({ ok: true, cleared: true, persisted: Boolean(redis) }, { headers: BNL_NO_STORE_HEADERS });
    }

    if (action === "updateFlags") {
      const rawFlags = body.flags;
      if (!rawFlags || typeof rawFlags !== "object") {
        return NextResponse.json({ error: "Invalid payload" }, { status: 400, headers: BNL_NO_STORE_HEADERS });
      }
      const rec = rawFlags as Record<string, unknown>;
      const allowedKeys = ["websiteRelayEnabled", "showdayDiscordPostsEnabled", "heartbeatEnabled"];
      const keys = Object.keys(rec);
      if (!keys.every((key) => allowedKeys.includes(key))) {
        return NextResponse.json({ error: "Invalid payload" }, { status: 400, headers: BNL_NO_STORE_HEADERS });
      }

      const nextFlags: BNLFlags = {
        websiteRelayEnabled: Boolean(rec.websiteRelayEnabled),
        showdayDiscordPostsEnabled: Boolean(rec.showdayDiscordPostsEnabled),
        heartbeatEnabled: Boolean(rec.heartbeatEnabled),
      };

      if (redis) await redis.set(FLAGS_KEY, nextFlags);
      memoryFlags = nextFlags;
      return NextResponse.json({ ok: true, flags: nextFlags, persisted: Boolean(redis) }, { headers: BNL_NO_STORE_HEADERS });
    }

    if (action === "forcePull") {
      const now = new Date().toISOString();
      if (redis) {
        await redis.set(FORCE_PULL_KEY, now);
      } else {
        console.warn('[admin/bnl] forcePull requested without redis persistence; request timestamp may not be visible across serverless instances');
      }

      const rawAttempt = await notifyForcePull(now);
      const attempt = await storeForcePullAttempt(redis, FORCE_PULL_ATTEMPT_KEY, rawAttempt, (record) => { memoryForcePullAttempt = record; });
      if (attempt?.status === "delivery_failed") {
        return NextResponse.json({ error: attempt.reason || "Immediate check-in relay delivery failed.", forcePullRequestedAt: now, forcePullAttempt: attempt, persisted: Boolean(redis) }, { status: attempt.reason?.includes("configured") ? 503 : 502, headers: BNL_NO_STORE_HEADERS });
      }
      return NextResponse.json({ ok: true, forcePullRequestedAt: now, forcePullAttempt: attempt, note: "Immediate check-in request delivered to BNL. Publication outcome is reported separately.", persisted: Boolean(redis) }, { headers: BNL_NO_STORE_HEADERS });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400, headers: BNL_NO_STORE_HEADERS });
  } catch (error) {
    console.error("[admin/bnl] error:", error);
    return NextResponse.json({ error: "Failed to update BNL controls" }, { status: 500, headers: BNL_NO_STORE_HEADERS });
  }
}
