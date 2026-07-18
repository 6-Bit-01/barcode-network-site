import { Redis } from "@upstash/redis";
import type { BNLJournalEntry } from "@/lib/bnl-journal-contract";

export type PublicBNLJournalEntry = BNLJournalEntry & { publishedAt: string };
export type JournalReadResult<T> = { ok: true; value: T } | { ok: false; unavailable: true };
export type JournalWriteResult = { ok: true; persisted: true; idempotent: boolean; entry: Pick<PublicBNLJournalEntry, "entryId" | "revision" | "contentHash" | "publishedAt"> } | { ok: false; conflict: true } | { ok: false; unavailable: true };

export const BNL_JOURNAL_INDEX_KEY = "barcode:bnl-journal:v1:index";
const KEY_PREFIX = "barcode:bnl-journal:v1:entry";
const PAGE_SIZE = 9;

type RedisPipelineLike = { set(key: string, value: unknown, opts?: unknown): RedisPipelineLike; zadd(key: string, member: { score: number; member: string }): RedisPipelineLike; exec(): Promise<unknown> };
type RedisLike = { get<T = unknown>(key: string): Promise<T | null>; set(key: string, value: unknown, opts?: unknown): Promise<unknown>; zadd(key: string, member: { score: number; member: string }): Promise<unknown>; zrange(key: string, start: number, stop: number, opts?: unknown): Promise<unknown[]>; multi(): { set(key: string, value: unknown, opts?: unknown): RedisPipelineLike; zadd(key: string, member: { score: number; member: string }): RedisPipelineLike; exec(): Promise<unknown> } };

export function getBNLJournalRedis(): Redis | null { const url = process.env.UPSTASH_REDIS_REST_URL; const token = process.env.UPSTASH_REDIS_REST_TOKEN; return url && token ? new Redis({ url, token }) : null; }
function asRedisLike(redis: Redis | null): RedisLike | null { return redis as unknown as RedisLike | null; }
function entryKey(entryId: string, revision: number) { return `${KEY_PREFIX}:${entryId}:${revision}`; }
function member(entryId: string, revision: number) { return `${entryId}:${revision}`; }
function normalize(entry: BNLJournalEntry, publishedAt: string): PublicBNLJournalEntry { return { entryId: entry.entryId, revision: entry.revision, title: entry.title, excerpt: entry.excerpt, sections: entry.sections.map((s) => ({ heading: s.heading, body: s.body })), authoredAt: entry.authoredAt, sourceWindowStart: entry.sourceWindowStart, sourceWindowEnd: entry.sourceWindowEnd, contentHash: entry.contentHash, publishedAt }; }
function same(a: PublicBNLJournalEntry, b: PublicBNLJournalEntry) { return JSON.stringify(a) === JSON.stringify(b); }
function scoreOf(publishedAt: string, revision: number) { return Date.parse(publishedAt) + Math.min(revision, 999) / 1000; }
async function readMember(redis: RedisLike, m: string): Promise<PublicBNLJournalEntry | null> { const [entryId, revisionText] = m.split(":"); const revision = Number(revisionText); if (!entryId || !Number.isInteger(revision)) return null; return redis.get<PublicBNLJournalEntry>(entryKey(entryId, revision)); }

export async function publishBNLJournalEntry(entry: BNLJournalEntry, redis: RedisLike | null = asRedisLike(getBNLJournalRedis())): Promise<JournalWriteResult> {
  if (!redis) return { ok: false, unavailable: true };
  try {
    const key = entryKey(entry.entryId, entry.revision);
    const existing = await redis.get<PublicBNLJournalEntry>(key);
    if (existing) {
      const candidate = normalize(entry, existing.publishedAt);
      if (existing.contentHash === entry.contentHash && same(existing, candidate)) return { ok: true, persisted: true, idempotent: true, entry: { entryId: existing.entryId, revision: existing.revision, contentHash: existing.contentHash, publishedAt: existing.publishedAt } };
      return { ok: false, conflict: true };
    }
    const stored = normalize(entry, new Date().toISOString());
    await redis.multi().set(key, stored, { nx: true }).zadd(BNL_JOURNAL_INDEX_KEY, { score: scoreOf(stored.publishedAt, stored.revision), member: member(stored.entryId, stored.revision) }).exec();
    const confirmed = await redis.get<PublicBNLJournalEntry>(key);
    if (!confirmed || !same(confirmed, stored)) return { ok: false, unavailable: true };
    return { ok: true, persisted: true, idempotent: false, entry: { entryId: stored.entryId, revision: stored.revision, contentHash: stored.contentHash, publishedAt: stored.publishedAt } };
  } catch { return { ok: false, unavailable: true }; }
}

async function newestEntries(redis: RedisLike, limit: number, offset = 0): Promise<PublicBNLJournalEntry[]> {
  const members = await redis.zrange(BNL_JOURNAL_INDEX_KEY, 0, Math.max(60, offset + limit * 4), { rev: true });
  const byId = new Map<string, PublicBNLJournalEntry>();
  for (const raw of members) { const m = String(raw); const e = await readMember(redis, m); if (e && (!byId.has(e.entryId) || e.revision > byId.get(e.entryId)!.revision)) byId.set(e.entryId, e); }
  return [...byId.values()].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)).slice(offset, offset + limit);
}
export async function listBNLJournalArchive(page = 1, redis: RedisLike | null = asRedisLike(getBNLJournalRedis())): Promise<JournalReadResult<{ entries: PublicBNLJournalEntry[]; page: number; hasOlder: boolean; hasNewer: boolean }>> {
  if (!redis) return { ok: false, unavailable: true };
  try { const safePage = Math.max(1, Math.floor(page)); const entries = await newestEntries(redis, PAGE_SIZE + 1, (safePage - 1) * PAGE_SIZE); return { ok: true, value: { entries: entries.slice(0, PAGE_SIZE), page: safePage, hasOlder: entries.length > PAGE_SIZE, hasNewer: safePage > 1 } }; } catch { return { ok: false, unavailable: true }; }
}
export async function getBNLJournalEntry(entryId: string, redis: RedisLike | null = asRedisLike(getBNLJournalRedis())): Promise<JournalReadResult<PublicBNLJournalEntry | null>> { if (!redis) return { ok: false, unavailable: true }; try { const entries = await newestEntries(redis, 100); return { ok: true, value: entries.find((e) => e.entryId === entryId) ?? null }; } catch { return { ok: false, unavailable: true }; } }
export async function getBNLJournalNeighbors(entryId: string, redis: RedisLike | null = asRedisLike(getBNLJournalRedis())): Promise<JournalReadResult<{ older: PublicBNLJournalEntry | null; newer: PublicBNLJournalEntry | null }>> { if (!redis) return { ok: false, unavailable: true }; try { const entries = await newestEntries(redis, 100); const i = entries.findIndex((e) => e.entryId === entryId); return { ok: true, value: { newer: i > 0 ? entries[i - 1] : null, older: i >= 0 && i < entries.length - 1 ? entries[i + 1] : null } }; } catch { return { ok: false, unavailable: true }; } }
