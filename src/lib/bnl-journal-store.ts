import { Redis } from "@upstash/redis";
import type { BNLJournalEntry } from "@/lib/bnl-journal-contract";

export type PublicBNLJournalEntry = BNLJournalEntry & { publishedAt: string };
export type JournalReadResult<T> =
  | { ok: true; value: T }
  | { ok: false; unavailable: true };
export type JournalWriteResult =
  | {
      ok: true;
      persisted: true;
      idempotent: boolean;
      entry: Pick<
        PublicBNLJournalEntry,
        "entryId" | "revision" | "contentHash" | "publishedAt"
      >;
    }
  | { ok: false; conflict: true }
  | { ok: false; unavailable: true };

export const BNL_JOURNAL_INDEX_KEY = "barcode:bnl-journal:v1:index";
const KEY_PREFIX = "barcode:bnl-journal:v1:entry";
const LATEST_PREFIX = "barcode:bnl-journal:v1:latest";
const PAGE_SIZE = 9;
const MAX_PAGE = 10_000;

export type RedisLike = {
  get<T = unknown>(key: string): Promise<T | null>;
  zadd(
    key: string,
    member: { score: number; member: string },
  ): Promise<unknown>;
  zrange(
    key: string,
    start: number,
    stop: number,
    opts?: unknown,
  ): Promise<unknown[]>;
  zrank?(key: string, member: string): Promise<number | null>;
  eval?<T = unknown>(
    script: string,
    keys: string[],
    args: unknown[],
  ): Promise<T>;
};

export type JournalArchivePage = {
  entries: PublicBNLJournalEntry[];
  page: number;
  hasOlder: boolean;
  hasNewer: boolean;
};

const PUBLISH_SCRIPT = `
local recordKey = KEYS[1]
local latestKey = KEYS[2]
local indexKey = KEYS[3]
local entryId = ARGV[1]
local revision = tonumber(ARGV[2])
local contentHash = ARGV[3]
local recordJson = ARGV[4]
local score = tonumber(ARGV[5])
local existingJson = redis.call("GET", recordKey)
if existingJson then
  local existing = cjson.decode(existingJson)
  if existing.contentHash ~= contentHash then
    return cjson.encode({ status = "conflict" })
  end
  local latestJson = redis.call("GET", latestKey)
  local indexScore = redis.call("ZSCORE", indexKey, entryId)
  local isLatest = false
  if latestJson then
    local latest = cjson.decode(latestJson)
    isLatest = latest.revision == existing.revision and latest.contentHash == existing.contentHash
  end
  if (not latestJson) and indexScore and tonumber(indexScore) == tonumber(existing._score) then
    redis.call("SET", latestKey, existingJson)
  elseif isLatest and (not indexScore) then
    redis.call("ZADD", indexKey, existing._score, entryId)
  end
  local repairedLatest = redis.call("GET", latestKey)
  local repairedScore = redis.call("ZSCORE", indexKey, entryId)
  if (not repairedLatest) or (not repairedScore) then
    return cjson.encode({ status = "unavailable" })
  end
  return cjson.encode({ status = "idempotent", publishedAt = existing.publishedAt })
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
elseif not redis.call("ZSCORE", indexKey, entryId) then
  local latest = cjson.decode(latestJson)
  redis.call("ZADD", indexKey, tonumber(latest._score), entryId)
end
if (not redis.call("GET", latestKey)) or (not redis.call("ZSCORE", indexKey, entryId)) then
  return cjson.encode({ status = "unavailable" })
end
return cjson.encode({ status = "created" })
`;

