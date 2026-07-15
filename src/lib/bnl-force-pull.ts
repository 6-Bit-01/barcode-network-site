import { Redis } from "@upstash/redis";

export type ForcePullOutcome = "queued" | "already_running" | "processing" | "published" | "disabled" | "no_safe_source" | "rejected" | "provider_failed" | "delivery_failed" | "unconfirmed" | "legacy";
export type PublicForcePullAttempt = { requestedAt: string; requestId: string | null; status: ForcePullOutcome; sourceClass?: string; reason?: string; acceptedRelayId?: string; persisted?: boolean; warning?: string };
export type StoredForcePullAttempt = PublicForcePullAttempt & { statusPath?: string; lastCheckedAt?: string };

type FetchLike = typeof fetch;
const PENDING = new Set(["accepted", "queued", "already_running", "running", "processing"]);
const TERMINAL = new Set(["published", "disabled", "no_safe_source", "rejected", "provider_failed", "delivery_failed"]);
const ALLOWED = new Set<ForcePullOutcome>(["queued", "already_running", "processing", "published", "disabled", "no_safe_source", "rejected", "provider_failed", "delivery_failed", "unconfirmed", "legacy"]);

export function safeText(value: unknown, max = 240) { return typeof value === "string" ? value.slice(0, max) : undefined; }
export function serializeForcePullAttempt(value: unknown, persisted?: boolean): PublicForcePullAttempt | null {
  if (!value || typeof value !== "object") return null;
  const rec = value as Record<string, unknown>;
  if (typeof rec.requestedAt !== "string") return null;
  const rawStatus = typeof rec.status === "string" && ALLOWED.has(rec.status as ForcePullOutcome) ? rec.status as ForcePullOutcome : "unconfirmed";
  return {
    requestedAt: rec.requestedAt,
    requestId: safeText(rec.requestId, 120) ?? null,
    status: rawStatus,
    sourceClass: safeText(rec.sourceClass),
    reason: safeText(rec.reason),
    acceptedRelayId: safeText(rec.acceptedRelayId),
    persisted: typeof persisted === "boolean" ? persisted : typeof rec.persisted === "boolean" ? rec.persisted : undefined,
    warning: safeText(rec.warning),
  };
}
export function sanitizeStoredForcePullAttempt(value: unknown): StoredForcePullAttempt | null {
  const pub = serializeForcePullAttempt(value);
  if (!pub || !value || typeof value !== "object") return pub;
  const rec = value as Record<string, unknown>;
  return { ...pub, statusPath: safeText(rec.statusPath, 500), lastCheckedAt: safeText(rec.lastCheckedAt, 80) };
}
export function isPendingForcePull(status?: string) { return status === "queued" || status === "already_running" || status === "processing"; }
export function resolveSafeStatusPath(path: unknown, webhookUrl: string): string | null {
  if (typeof path !== "string" || !path.startsWith("/")) return null;
  const base = new URL(webhookUrl);
  const url = new URL(path, base.origin);
  return url.origin === base.origin ? `${url.pathname}${url.search}` : null;
}
async function sleep(ms: number) { await new Promise((resolve) => setTimeout(resolve, ms)); }
async function fetchWithTimeout(fetcher: FetchLike, url: URL, secret: string, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetcher(url, { headers: secret ? { "x-bnl-secret": secret } : {}, cache: "no-store", signal: controller.signal });
  } finally { clearTimeout(timer); }
}
export async function pollForcePullStatus({ webhookUrl, sharedSecret, statusPath, requestedAt, requestId, fetcher = fetch, windowMs = 8_000, intervalMs = 750, requestTimeoutMs = 2_500, now = () => new Date().toISOString() }: { webhookUrl: string; sharedSecret: string; statusPath: string; requestedAt: string; requestId: string | null; fetcher?: FetchLike; windowMs?: number; intervalMs?: number; requestTimeoutMs?: number; now?: () => string }): Promise<StoredForcePullAttempt> {
  const safePath = resolveSafeStatusPath(statusPath, webhookUrl);
  if (!safePath) return { requestedAt, requestId, status: "unconfirmed", warning: "Unsafe status URL rejected", lastCheckedAt: now() };
  const base = new URL(webhookUrl);
  const statusUrl = new URL(safePath, base.origin);
  const deadline = Date.now() + windowMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetchWithTimeout(fetcher, statusUrl, sharedSecret, requestTimeoutMs);
      if (response.status === 404) { await sleep(intervalMs); continue; }
      if (!response.ok) return { requestedAt, requestId, status: "unconfirmed", statusPath: safePath, warning: `Status endpoint returned ${response.status}`, lastCheckedAt: now() };
      let body: Record<string, unknown>;
      try { body = await response.json(); } catch { return { requestedAt, requestId, status: "unconfirmed", statusPath: safePath, warning: "Malformed status JSON", lastCheckedAt: now() }; }
      const rawStatus = safeText(body.status, 80) ?? "unconfirmed";
      const exactRequestId = safeText(body.request_id, 120) ?? requestId;
      const baseRecord = { requestedAt, requestId: exactRequestId, statusPath: safePath, sourceClass: safeText(body.source_class), reason: safeText(body.reason), acceptedRelayId: safeText(body.accepted_relay_id), lastCheckedAt: now() };
      if (TERMINAL.has(rawStatus)) return { ...baseRecord, status: rawStatus as ForcePullOutcome };
      if (PENDING.has(rawStatus)) { await sleep(intervalMs); continue; }
      return { ...baseRecord, status: "unconfirmed", warning: `Unexpected status: ${rawStatus}` };
    } catch (error) {
      const aborted = error instanceof Error && error.name === "AbortError";
      return { requestedAt, requestId, status: "unconfirmed", statusPath: safePath, warning: aborted ? "Status endpoint timed out" : "Status endpoint request failed", lastCheckedAt: now() };
    }
  }
  return { requestedAt, requestId, status: "unconfirmed", statusPath: safePath, warning: "Still processing; outcome unconfirmed", lastCheckedAt: now() };
}
export async function storeForcePullAttempt(redis: Redis | null, key: string, record: StoredForcePullAttempt, setMemory: (record: StoredForcePullAttempt) => void) {
  const stored = sanitizeStoredForcePullAttempt(record) ?? { requestedAt: record.requestedAt, requestId: record.requestId, status: "unconfirmed" as const };
  if (redis) await redis.set(key, stored);
  setMemory(stored);
  return serializeForcePullAttempt(stored, Boolean(redis));
}
export async function resumeForcePullAttempt(redis: Redis | null, key: string, stored: StoredForcePullAttempt | null, config: { webhookUrl?: string; sharedSecret: string; fetcher?: FetchLike; windowMs?: number }, setMemory: (record: StoredForcePullAttempt | null) => void) {
  if (!stored || !isPendingForcePull(stored.status) && stored.status !== "unconfirmed") return serializeForcePullAttempt(stored, Boolean(redis));
  if (!stored.statusPath || !config.webhookUrl || !stored.requestId) return serializeForcePullAttempt(stored, Boolean(redis));
  const next = await pollForcePullStatus({ webhookUrl: config.webhookUrl, sharedSecret: config.sharedSecret, statusPath: stored.statusPath, requestedAt: stored.requestedAt, requestId: stored.requestId, fetcher: config.fetcher, windowMs: config.windowMs ?? 3_000 });
  return storeForcePullAttempt(redis, key, next, (record) => { setMemory(record); });
}
