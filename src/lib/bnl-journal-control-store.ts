import { randomUUID } from "crypto";
import {
  getBNLJournalRedis,
  listJournalEntryControls,
  type JournalEntryControl,
  type RedisLike,
} from "@/lib/bnl-journal-store";

export type JournalAutomationConfig = {
  journalAutoPublishEnabled: boolean;
  journalDailyEnabled: boolean;
  journalWeeklyEnabled: boolean;
};

export type JournalCadence = "daily" | "weekly";
export type JournalRunRequest = {
  requestId: string;
  cadence: JournalCadence;
  status: "queued" | "running";
  requestedAt: string;
  requestedBy: "website-admin";
  claimedAt?: string;
};

export type JournalRunState =
  | "queued"
  | "running"
  | "published"
  | "held"
  | "delivery_failed"
  | "skipped"
  | "failed"
  | "complete"
  | "already_processed"
  | "busy"
  | "backoff"
  | "disabled";

export type JournalRunRecord = {
  runId: string;
  cadence: JournalCadence;
  state: JournalRunState;
  occurredAt: string;
  requestId?: string;
  entryId?: string;
  sourceCount?: number;
  detail?: string;
};

export type JournalAutomationTelemetry = {
  observedAt: string;
  automationStatus: "online" | "paused" | "degraded";
  nextDailyAt?: string;
  nextWeeklyAt?: string;
  detail?: string;
  lastRun?: JournalRunRecord;
};

export type JournalControlState = {
  config: JournalAutomationConfig;
  entryControls: JournalEntryControl[];
  runRequests: JournalRunRequest[];
  telemetry: JournalAutomationTelemetry | null;
  recentRuns: JournalRunRecord[];
};

export const BNL_FLAGS_KEY = "bnl:flags";
export const BNL_JOURNAL_RUN_REQUESTS_KEY =
  "barcode:bnl-journal:v1:automation:run-requests";
export const BNL_JOURNAL_TELEMETRY_KEY =
  "barcode:bnl-journal:v1:automation:telemetry";
export const BNL_JOURNAL_RECENT_RUNS_KEY =
  "barcode:bnl-journal:v1:automation:recent-runs";

export const DEFAULT_JOURNAL_AUTOMATION_CONFIG: JournalAutomationConfig = {
  journalAutoPublishEnabled: true,
  journalDailyEnabled: true,
  journalWeeklyEnabled: true,
};

const MAX_PENDING_REQUESTS = 20;
const MAX_RECENT_RUNS = 20;
const MAX_DETAIL_LENGTH = 280;
export const JOURNAL_CLAIM_LEASE_MS = 30 * 60 * 1000;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{2,119}$/;