export function getBNLJournalRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? new Redis({ url, token }) : null;
}
function asRedisLike(redis: Redis | null): RedisLike | null {
  return redis as unknown as RedisLike | null;
}
export function journalEntryKey(entryId: string, revision: number) {
  return `${KEY_PREFIX}:${entryId}:${revision}`;
}
export function journalLatestKey(entryId: string) {
  return `${LATEST_PREFIX}:${entryId}`;
}
function normalize(
  entry: BNLJournalEntry,
  publishedAt: string,
  score?: number,
): PublicBNLJournalEntry & { _score?: number } {
  return {
    entryId: entry.entryId,
    revision: entry.revision,
    title: entry.title,
    excerpt: entry.excerpt,
    sections: entry.sections.map((s) => ({ heading: s.heading, body: s.body })),
    authoredAt: entry.authoredAt,
    sourceWindowStart: entry.sourceWindowStart,
    sourceWindowEnd: entry.sourceWindowEnd,
    contentHash: entry.contentHash,
    publishedAt,
    ...(score === undefined ? {} : { _score: score }),
  };
}
function publicEntry(
  entry: PublicBNLJournalEntry & { _score?: number },
): PublicBNLJournalEntry {
  const { _score, ...rest } = entry;
  void _score;
  return rest;
}
function samePublic(a: PublicBNLJournalEntry, b: PublicBNLJournalEntry) {
  return JSON.stringify(a) === JSON.stringify(b);
}
function scoreOf(publishedAt: string, revision: number) {
  return Date.parse(publishedAt) + Math.min(revision, 999) / 1000;
}
function parseAtomicResult(value: unknown): {
  status?: string;
  publishedAt?: string;
} {
  return typeof value === "string"
    ? JSON.parse(value)
    : (value as { status?: string; publishedAt?: string });
}
function validPage(page: number) {
  return Number.isInteger(page) && page > 0 && page <= MAX_PAGE;
}

export async function publishBNLJournalEntry(
  entry: BNLJournalEntry,
  redis: RedisLike | null = asRedisLike(getBNLJournalRedis()),
): Promise<JournalWriteResult> {
  if (!redis?.eval) return { ok: false, unavailable: true };
  try {
    const publishedAt = new Date().toISOString();
    const score = scoreOf(publishedAt, entry.revision);
    const stored = normalize(entry, publishedAt, score);
    const result = parseAtomicResult(
      await redis.eval(
        PUBLISH_SCRIPT,
        [
          journalEntryKey(entry.entryId, entry.revision),
          journalLatestKey(entry.entryId),
          BNL_JOURNAL_INDEX_KEY,
        ],
        [
          entry.entryId,
          entry.revision,
          entry.contentHash,
          JSON.stringify(stored),
          score,
          entry.entryId,
        ],
      ),
    );
    if (result.status === "conflict") return { ok: false, conflict: true };
    if (result.status === "unavailable")
      return { ok: false, unavailable: true };
    const confirmed = await redis.get<
      PublicBNLJournalEntry & { _score?: number }
    >(journalEntryKey(entry.entryId, entry.revision));
    if (!confirmed) return { ok: false, unavailable: true };
    const expected = normalize(
      entry,
      result.publishedAt ?? confirmed.publishedAt,
      confirmed._score,
    );
    if (
      confirmed.contentHash !== entry.contentHash ||
      !samePublic(publicEntry(confirmed), publicEntry(expected))
    )
      return { ok: false, unavailable: true };
    const latest = await redis.get<PublicBNLJournalEntry>(
      journalLatestKey(entry.entryId),
    );
    if (!latest) return { ok: false, unavailable: true };
    return {
      ok: true,
      persisted: true,
      idempotent: result.status === "idempotent",
      entry: {
        entryId: confirmed.entryId,
        revision: confirmed.revision,
        contentHash: confirmed.contentHash,
        publishedAt: confirmed.publishedAt,
      },
    };
  } catch {
    return { ok: false, unavailable: true };
  }
}

