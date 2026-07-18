import { Redis } from "@upstash/redis";
import type { BNLJournalEntry } from "@/lib/bnl-journal-contract";

export type PublicBNLJournalEntry = BNLJournalEntry & { publishedAt: string };
export type JournalReadResult<T> = { ok: true; value: T } | { ok: false; unavailable: true };
export type JournalWriteResult = { ok: true; persisted: true; idempotent: boolean; entry: Pick<PublicBNLJournalEntry, "entryId" | "revision" | "contentHash" | "publishedAt"> } | { ok: false; conflict: true } | { ok: false; unavailable: true };

export const BNL_JOURNAL_INDEX_KEY = "barcode:bnl-journal:v1:index";
const KEY_PREFIX = "barcode:bnl-journal:v1:entry";
const LATEST_PREFIX = "barcode:bnl-journal:v1:latest";
const PAGE_SIZE = 9;
const MAX_PAGE = 10_000;
const SCAN_BATCH = 50;

export type RedisLike = {
  get<T = unknown>(key: string): Promise<T | null>;
  zadd(key: string, member: { score: number; member: string }): Promise<unknown>;
  zrange(key: string, start: number, stop: number, opts?: unknown): Promise<unknown[]>;
  eval?<T = unknown>(script: string, keys: string[], args: unknown[]): Promise<T>;
};

export type JournalArchivePage = { entries: PublicBNLJournalEntry[]; page: number; hasOlder: boolean; hasNewer: boolean };

const PUBLISH_SCRIPT = `
local recordKey = KEYS[1]
local latestKey = KEYS[2]
local indexKey = KEYS[3]
local entryId = ARGV[1]
local revision = tonumber(ARGV[2])
local contentHash = ARGV[3]
local recordJson = ARGV[4]
local score = tonumber(ARGV[5])
local member = ARGV[6]
local existingJson = redis.call("GET", recordKey)
if existingJson then
  local existing = cjson.decode(existingJson)
  if existing.contentHash == contentHash then
    return cjson.encode({ status = "idempotent", publishedAt = existing.publishedAt })
  end
  return cjson.encode({ status = "conflict" })
end
redis.call("SET", recordKey, recordJson, "NX")
local storedJson = redis.call("GET", recordKey)
if storedJson ~= recordJson then
  local stored = cjson.decode(storedJson)
  if stored.contentHash == contentHash then
    return cjson.encode({ status = "idempotent", publishedAt = stored.publishedAt })
  end
  return cjson.encode({ status = "conflict" })
end
local latestJson = redis.call("GET", latestKey)
if (not latestJson) or tonumber(cjson.decode(latestJson).revision) <= revision then
  redis.call("SET", latestKey, recordJson)
  redis.call("ZADD", indexKey, score, entryId)
else
  local latest = cjson.decode(latestJson)
  redis.call("ZADD", indexKey, tonumber(latest._score), entryId)
end
return cjson.encode({ status = "created" })
`;

export function getBNLJournalRedis(): Redis | null { const url = process.env.UPSTASH_REDIS_REST_URL; const token = process.env.UPSTASH_REDIS_REST_TOKEN; return url && token ? new Redis({ url, token }) : null; }
function asRedisLike(redis: Redis | null): RedisLike | null { return redis as unknown as RedisLike | null; }
export function journalEntryKey(entryId: string, revision: number) { return `${KEY_PREFIX}:${entryId}:${revision}`; }
export function journalLatestKey(entryId: string) { return `${LATEST_PREFIX}:${entryId}`; }
function normalize(entry: BNLJournalEntry, publishedAt: string, score?: number): PublicBNLJournalEntry & { _score?: number } { return { entryId: entry.entryId, revision: entry.revision, title: entry.title, excerpt: entry.excerpt, sections: entry.sections.map((s) => ({ heading: s.heading, body: s.body })), authoredAt: entry.authoredAt, sourceWindowStart: entry.sourceWindowStart, sourceWindowEnd: entry.sourceWindowEnd, contentHash: entry.contentHash, publishedAt, ...(score === undefined ? {} : { _score: score }) }; }
function publicEntry(entry: PublicBNLJournalEntry & { _score?: number }): PublicBNLJournalEntry { const { _score, ...rest } = entry; void _score; return rest; }
function samePublic(a: PublicBNLJournalEntry, b: PublicBNLJournalEntry) { return JSON.stringify(a) === JSON.stringify(b); }
function scoreOf(publishedAt: string, revision: number) { return Date.parse(publishedAt) + Math.min(revision, 999) / 1000; }
function parseAtomicResult(value: unknown): { status?: string; publishedAt?: string } { return typeof value === "string" ? JSON.parse(value) : (value as { status?: string; publishedAt?: string }); }
function validPage(page: number) { return Number.isInteger(page) && page > 0 && page <= MAX_PAGE; }