export type JournalControlRedis = RedisLike & {
  set(key: string, value: unknown): Promise<unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validIso(value: unknown): value is string {
  return (
    typeof value === "string" &&
    ISO_UTC.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

function bounded(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : undefined;
}

function isCadence(value: unknown): value is JournalCadence {
  return value === "daily" || value === "weekly";
}

const RUN_STATES = new Set<JournalRunState>([
  "queued",
  "running",
  "published",
  "held",
  "delivery_failed",
  "skipped",
  "failed",
  "complete",
  "already_processed",
  "busy",
  "backoff",
  "disabled",
]);

export function sanitizeJournalAutomationConfig(
  value: unknown,
): JournalAutomationConfig {
  const record = isRecord(value) ? value : {};
  return {
    journalAutoPublishEnabled:
      typeof record.journalAutoPublishEnabled === "boolean"
        ? record.journalAutoPublishEnabled
        : DEFAULT_JOURNAL_AUTOMATION_CONFIG.journalAutoPublishEnabled,
    journalDailyEnabled:
      typeof record.journalDailyEnabled === "boolean"
        ? record.journalDailyEnabled
        : DEFAULT_JOURNAL_AUTOMATION_CONFIG.journalDailyEnabled,
    journalWeeklyEnabled:
      typeof record.journalWeeklyEnabled === "boolean"
        ? record.journalWeeklyEnabled
        : DEFAULT_JOURNAL_AUTOMATION_CONFIG.journalWeeklyEnabled,
  };
}

export function sanitizeJournalRunRequest(
  value: unknown,
): JournalRunRequest | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.requestId !== "string" ||
    !ID.test(value.requestId) ||
    !isCadence(value.cadence) ||
    (value.status !== "queued" && value.status !== "running") ||
    !validIso(value.requestedAt) ||
    value.requestedBy !== "website-admin"
  )
    return null;
  const claimedAt = validIso(value.claimedAt) ? value.claimedAt : undefined;
  return {
    requestId: value.requestId,
    cadence: value.cadence,
    status: value.status,
    requestedAt: value.requestedAt,
    requestedBy: "website-admin",
    ...(claimedAt ? { claimedAt } : {}),
  };
}

export function sanitizeJournalRunRecord(
  value: unknown,
): JournalRunRecord | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.runId !== "string" ||
    !ID.test(value.runId) ||
    !isCadence(value.cadence) ||
    typeof value.state !== "string" ||
    !RUN_STATES.has(value.state as JournalRunState) ||
    !validIso(value.occurredAt)
  )
    return null;
  const requestId =
    typeof value.requestId === "string" && ID.test(value.requestId)
      ? value.requestId
      : undefined;
  const entryId =
    typeof value.entryId === "string" && ID.test(value.entryId)
      ? value.entryId
      : undefined;
  const sourceCount =
    Number.isInteger(value.sourceCount) &&
    Number(value.sourceCount) >= 0 &&
    Number(value.sourceCount) <= 1_000_000
      ? Number(value.sourceCount)
      : undefined;
  const detail = bounded(value.detail, MAX_DETAIL_LENGTH);
  return {
    runId: value.runId,
    cadence: value.cadence,
    state: value.state as JournalRunState,
    occurredAt: value.occurredAt,
    ...(requestId ? { requestId } : {}),
    ...(entryId ? { entryId } : {}),
    ...(sourceCount !== undefined ? { sourceCount } : {}),
    ...(detail ? { detail } : {}),
  };
}

export function sanitizeJournalTelemetry(
  value: unknown,
): JournalAutomationTelemetry | null {
  if (!isRecord(value)) return null;
  if (
    !validIso(value.observedAt) ||
    !["online", "paused", "degraded"].includes(
      String(value.automationStatus),
    )
  )
    return null;
  const nextDailyAt = validIso(value.nextDailyAt)
    ? value.nextDailyAt
    : undefined;
  const nextWeeklyAt = validIso(value.nextWeeklyAt)
    ? value.nextWeeklyAt
    : undefined;
  const detail = bounded(value.detail, MAX_DETAIL_LENGTH);
  const lastRun = sanitizeJournalRunRecord(value.lastRun);
  return {
    observedAt: value.observedAt,
    automationStatus: value.automationStatus as
      | "online"
      | "paused"
      | "degraded",
    ...(nextDailyAt ? { nextDailyAt } : {}),
    ...(nextWeeklyAt ? { nextWeeklyAt } : {}),
    ...(detail ? { detail } : {}),
    ...(lastRun ? { lastRun } : {}),
  };
}

function sanitizeRequests(value: unknown): JournalRunRequest[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(sanitizeJournalRunRequest)
    .filter((item): item is JournalRunRequest => Boolean(item))
    .slice(-MAX_PENDING_REQUESTS);
}

function sanitizeRuns(value: unknown): JournalRunRecord[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(sanitizeJournalRunRecord)
    .filter((item): item is JournalRunRecord => Boolean(item))
    .slice(0, MAX_RECENT_RUNS);
}

export function getJournalControlRedis(): JournalControlRedis | null {
  return getBNLJournalRedis() as unknown as JournalControlRedis | null;
}

export async function readJournalControlState(
  redis: JournalControlRedis,
): Promise<JournalControlState> {
  const [rawFlags, rawRequests, rawTelemetry, rawRuns, entryControls] = await Promise.all([
    redis.get<unknown>(BNL_FLAGS_KEY),
    redis.get<unknown>(BNL_JOURNAL_RUN_REQUESTS_KEY),
    redis.get<unknown>(BNL_JOURNAL_TELEMETRY_KEY),
    redis.get<unknown>(BNL_JOURNAL_RECENT_RUNS_KEY),
    listJournalEntryControls(redis),
  ]);
  return {
    config: sanitizeJournalAutomationConfig(rawFlags),
    entryControls,
    runRequests: sanitizeRequests(rawRequests),
    telemetry: sanitizeJournalTelemetry(rawTelemetry),
    recentRuns: sanitizeRuns(rawRuns),
  };
}

