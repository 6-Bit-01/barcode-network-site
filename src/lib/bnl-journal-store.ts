import { Redis } from "@upstash/redis";
import type { BNLJournalEntry } from "@/lib/bnl-journal-contract";

export type PublicBNLJournalEntry = BNLJournalEntry & { publishedAt: string };
export type JournalReadResult<T> = { ok: true; value: T } | { ok: false; unavailable: true };
export type JournalWriteResult = { ok: true; persisted: true; idempotent: boolean; entry: Pick<PublicBNLJournalEntry, "entryId" | "revision" | "contentHash" | "publishedAt"> } | { ok: false; conflict: true } | { ok: false; unavailable: true };

export const BNL_JOURNAL_INDEX_KEY = "barcode:bnl-journal:v1:index";
const ENTRY_PREFIX = "barcode:bnl-journal:v1:entry";
const LATEST_PREFIX = "barcode:bnl-journal:v1:latest";
export const BNL_JOURNAL_PAGE_SIZE = 9;
export const BNL_JOURNAL_MAX_PAGE = 100_000;

type RedisLike = {
  get<T = unknown>(key: string): Promise<T | null>;
  eval<T = unknown>(script: string, keys: string[], args: unknown[]): Promise<T>;
  zrange(key: string, start: number, stop: number, opts?: unknown): Promise<unknown[]>;
  zcard(key: string): Promise<number>;
  zrank(key: string, member: string): Promise<number | null>;
};

export function getBNLJournalRedis(): Redis | null { const url = process.env.UPSTASH_REDIS_REST_URL; const token = process.env.UPSTASH_REDIS_REST_TOKEN; return url && token ? new Redis({ url, token }) : null; }
function asRedisLike(redis: Redis | null): RedisLike | null { return redis as unknown as RedisLike | null; }
export function bnlJournalEntryKey(entryId: string, revision: number) { return `${ENTRY_PREFIX}:${entryId}:${revision}`; }
export function bnlJournalLatestKey(entryId: string) { return `${LATEST_PREFIX}:${entryId}`; }
function normalize(entry: BNLJournalEntry, publishedAt: string): PublicBNLJournalEntry { return { entryId: entry.entryId, revision: entry.revision, title: entry.title, excerpt: entry.excerpt, sections: entry.sections.map((s) => ({ heading: s.heading, body: s.body })), authoredAt: entry.authoredAt, sourceWindowStart: entry.sourceWindowStart, sourceWindowEnd: entry.sourceWindowEnd, contentHash: entry.contentHash, publishedAt }; }
function samePublicArtifact(a: PublicBNLJournalEntry, b: PublicBNLJournalEntry) { return JSON.stringify(a) === JSON.stringify(b); }
function scoreOf(publishedAt: string) { return Date.parse(publishedAt); }
function sanitizeStored(value: unknown): PublicBNLJournalEntry | null {
  if (typeof value === "string") { try { return JSON.parse(value) as PublicBNLJournalEntry; } catch { return null; } }
  return value && typeof value === "object" ? value as PublicBNLJournalEntry : null;
}

const PUBLISH_SCRIPT = `
local entryKey = KEYS[1]
local latestKey = KEYS[2]
local indexKey = KEYS[3]
local entryId = ARGV[1]
local revision = tonumber(ARGV[2])
local contentHash = ARGV[3]
local publishedAt = ARGV[4]
local recordJson = ARGV[5]
local score = tonumber(ARGV[6])
local existingJson = redis.call("GET", entryKey)
if existingJson then
  local existing = cjson.decode(existingJson)
  if existing["contentHash"] ~= contentHash then
    return {"conflict", existing["publishedAt"] or ""}
  end
  redis.call("SET", latestKey, existingJson)
  redis.call("ZADD", indexKey, score, entryId)
  return {"idempotent", existing["publishedAt"] or publishedAt}
end
redis.call("SET", entryKey, recordJson)
local latestJson = redis.call("GET", latestKey)
if (not latestJson) or (tonumber(cjson.decode(latestJson)["revision"]) < revision) then
  redis.call("SET", latestKey, recordJson)
  redis.call("ZADD", indexKey, score, entryId)
end
return {"created", publishedAt}
`;

