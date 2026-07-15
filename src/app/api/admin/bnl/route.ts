import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { verifyAdminToken, COOKIE_NAME } from "@/lib/auth";

export const dynamic = "force-dynamic";

type BNLStatusValue = "ONLINE" | "OFFLINE";
type BNLModeValue = "STANDBY" | "OBSERVATION" | "ACTIVE_LIAISON" | "SIGNAL_DEGRADATION" | "RESTRICTED";
type BNLSourceValue = "bot" | "startup" | "relay" | "heartbeat" | "showday" | "showtest" | "admin" | "reset" | "forcePull" | "unknown";

type BNLFlags = {
  websiteRelayEnabled: boolean;
  showdayDiscordPostsEnabled: boolean;
  heartbeatEnabled: boolean;
};

const STATUS_KEY = "bnl:status";
const HISTORY_KEY = "bnl:history";
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


type ForcePullOutcome = "delivered" | "queued" | "already_running" | "processing" | "published" | "disabled" | "no_safe_source" | "rejected" | "provider_failed" | "delivery_failed" | "unconfirmed" | "legacy";
type ForcePullAttemptRecord = { requestedAt: string; requestId: string | null; status: ForcePullOutcome; sourceClass?: string; reason?: string; acceptedRelayId?: string; persisted?: boolean; warning?: string };
const PENDING_FORCE_PULL = new Set(["queued", "accepted", "running", "processing", "already_running"]);
const TERMINAL_FORCE_PULL = new Set(["published", "disabled", "no_safe_source", "rejected", "provider_failed", "delivery_failed"]);
function safeText(value: unknown, max = 240) { return typeof value === "string" ? value.slice(0, max) : undefined; }
function sanitizeForcePullAttempt(value: unknown): ForcePullAttemptRecord | null {
  if (!value || typeof value !== "object") return null;
  const rec = value as Record<string, unknown>;
  if (typeof rec.requestedAt !== "string") return null;
  const rawStatus = typeof rec.status === "string" ? rec.status : "unconfirmed";
  const allowed = new Set<ForcePullOutcome>(["delivered","queued","already_running","processing","published","disabled","no_safe_source","rejected","provider_failed","delivery_failed","unconfirmed","legacy"]);
  return { requestedAt: rec.requestedAt, requestId: safeText(rec.requestId, 120) ?? null, status: allowed.has(rawStatus as ForcePullOutcome) ? rawStatus as ForcePullOutcome : "unconfirmed", sourceClass: safeText(rec.sourceClass), reason: safeText(rec.reason), acceptedRelayId: safeText(rec.acceptedRelayId), persisted: typeof rec.persisted === "boolean" ? rec.persisted : undefined, warning: safeText(rec.warning) };
}
function resolveSafeStatusUrl(path: unknown, webhookUrl: string): URL | null {
  if (typeof path !== "string" || !path.startsWith("/")) return null;
  const base = new URL(webhookUrl);
  const url = new URL(path, base.origin);
  return url.origin === base.origin ? url : null;
}
async function storeForcePullAttempt(redis: Redis | null, record: ForcePullAttemptRecord) {
  const safe = { ...record, persisted: Boolean(redis) };
  if (redis) await redis.set(FORCE_PULL_ATTEMPT_KEY, safe);
  memoryForcePullAttempt = safe;
  return safe;
}
async function pollForcePullStatus(webhookUrl: string, sharedSecret: string, statusPath: string, requestedAt: string, requestId: string | null): Promise<ForcePullAttemptRecord> {
  const statusUrl = resolveSafeStatusUrl(statusPath, webhookUrl);
  if (!statusUrl) return { requestedAt, requestId, status: "unconfirmed", warning: "Unsafe status URL rejected" };
  const deadline = Date.now() + 8_000;
  let first = true;
  while (Date.now() < deadline) {
    const response = await fetch(statusUrl, { headers: sharedSecret ? { "x-bnl-secret": sharedSecret } : {}, cache: "no-store" });
    if (response.status === 404 && first) return { requestedAt, requestId, status: "processing", warning: "Attempt record pending" };
    first = false;
    if (!response.ok) return { requestedAt, requestId, status: "unconfirmed", warning: `Status endpoint returned ${response.status}` };
    let body: Record<string, unknown>;
    try { body = await response.json(); } catch { return { requestedAt, requestId, status: "unconfirmed", warning: "Malformed status JSON" }; }
    const status = safeText(body.status, 80) ?? "unconfirmed";
    const normalized = TERMINAL_FORCE_PULL.has(status) ? status as ForcePullOutcome : PENDING_FORCE_PULL.has(status) ? "processing" : "unconfirmed";
    const record = { requestedAt, requestId: safeText(body.request_id, 120) ?? requestId, status: normalized, sourceClass: safeText(body.source_class), reason: safeText(body.reason), acceptedRelayId: safeText(body.accepted_relay_id) };
    if (normalized !== "processing") return record;
    await new Promise((r) => setTimeout(r, 750));
  }
  return { requestedAt, requestId, status: "unconfirmed", warning: "Still processing; outcome unconfirmed" };
}