export async function writeJournalAutomationConfig(
  config: JournalAutomationConfig,
  redis: JournalControlRedis,
): Promise<JournalAutomationConfig> {
  const next = sanitizeJournalAutomationConfig(config);
  await mergeBNLFlagsAtomic(next, redis);
  return next;
}

const MERGE_FLAGS_SCRIPT = `
local key = KEYS[1]
local patch = cjson.decode(ARGV[1])
local raw = redis.call("GET", key)
local flags = raw and cjson.decode(raw) or {}
for name, value in pairs(patch) do flags[name] = value end
redis.call("SET", key, cjson.encode(flags))
return cjson.encode(flags)
`;

export async function mergeBNLFlagsAtomic(
  patch: Record<string, unknown>,
  redis: JournalControlRedis,
): Promise<Record<string, unknown>> {
  if (!redis.eval)
    throw new Error("Atomic BNL control flag storage is unavailable.");
  return parseEvalResult(
    await redis.eval(MERGE_FLAGS_SCRIPT, [BNL_FLAGS_KEY], [
      JSON.stringify(patch),
    ]),
  );
}

const ENQUEUE_SCRIPT = `
local key = KEYS[1]
local cadence = ARGV[1]
local requestJson = ARGV[2]
local maxItems = tonumber(ARGV[3])
local raw = redis.call("GET", key)
local items = raw and cjson.decode(raw) or {}
for _, item in ipairs(items) do
  if item.cadence == cadence and (item.status == "queued" or item.status == "running") then
    return cjson.encode({ status = "idempotent", request = item })
  end
end
table.insert(items, cjson.decode(requestJson))
while #items > maxItems do table.remove(items, 1) end
redis.call("SET", key, cjson.encode(items))
return cjson.encode({ status = "created", request = cjson.decode(requestJson) })
`;

const CLAIM_SCRIPT = `
local key = KEYS[1]
local requestId = ARGV[1]
local claimedAt = ARGV[2]
local claimToken = ARGV[3]
local claimedAtMs = tonumber(ARGV[4])
local leaseCutoffMs = tonumber(ARGV[5])
local raw = redis.call("GET", key)
local items = raw and cjson.decode(raw) or {}
for index, item in ipairs(items) do
  if item.requestId == requestId then
    if item.status == "queued" then
      item.status = "running"
      item.claimedAt = claimedAt
      item.claimToken = claimToken
      item.claimedAtEpochMs = claimedAtMs
      items[index] = item
      redis.call("SET", key, cjson.encode(items))
      return cjson.encode({ status = "claimed", request = item })
    end
    if item.status == "running" then
      if item.claimToken == claimToken then
        return cjson.encode({ status = "idempotent", request = item })
      end
      local previousClaimMs = tonumber(item.claimedAtEpochMs or 0)
      if previousClaimMs <= leaseCutoffMs then
        item.claimedAt = claimedAt
        item.claimToken = claimToken
        item.claimedAtEpochMs = claimedAtMs
        items[index] = item
        redis.call("SET", key, cjson.encode(items))
        return cjson.encode({ status = "reclaimed", request = item })
      end
      return cjson.encode({ status = "conflict" })
    end
  end
end
return cjson.encode({ status = "missing" })
`;

function parseEvalResult(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    const parsed = JSON.parse(value);
    return isRecord(parsed) ? parsed : {};
  }
  return isRecord(value) ? value : {};
}

export async function enqueueJournalRunRequest(
  cadence: JournalCadence,
  redis: JournalControlRedis,
): Promise<{ request: JournalRunRequest; idempotent: boolean } | null> {
  if (!redis.eval) return null;
  const now = new Date().toISOString();
  const request: JournalRunRequest = {
    requestId: `journal-${cadence}-${randomUUID()}`,
    cadence,
    status: "queued",
    requestedAt: now,
    requestedBy: "website-admin",
  };
  const result = parseEvalResult(
    await redis.eval(ENQUEUE_SCRIPT, [BNL_JOURNAL_RUN_REQUESTS_KEY], [
      cadence,
      JSON.stringify(request),
      MAX_PENDING_REQUESTS,
    ]),
  );
  const stored = sanitizeJournalRunRequest(result.request);
  return stored
    ? { request: stored, idempotent: result.status === "idempotent" }
    : null;
}