async function entriesForPage(
  redis: RedisLike,
  page: number,
): Promise<PublicBNLJournalEntry[] | null> {
  if (!validPage(page)) return null;
  const start = (page - 1) * PAGE_SIZE;
  const ids = await redis.zrange(
    BNL_JOURNAL_INDEX_KEY,
    start,
    start + PAGE_SIZE,
    { rev: true },
  );
  const entries: PublicBNLJournalEntry[] = [];
  for (const rawId of ids) {
    const entry = await redis.get<PublicBNLJournalEntry>(
      journalLatestKey(String(rawId)),
    );
    if (entry) entries.push(publicEntry(entry));
  }
  return entries;
}
export async function listBNLJournalArchive(
  page = 1,
  redis: RedisLike | null = asRedisLike(getBNLJournalRedis()),
): Promise<JournalReadResult<JournalArchivePage | null>> {
  if (!redis) return { ok: false, unavailable: true };
  if (!validPage(page)) return { ok: true, value: null };
  try {
    const entries = await entriesForPage(redis, page);
    if (!entries) return { ok: true, value: null };
    return {
      ok: true,
      value: {
        entries: entries.slice(0, PAGE_SIZE),
        page,
        hasOlder: entries.length > PAGE_SIZE,
        hasNewer: page > 1,
      },
    };
  } catch {
    return { ok: false, unavailable: true };
  }
}
export async function getBNLJournalEntry(
  entryId: string,
  redis: RedisLike | null = asRedisLike(getBNLJournalRedis()),
): Promise<JournalReadResult<PublicBNLJournalEntry | null>> {
  if (!redis) return { ok: false, unavailable: true };
  try {
    const entry = await redis.get<PublicBNLJournalEntry>(
      journalLatestKey(entryId),
    );
    return { ok: true, value: entry ? publicEntry(entry) : null };
  } catch {
    return { ok: false, unavailable: true };
  }
}
export async function getBNLJournalNeighbors(
  entryId: string,
  redis: RedisLike | null = asRedisLike(getBNLJournalRedis()),
): Promise<
  JournalReadResult<{
    older: PublicBNLJournalEntry | null;
    newer: PublicBNLJournalEntry | null;
  }>
> {
  if (!redis) return { ok: false, unavailable: true };
  try {
    const rank = redis.zrank
      ? await redis.zrank(BNL_JOURNAL_INDEX_KEY, entryId)
      : null;
    if (rank === null) return { ok: true, value: { older: null, newer: null } };
    const olderIds = await redis.zrange(
      BNL_JOURNAL_INDEX_KEY,
      rank + 1,
      rank + 1,
      { rev: true },
    );
    const newerIds =
      rank > 0
        ? await redis.zrange(BNL_JOURNAL_INDEX_KEY, rank - 1, rank - 1, {
            rev: true,
          })
        : [];
    const older = olderIds[0]
      ? await redis.get<PublicBNLJournalEntry>(
          journalLatestKey(String(olderIds[0])),
        )
      : null;
    const newer = newerIds[0]
      ? await redis.get<PublicBNLJournalEntry>(
          journalLatestKey(String(newerIds[0])),
        )
      : null;
    return {
      ok: true,
      value: {
        older: older ? publicEntry(older) : null,
        newer: newer ? publicEntry(newer) : null,
      },
    };
  } catch {
    return { ok: false, unavailable: true };
  }
}
export async function listAllBNLJournalEntries(
  redis: RedisLike | null = asRedisLike(getBNLJournalRedis()),
): Promise<JournalReadResult<PublicBNLJournalEntry[]>> {
  if (!redis) return { ok: false, unavailable: true };
  try {
    const ids = await redis.zrange(BNL_JOURNAL_INDEX_KEY, 0, -1, { rev: true });
    const entries = await Promise.all(
      ids.map((id) =>
        redis.get<PublicBNLJournalEntry>(journalLatestKey(String(id))),
      ),
    );
    return {
      ok: true,
      value: entries
        .filter((entry): entry is PublicBNLJournalEntry => Boolean(entry))
        .map(publicEntry),
    };
  } catch {
    return { ok: false, unavailable: true };
  }
}