const ALLOWED_STATUS = new Set<BNLStatusValue>(["ONLINE", "OFFLINE"]);
const ALLOWED_MODES = new Set<BNLModeValue>(["STANDBY", "OBSERVATION", "ACTIVE_LIAISON", "SIGNAL_DEGRADATION", "RESTRICTED"]);

let memoryHistory: Array<{ timestamp: string; status: BNLStatusValue; mode: BNLModeValue; currentDirective?: string; message: string; source: BNLSourceValue; adminNote?: string; persisted?: boolean }> = [];
let memoryFlags: BNLFlags = { ...DEFAULT_FLAGS };
let memoryForcePullAttempt: ForcePullAttemptRecord | null = null;

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
  const allowedSources = new Set<BNLSourceValue>(["bot", "startup", "relay", "heartbeat", "showday", "showtest", "admin", "reset", "forcePull", "unknown"]);
  const normalized: typeof memoryHistory = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    if (!ALLOWED_STATUS.has(rec.status as BNLStatusValue) || !ALLOWED_MODES.has(rec.mode as BNLModeValue)) continue;
    if (typeof rec.timestamp !== "string" || typeof rec.message !== "string") continue;
    const source = rec.source;
    const normalizedSource: BNLSourceValue = typeof source === "string" && allowedSources.has(source as BNLSourceValue)
      ? (source as BNLSourceValue)
      : "unknown";
    normalized.push({
      timestamp: rec.timestamp,
      status: rec.status as BNLStatusValue,
      mode: rec.mode as BNLModeValue,
      currentDirective: typeof rec.currentDirective === "string" ? rec.currentDirective.trim().slice(0, MAX_DIRECTIVE_LENGTH) : undefined,
      message: rec.message.trim().slice(0, MAX_MESSAGE_LENGTH),
      source: normalizedSource,
      adminNote: typeof rec.adminNote === "string" && rec.adminNote.trim().length > 0 ? rec.adminNote.trim().slice(0, 400) : undefined,
      persisted: typeof rec.persisted === "boolean" ? rec.persisted : undefined,
    });
  }
  return normalized.slice(0, 25);
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