export async function publishBNLJournalEntry(entry: BNLJournalEntry, redis: RedisLike | null = asRedisLike(getBNLJournalRedis())): Promise<JournalWriteResult> {
  if (!redis?.eval) return { ok: false, unavailable: true };
  try {
    const publishedAt = new Date().toISOString();
    const score = scoreOf(publishedAt, entry.revision);
    const stored = normalize(entry, publishedAt, score);
    const result = parseAtomicResult(await redis.eval(PUBLISH_SCRIPT, [journalEntryKey(entry.entryId, entry.revision), journalLatestKey(entry.entryId), BNL_JOURNAL_INDEX_KEY], [entry.entryId, entry.revision, entry.contentHash, JSON.stringify(stored), score, entry.entryId]));
    if (result.status === "conflict") return { ok: false, conflict: true };
    const confirmed = await redis.get<PublicBNLJournalEntry & { _score?: number }>(journalEntryKey(entry.entryId, entry.revision));
    if (!confirmed) return { ok: false, unavailable: true };
    const expected = normalize(entry, result.publishedAt ?? confirmed.publishedAt, confirmed._score);
    if (confirmed.contentHash !== entry.contentHash || !samePublic(publicEntry(confirmed), publicEntry(expected))) return { ok: false, unavailable: true };
    const latest = await redis.get<PublicBNLJournalEntry>(journalLatestKey(entry.entryId));
    if (!latest) return { ok: false, unavailable: true };
    return { ok: true, persisted: true, idempotent: result.status === "idempotent", entry: { entryId: confirmed.entryId, revision: confirmed.revision, contentHash: confirmed.contentHash, publishedAt: confirmed.publishedAt } };
  } catch { return { ok: false, unavailable: true }; }
}

async function entriesForPage(redis: RedisLike, page: number): Promise<PublicBNLJournalEntry[] | null> {
  if (!validPage(page)) return null;
  const needed = page * PAGE_SIZE + 1;
  const entries: PublicBNLJournalEntry[] = [];
  let start = 0;
  while (entries.length < needed) {
    const ids = await redis.zrange(BNL_JOURNAL_INDEX_KEY, start, start + SCAN_BATCH - 1, { rev: true });
    if (!ids.length) break;
    for (const rawId of ids) {
      const entry = await redis.get<PublicBNLJournalEntry>(journalLatestKey(String(rawId)));
      if (entry) entries.push(publicEntry(entry));
      if (entries.length >= needed) break;
    }
    if (ids.length < SCAN_BATCH) break;
    start += SCAN_BATCH;
  }
  return entries.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE + 1);
}
export async function listBNLJournalArchive(page = 1, redis: RedisLike | null = asRedisLike(getBNLJournalRedis())): Promise<JournalReadResult<JournalArchivePage | null>> {
  if (!redis) return { ok: false, unavailable: true };
  if (!validPage(page)) return { ok: true, value: null };
  try { const entries = await entriesForPage(redis, page); if (!entries) return { ok: true, value: null }; return { ok: true, value: { entries: entries.slice(0, PAGE_SIZE), page, hasOlder: entries.length > PAGE_SIZE, hasNewer: page > 1 } }; } catch { return { ok: false, unavailable: true }; }
}
export async function getBNLJournalEntry(entryId: string, redis: RedisLike | null = asRedisLike(getBNLJournalRedis())): Promise<JournalReadResult<PublicBNLJournalEntry | null>> { if (!redis) return { ok: false, unavailable: true }; try { const entry = await redis.get<PublicBNLJournalEntry>(journalLatestKey(entryId)); return { ok: true, value: entry ? publicEntry(entry) : null }; } catch { return { ok: false, unavailable: true }; } }
export async function getBNLJournalNeighbors(entryId: string, redis: RedisLike | null = asRedisLike(getBNLJournalRedis())): Promise<JournalReadResult<{ older: PublicBNLJournalEntry | null; newer: PublicBNLJournalEntry | null }>> {
  if (!redis) return { ok: false, unavailable: true };
  try { let start = 0; let previous: PublicBNLJournalEntry | null = null; while (true) { const ids = await redis.zrange(BNL_JOURNAL_INDEX_KEY, start, start + SCAN_BATCH - 1, { rev: true }); if (!ids.length) return { ok: true, value: { older: null, newer: null } }; for (const rawId of ids) { const current = await redis.get<PublicBNLJournalEntry>(journalLatestKey(String(rawId))); if (!current) continue; if (current.entryId === entryId) { const nextId = ids[ids.indexOf(rawId) + 1]; const older = nextId ? await redis.get<PublicBNLJournalEntry>(journalLatestKey(String(nextId))) : null; return { ok: true, value: { newer: previous, older: older ? publicEntry(older) : null } }; } previous = publicEntry(current); } if (ids.length < SCAN_BATCH) return { ok: true, value: { older: null, newer: null } }; start += SCAN_BATCH; } } catch { return { ok: false, unavailable: true }; }
}
export async function listAllBNLJournalEntries(redis: RedisLike | null = asRedisLike(getBNLJournalRedis())): Promise<JournalReadResult<PublicBNLJournalEntry[]>> { if (!redis) return { ok: false, unavailable: true }; try { const ids = await redis.zrange(BNL_JOURNAL_INDEX_KEY, 0, -1, { rev: true }); const entries = await Promise.all(ids.map((id) => redis.get<PublicBNLJournalEntry>(journalLatestKey(String(id))))); return { ok: true, value: entries.filter((entry): entry is PublicBNLJournalEntry => Boolean(entry)).map(publicEntry) }; } catch { return { ok: false, unavailable: true }; } }