export async function publishBNLJournalEntry(entry: BNLJournalEntry, redis: RedisLike | null = asRedisLike(getBNLJournalRedis())): Promise<JournalWriteResult> {
  if (!redis) return { ok: false, unavailable: true };
  try {
    const stored = normalize(entry, new Date().toISOString());
    const result = await redis.eval<unknown[]>(PUBLISH_SCRIPT, [bnlJournalEntryKey(entry.entryId, entry.revision), bnlJournalLatestKey(entry.entryId), BNL_JOURNAL_INDEX_KEY], [entry.entryId, entry.revision, entry.contentHash, stored.publishedAt, JSON.stringify(stored), scoreOf(stored.publishedAt)]);
    const status = String(result?.[0] ?? "");
    if (status === "conflict") return { ok: false, conflict: true };
    const publishedAt = String(result?.[1] ?? stored.publishedAt);
    const confirmed = sanitizeStored(await redis.get<unknown>(bnlJournalEntryKey(entry.entryId, entry.revision)));
    const latest = sanitizeStored(await redis.get<unknown>(bnlJournalLatestKey(entry.entryId)));
    if (!confirmed || confirmed.contentHash !== entry.contentHash || !latest) return { ok: false, unavailable: true };
    const normalizedWithOriginalDate = normalize(entry, publishedAt);
    if (!samePublicArtifact(confirmed, normalizedWithOriginalDate)) return { ok: false, unavailable: true };
    return { ok: true, persisted: true, idempotent: status === "idempotent", entry: { entryId: confirmed.entryId, revision: confirmed.revision, contentHash: confirmed.contentHash, publishedAt: confirmed.publishedAt } };
  } catch { return { ok: false, unavailable: true }; }
}

export function parseBNLJournalPage(value: string | string[] | undefined): number | null { const raw = Array.isArray(value) ? value[0] : value; if (raw === undefined) return 1; if (!/^\d+$/.test(raw)) return null; const page = Number(raw); return Number.isSafeInteger(page) && page >= 1 && page <= BNL_JOURNAL_MAX_PAGE ? page : null; }
async function readLatest(redis: RedisLike, entryId: string): Promise<PublicBNLJournalEntry | null> { return sanitizeStored(await redis.get<unknown>(bnlJournalLatestKey(entryId))); }

export async function listBNLJournalArchive(page = 1, redis: RedisLike | null = asRedisLike(getBNLJournalRedis())): Promise<JournalReadResult<{ entries: PublicBNLJournalEntry[]; page: number; hasOlder: boolean; hasNewer: boolean }>> {
  if (!redis || !Number.isSafeInteger(page) || page < 1 || page > BNL_JOURNAL_MAX_PAGE) return { ok: false, unavailable: true };
  try { const total = await redis.zcard(BNL_JOURNAL_INDEX_KEY); const start = (page - 1) * BNL_JOURNAL_PAGE_SIZE; if (start >= total && total > 0) return { ok: true, value: { entries: [], page, hasOlder: false, hasNewer: page > 1 } }; const ids = await redis.zrange(BNL_JOURNAL_INDEX_KEY, start, start + BNL_JOURNAL_PAGE_SIZE - 1, { rev: true }); const entries = (await Promise.all(ids.map((id) => readLatest(redis, String(id))))).filter((entry): entry is PublicBNLJournalEntry => Boolean(entry)); return { ok: true, value: { entries, page, hasOlder: start + BNL_JOURNAL_PAGE_SIZE < total, hasNewer: page > 1 } }; } catch { return { ok: false, unavailable: true }; }
}
export async function listAllBNLJournalEntryIds(redis: RedisLike | null = asRedisLike(getBNLJournalRedis())): Promise<JournalReadResult<string[]>> { if (!redis) return { ok: false, unavailable: true }; try { const total = await redis.zcard(BNL_JOURNAL_INDEX_KEY); const ids = total > 0 ? await redis.zrange(BNL_JOURNAL_INDEX_KEY, 0, total - 1, { rev: true }) : []; return { ok: true, value: ids.map(String) }; } catch { return { ok: false, unavailable: true }; } }
export async function getBNLJournalEntry(entryId: string, redis: RedisLike | null = asRedisLike(getBNLJournalRedis())): Promise<JournalReadResult<PublicBNLJournalEntry | null>> { if (!redis) return { ok: false, unavailable: true }; try { return { ok: true, value: await readLatest(redis, entryId) }; } catch { return { ok: false, unavailable: true }; } }
export async function getBNLJournalNeighbors(entryId: string, redis: RedisLike | null = asRedisLike(getBNLJournalRedis())): Promise<JournalReadResult<{ older: PublicBNLJournalEntry | null; newer: PublicBNLJournalEntry | null }>> { if (!redis) return { ok: false, unavailable: true }; try { const rank = await redis.zrank(BNL_JOURNAL_INDEX_KEY, entryId); if (rank === null) return { ok: true, value: { older: null, newer: null } }; const olderId = (await redis.zrange(BNL_JOURNAL_INDEX_KEY, rank - 1, rank - 1))[0]; const newerId = (await redis.zrange(BNL_JOURNAL_INDEX_KEY, rank + 1, rank + 1))[0]; return { ok: true, value: { older: olderId ? await readLatest(redis, String(olderId)) : null, newer: newerId ? await readLatest(redis, String(newerId)) : null } }; } catch { return { ok: false, unavailable: true }; } }