export async function claimJournalRunRequest(
  requestId: string,
  claimedAt: string,
  claimToken: string,
  redis: JournalControlRedis,
): Promise<
  | { request: JournalRunRequest; idempotent: boolean; reclaimed: boolean }
  | { conflict: true }
  | null
> {
  if (
    !redis.eval ||
    !ID.test(requestId) ||
    !validIso(claimedAt) ||
    !ID.test(claimToken)
  )
    return null;
  const claimedAtMs = Date.parse(claimedAt);
  const leaseCutoffMs = claimedAtMs - JOURNAL_CLAIM_LEASE_MS;
  const result = parseEvalResult(
    await redis.eval(CLAIM_SCRIPT, [BNL_JOURNAL_RUN_REQUESTS_KEY], [
      requestId,
      claimedAt,
      claimToken,
      claimedAtMs,
      leaseCutoffMs,
    ]),
  );
  if (result.status === "conflict") return { conflict: true };
  const request = sanitizeJournalRunRequest(result.request);
  return request
    ? {
        request,
        idempotent: result.status === "idempotent",
        reclaimed: result.status === "reclaimed",
      }
    : null;
}

const NON_TERMINAL_STATES = new Set<JournalRunState>([
  "queued",
  "running",
  "busy",
  "backoff",
]);

const REPORT_RUN_SCRIPT = `
local requestsKey = KEYS[1]
local recentRunsKey = KEYS[2]
local telemetryKey = KEYS[3]
local run = cjson.decode(ARGV[1])
local terminal = ARGV[2] == "1"
local maxRecent = tonumber(ARGV[3])

local requestsRaw = redis.call("GET", requestsKey)
local requests = requestsRaw and cjson.decode(requestsRaw) or {}
if terminal and run.requestId then
  local remaining = {}
  for _, request in ipairs(requests) do
    if request.requestId ~= run.requestId then table.insert(remaining, request) end
  end
  requests = remaining
end

local recentRaw = redis.call("GET", recentRunsKey)
local previousRuns = recentRaw and cjson.decode(recentRaw) or {}
local recentRuns = { run }
for _, previous in ipairs(previousRuns) do
  if previous.runId ~= run.runId and #recentRuns < maxRecent then
    table.insert(recentRuns, previous)
  end
end

local telemetryRaw = redis.call("GET", telemetryKey)
local telemetry = telemetryRaw and cjson.decode(telemetryRaw) or {}
telemetry.observedAt = run.occurredAt
if run.state == "delivery_failed" or run.state == "failed" then
  telemetry.automationStatus = "degraded"
elseif telemetry.automationStatus ~= "online" and telemetry.automationStatus ~= "paused" and telemetry.automationStatus ~= "degraded" then
  telemetry.automationStatus = "online"
end
if run.detail then telemetry.detail = run.detail else telemetry.detail = nil end
telemetry.lastRun = run

redis.call("SET", requestsKey, cjson.encode(requests))
redis.call("SET", recentRunsKey, cjson.encode(recentRuns))
redis.call("SET", telemetryKey, cjson.encode(telemetry))
return cjson.encode({ run = run })
`;

export async function reportJournalRun(
  input: unknown,
  redis: JournalControlRedis,
): Promise<JournalRunRecord | null> {
  const run = sanitizeJournalRunRecord(input);
  if (!run) return null;
  if (!redis.eval)
    throw new Error("Atomic Journal run reporting is unavailable.");
  const result = parseEvalResult(
    await redis.eval(
      REPORT_RUN_SCRIPT,
      [
        BNL_JOURNAL_RUN_REQUESTS_KEY,
        BNL_JOURNAL_RECENT_RUNS_KEY,
        BNL_JOURNAL_TELEMETRY_KEY,
      ],
      [
        JSON.stringify(run),
        NON_TERMINAL_STATES.has(run.state) ? "0" : "1",
        MAX_RECENT_RUNS,
      ],
    ),
  );
  return sanitizeJournalRunRecord(result.run);
}

export async function writeJournalTelemetry(
  input: unknown,
  redis: JournalControlRedis,
): Promise<JournalAutomationTelemetry | null> {
  const telemetry = sanitizeJournalTelemetry(input);
  if (!telemetry) return null;
  await redis.set(BNL_JOURNAL_TELEMETRY_KEY, telemetry);
  return telemetry;
}