async function notifyForcePull(now: string): Promise<ForcePullAttemptRecord & { delivered: boolean; httpStatus?: number }> {
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
    const requestId = safeText(body.request_id, 120) ?? null;
    const rawStatus = safeText(body.status, 80);
    if (!requestId) return { requestedAt: now, requestId: null, status: "legacy", delivered: true, httpStatus: response.status, warning: "Legacy bot response did not include request_id" };
    if (rawStatus !== "queued" && rawStatus !== "already_running") return { requestedAt: now, requestId, status: "unconfirmed", delivered: true, httpStatus: response.status, warning: "Unexpected webhook status" };
    const statusPath = safeText(body.status_url, 500);
    const polled = statusPath ? await pollForcePullStatus(webhookUrl, sharedSecret, statusPath, now, requestId) : { requestedAt: now, requestId, status: rawStatus as ForcePullOutcome, warning: "No status URL returned" };
    return { ...polled, delivered: true, httpStatus: response.status };
  } catch {
    clearTimeout(timeout);
    return { requestedAt: now, requestId: null, status: "delivery_failed", delivered: false, reason: "Webhook request failed" };
  }
}

function sameHistoryContent(
  a: (typeof memoryHistory)[number],
  b: (typeof memoryHistory)[number],
): boolean {
  return (
    a.status === b.status &&
    a.mode === b.mode &&
    a.source === b.source &&
    a.message === b.message &&
    (a.currentDirective ?? "") === (b.currentDirective ?? "") &&
    (a.adminNote ?? "") === (b.adminNote ?? "")
  );
}

export async function GET(req: Request) {
  if (!(await isAuthenticated(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const redis = getRedis();
  let status: unknown = null;
  let history = memoryHistory;
  let flags = memoryFlags;
  let forcePullRequestedAt: string | null = null;
  let forcePullAttempt = memoryForcePullAttempt;

  if (redis) {
    const [s, h, f, fp, fpa] = await Promise.all([
      redis.get<unknown>(STATUS_KEY),
      redis.get<unknown>(HISTORY_KEY),
      redis.get<unknown>(FLAGS_KEY),
      redis.get<unknown>(FORCE_PULL_KEY),
      redis.get<unknown>(FORCE_PULL_ATTEMPT_KEY),
    ]);
    status = s;
    history = sanitizeHistory(h) as typeof memoryHistory;
    flags = sanitizeFlags(f);
    forcePullRequestedAt = typeof fp === "string" ? fp : null;
    memoryHistory = history;
    memoryFlags = flags;
    forcePullAttempt = sanitizeForcePullAttempt(fpa);
    memoryForcePullAttempt = forcePullAttempt;
  }

  return NextResponse.json({ status, history, flags, forcePullRequestedAt, forcePullAttempt, persisted: Boolean(redis) });
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

      const trimmedMessage = message.trim().slice(0, MAX_MESSAGE_LENGTH);
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
        const latest = priorHistory[0];
        const nextHistory = latest && sameHistoryContent(latest, nextEntry)
          ? priorHistory.slice(0, 25)
          : [nextEntry, ...priorHistory].slice(0, 25);
        await redis.set(HISTORY_KEY, nextHistory);
      } else {
        const latest = memoryHistory[0];
        memoryHistory = latest && sameHistoryContent(latest, nextEntry)
          ? memoryHistory.slice(0, 25)
          : [nextEntry, ...memoryHistory].slice(0, 25);
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

    if (action === "forcePull") {
      const now = new Date().toISOString();
      if (redis) {
        await redis.set(FORCE_PULL_KEY, now);
      } else {
        console.warn('[admin/bnl] forcePull requested without redis persistence; request timestamp may not be visible across serverless instances');
      }

      const attempt = await storeForcePullAttempt(redis, await notifyForcePull(now));
      if (attempt.status === "delivery_failed") {
        return NextResponse.json({ error: attempt.reason || "Immediate check-in relay delivery failed.", forcePullRequestedAt: now, forcePullAttempt: attempt, persisted: Boolean(redis) }, { status: attempt.reason?.includes("configured") ? 503 : 502 });
      }
      return NextResponse.json({ ok: true, forcePullRequestedAt: now, forcePullAttempt: attempt, note: "Immediate check-in request delivered to BNL. Publication outcome is reported separately.", persisted: Boolean(redis) });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("[admin/bnl] error:", error);
    return NextResponse.json({ error: "Failed to update BNL controls" }, { status: 500 });
  }
}
