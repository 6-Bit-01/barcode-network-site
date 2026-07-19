import { Redis } from "@upstash/redis";
import { randomUUID } from "crypto";
import type { BNLJournalEntry } from "@/lib/bnl-journal-contract";
import type { JournalArchiveFilter } from "@/lib/bnl-journal-navigation";

export type PublicBNLJournalEntry = BNLJournalEntry & { publishedAt: string };
export type JournalEntryControl = {
  entryId: string;
  publicVisible: boolean;
  memoryEligible: boolean;
  updatedAt: string;
  updatedBy: "website-admin";
};
export type JournalEntryControlAuditRecord = JournalEntryControl & {
  changeId: string;
  previousPublicVisible: boolean;
  previousMemoryEligible: boolean;
};
export type AdminBNLJournalEntry = PublicBNLJournalEntry & {
  control: JournalEntryControl;
};
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
export const BNL_JOURNAL_DAILY_INDEX_KEY =
  "barcode:bnl-journal:v1:index:daily";
export const BNL_JOURNAL_WEEKLY_INDEX_KEY =
  "barcode:bnl-journal:v1:index:weekly";
export const BNL_JOURNAL_ENTRY_CONTROLS_KEY =
  "barcode:bnl-journal:v1:entry-controls";
export const BNL_JOURNAL_ENTRY_CONTROL_AUDIT_KEY =
  "barcode:bnl-journal:v1:entry-control-audit";
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
local dailyIndexKey = KEYS[4]
local weeklyIndexKey = KEYS[5]
local controlsKey = KEYS[6]
local entryId = ARGV[1]
local revision = tonumber(ARGV[2])
local contentHash = ARGV[3]
local recordJson = ARGV[4]
local score = tonumber(ARGV[5])
local controlsRaw = redis.call("GET", controlsKey)
local controls = controlsRaw and cjson.decode(controlsRaw) or {}
local control = controls[entryId]
local publicVisible = (not control) or control.publicVisible ~= false
local function repairKindIndexes(latest)
  redis.call("ZREM", indexKey, entryId)
  redis.call("ZREM", dailyIndexKey, entryId)
  redis.call("ZREM", weeklyIndexKey, entryId)
  if not publicVisible then return end
  redis.call("ZADD", indexKey, tonumber(latest._score), entryId)
  if latest.entryKind == "daily" then
    redis.call("ZADD", dailyIndexKey, tonumber(latest._score), entryId)
  elseif latest.entryKind == "weekly" then
    redis.call("ZADD", weeklyIndexKey, tonumber(latest._score), entryId)
  end
end
local existingJson = redis.call("GET", recordKey)
if existingJson then
  local existing = cjson.decode(existingJson)
  if existing.contentHash ~= contentHash then
    return cjson.encode({ status = "conflict" })
  end
  local latestJson = redis.call("GET", latestKey)
  local indexScore = redis.call("ZSCORE", indexKey, entryId)
  local latest = nil
  if latestJson then
    latest = cjson.decode(latestJson)
  end
  local repairedLatest = false
  local repairedIndexScore = nil
  if (not latestJson) and (not indexScore) then
    redis.call("SET", latestKey, existingJson)
    if publicVisible then redis.call("ZADD", indexKey, existing._score, entryId) end
    repairedLatest = true
    repairedIndexScore = existing._score
  elseif (not latestJson) and indexScore and tonumber(indexScore) == tonumber(existing._score) then
    redis.call("SET", latestKey, existingJson)
    repairedLatest = true
  elseif latest and existing.revision > latest.revision then
    redis.call("SET", latestKey, existingJson)
    if publicVisible then redis.call("ZADD", indexKey, existing._score, entryId) end
    repairedLatest = true
    repairedIndexScore = existing._score
  elseif latest and publicVisible and (not indexScore) then
    redis.call("ZADD", indexKey, latest._score, entryId)
    repairedIndexScore = latest._score
  end
  local repairedLatestJson = redis.call("GET", latestKey)
  local repairedScore = redis.call("ZSCORE", indexKey, entryId)
  if (not repairedLatestJson) or (publicVisible and (not repairedScore)) then
    return cjson.encode({ status = "unavailable" })
  end
  local repairedLatestEntry = cjson.decode(repairedLatestJson)
  if repairedLatest then
    if repairedLatestEntry.revision ~= existing.revision or repairedLatestEntry.contentHash ~= existing.contentHash then
      return cjson.encode({ status = "unavailable" })
    end
  end
  if publicVisible and repairedIndexScore and tonumber(repairedScore) ~= tonumber(repairedIndexScore) then
    return cjson.encode({ status = "unavailable" })
  end
  repairKindIndexes(repairedLatestEntry)
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
end
local finalLatestJson = redis.call("GET", latestKey)
if not finalLatestJson then
  return cjson.encode({ status = "unavailable" })
end
repairKindIndexes(cjson.decode(finalLatestJson))
if publicVisible and (not redis.call("ZSCORE", indexKey, entryId)) then
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
    ...(entry.entryKind === undefined ? {} : { entryKind: entry.entryKind }),
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
  control?: unknown;
} {
  return typeof value === "string"
    ? JSON.parse(value)
    : (value as { status?: string; publishedAt?: string });
}
function validPage(page: number) {
  return Number.isInteger(page) && page > 0 && page <= MAX_PAGE;
}
function matchesArchiveFilter(
  entry: Pick<BNLJournalEntry, "entryKind">,
  filter: JournalArchiveFilter,
) {
  return filter === "all" || entry.entryKind === filter;
}
function archiveIndexKey(filter: JournalArchiveFilter) {
  if (filter === "daily") return BNL_JOURNAL_DAILY_INDEX_KEY;
  if (filter === "weekly") return BNL_JOURNAL_WEEKLY_INDEX_KEY;
  return BNL_JOURNAL_INDEX_KEY;
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
          BNL_JOURNAL_DAILY_INDEX_KEY,
          BNL_JOURNAL_WEEKLY_INDEX_KEY,
          BNL_JOURNAL_ENTRY_CONTROLS_KEY,
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
    if (
      latest.revision < confirmed.revision ||
      (latest.revision === confirmed.revision &&
        latest.contentHash !== confirmed.contentHash)
    )
      return { ok: false, unavailable: true };
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
  filter: JournalArchiveFilter,
): Promise<PublicBNLJournalEntry[] | null> {
  if (!validPage(page)) return null;
  const start = (page - 1) * PAGE_SIZE;
  const ids = await redis.zrange(
    archiveIndexKey(filter),
    start,
    start + PAGE_SIZE,
    { rev: true },
  );
  const entries = await Promise.all(
    ids.map((rawId) =>
      redis.get<PublicBNLJournalEntry>(journalLatestKey(String(rawId))),
    ),
  );
  return entries
    .filter(
      (entry): entry is PublicBNLJournalEntry =>
        entry !== null && matchesArchiveFilter(entry, filter),
    )
    .map(publicEntry);
}
export async function listBNLJournalArchive(
  page = 1,
  redis: RedisLike | null = asRedisLike(getBNLJournalRedis()),
  filter: JournalArchiveFilter = "all",
): Promise<JournalReadResult<JournalArchivePage | null>> {
  if (!redis) return { ok: false, unavailable: true };
  if (!validPage(page)) return { ok: true, value: null };
  try {
    const entries = await entriesForPage(redis, page, filter);
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
    const controls = await listJournalEntryControls(redis);
    if (
      controls.some(
        (control) => control.entryId === entryId && !control.publicVisible,
      )
    )
      return { ok: true, value: null };
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
  filter: JournalArchiveFilter = "all",
): Promise<
  JournalReadResult<{
    older: PublicBNLJournalEntry | null;
    newer: PublicBNLJournalEntry | null;
  }>
> {
  if (!redis) return { ok: false, unavailable: true };
  try {
    const indexKey = archiveIndexKey(filter);
    const rank = redis.zrank
      ? await redis.zrank(indexKey, entryId)
      : null;
    if (rank === null) return { ok: true, value: { older: null, newer: null } };
    // ZRANK is ascending (oldest first), so the directly adjacent members in
    // the selected index are the selected kind's older and newer entries.
    const olderIds =
      rank > 0 ? await redis.zrange(indexKey, rank - 1, rank - 1) : [];
    const newerIds = await redis.zrange(indexKey, rank + 1, rank + 1);
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
        older:
          older && matchesArchiveFilter(older, filter)
            ? publicEntry(older)
            : null,
        newer:
          newer && matchesArchiveFilter(newer, filter)
            ? publicEntry(newer)
            : null,
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

const ENTRY_ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]{2,79}$/;
const MAX_CONTROL_AUDIT = 250;
const ENTRY_CONTROL_SCRIPT = `
-- journal-entry-control-v1
local controlsKey = KEYS[1]
local auditKey = KEYS[2]
local indexKey = KEYS[3]
local dailyIndexKey = KEYS[4]
local weeklyIndexKey = KEYS[5]
local latestKey = KEYS[6]
local entryId = ARGV[1]
local control = cjson.decode(ARGV[2])
local auditRecord = cjson.decode(ARGV[3])
local maxAudit = tonumber(ARGV[4])
local latestJson = redis.call("GET", latestKey)
if not latestJson then return cjson.encode({ status = "missing" }) end
local latest = cjson.decode(latestJson)
local controlsRaw = redis.call("GET", controlsKey)
local controls = controlsRaw and cjson.decode(controlsRaw) or {}
controls[entryId] = control
local auditRaw = redis.call("GET", auditKey)
local audit = auditRaw and cjson.decode(auditRaw) or {}
table.insert(audit, 1, auditRecord)
while #audit > maxAudit do table.remove(audit) end
redis.call("SET", controlsKey, cjson.encode(controls))
redis.call("SET", auditKey, cjson.encode(audit))
redis.call("ZREM", indexKey, entryId)
redis.call("ZREM", dailyIndexKey, entryId)
redis.call("ZREM", weeklyIndexKey, entryId)
if control.publicVisible then
  redis.call("ZADD", indexKey, tonumber(latest._score), entryId)
  if latest.entryKind == "daily" then
    redis.call("ZADD", dailyIndexKey, tonumber(latest._score), entryId)
  elseif latest.entryKind == "weekly" then
    redis.call("ZADD", weeklyIndexKey, tonumber(latest._score), entryId)
  end
end
return cjson.encode({ status = "updated", control = control })
`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validIso(value: unknown): value is string {
  return (
    typeof value === "string" &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value
  );
}

export function defaultJournalEntryControl(
  entryId: string,
): JournalEntryControl {
  return {
    entryId,
    publicVisible: true,
    memoryEligible: true,
    updatedAt: "1970-01-01T00:00:00.000Z",
    updatedBy: "website-admin",
  };
}

export function sanitizeJournalEntryControl(
  value: unknown,
): JournalEntryControl | null {
  if (
    !isRecord(value) ||
    typeof value.entryId !== "string" ||
    !ENTRY_ID.test(value.entryId) ||
    typeof value.publicVisible !== "boolean" ||
    typeof value.memoryEligible !== "boolean" ||
    !validIso(value.updatedAt) ||
    value.updatedBy !== "website-admin"
  )
    return null;
  return {
    entryId: value.entryId,
    publicVisible: value.publicVisible,
    memoryEligible: value.memoryEligible,
    updatedAt: value.updatedAt,
    updatedBy: "website-admin",
  };
}

function sanitizeJournalEntryControlAudit(
  value: unknown,
): JournalEntryControlAuditRecord | null {
  const control = sanitizeJournalEntryControl(value);
  if (!control || !isRecord(value)) return null;
  if (
    typeof value.changeId !== "string" ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{2,119}$/.test(value.changeId) ||
    typeof value.previousPublicVisible !== "boolean" ||
    typeof value.previousMemoryEligible !== "boolean"
  )
    return null;
  return {
    ...control,
    changeId: value.changeId,
    previousPublicVisible: value.previousPublicVisible,
    previousMemoryEligible: value.previousMemoryEligible,
  };
}

export async function listJournalEntryControls(
  redis: Pick<RedisLike, "get"> | null = asRedisLike(getBNLJournalRedis()),
): Promise<JournalEntryControl[]> {
  if (!redis) return [];
  const raw = await redis.get<unknown>(BNL_JOURNAL_ENTRY_CONTROLS_KEY);
  if (!isRecord(raw)) return [];
  return Object.values(raw)
    .map(sanitizeJournalEntryControl)
    .filter((item): item is JournalEntryControl => Boolean(item))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function listJournalEntryControlAudit(
  redis: Pick<RedisLike, "get"> | null = asRedisLike(getBNLJournalRedis()),
): Promise<JournalEntryControlAuditRecord[]> {
  if (!redis) return [];
  const raw = await redis.get<unknown>(BNL_JOURNAL_ENTRY_CONTROL_AUDIT_KEY);
  if (!Array.isArray(raw)) return [];
  return raw
    .map(sanitizeJournalEntryControlAudit)
    .filter((item): item is JournalEntryControlAuditRecord => Boolean(item))
    .slice(0, MAX_CONTROL_AUDIT);
}

export async function updateJournalEntryControl(
  entryId: string,
  publicVisible: boolean,
  memoryEligible: boolean,
  redis: RedisLike | null = asRedisLike(getBNLJournalRedis()),
): Promise<
  | { ok: true; control: JournalEntryControl }
  | { ok: false; missing?: true; unavailable?: true }
> {
  if (!redis?.eval || !ENTRY_ID.test(entryId))
    return { ok: false, unavailable: true };
  try {
    const controls = await listJournalEntryControls(redis);
    const previous =
      controls.find((item) => item.entryId === entryId) ??
      defaultJournalEntryControl(entryId);
    const control: JournalEntryControl = {
      entryId,
      publicVisible,
      memoryEligible,
      updatedAt: new Date().toISOString(),
      updatedBy: "website-admin",
    };
    const audit: JournalEntryControlAuditRecord = {
      ...control,
      changeId: `journal-control-${randomUUID()}`,
      previousPublicVisible: previous.publicVisible,
      previousMemoryEligible: previous.memoryEligible,
    };
    const result = parseAtomicResult(
      await redis.eval(
        ENTRY_CONTROL_SCRIPT,
        [
          BNL_JOURNAL_ENTRY_CONTROLS_KEY,
          BNL_JOURNAL_ENTRY_CONTROL_AUDIT_KEY,
          BNL_JOURNAL_INDEX_KEY,
          BNL_JOURNAL_DAILY_INDEX_KEY,
          BNL_JOURNAL_WEEKLY_INDEX_KEY,
          journalLatestKey(entryId),
        ],
        [
          entryId,
          JSON.stringify(control),
          JSON.stringify(audit),
          MAX_CONTROL_AUDIT,
        ],
      ),
    );
    if (result.status === "missing") return { ok: false, missing: true };
    const stored = sanitizeJournalEntryControl(result.control);
    return stored
      ? { ok: true, control: stored }
      : { ok: false, unavailable: true };
  } catch {
    return { ok: false, unavailable: true };
  }
}

export async function listBNLJournalAdminEntries(
  redis: RedisLike | null = asRedisLike(getBNLJournalRedis()),
): Promise<JournalReadResult<AdminBNLJournalEntry[]>> {
  if (!redis) return { ok: false, unavailable: true };
  try {
    const controls = await listJournalEntryControls(redis);
    const visibleIds = await redis.zrange(BNL_JOURNAL_INDEX_KEY, 0, -1, {
      rev: true,
    });
    const ids = [
      ...new Set([
        ...visibleIds.map(String),
        ...controls.map((item) => item.entryId),
      ]),
    ];
    const controlMap = new Map(
      controls.map((item) => [item.entryId, item]),
    );
    const entries = await Promise.all(
      ids.map((id) =>
        redis.get<PublicBNLJournalEntry>(journalLatestKey(id)),
      ),
    );
    return {
      ok: true,
      value: entries
        .filter((entry): entry is PublicBNLJournalEntry => Boolean(entry))
        .map((entry) => ({
          ...publicEntry(entry),
          control:
            controlMap.get(entry.entryId) ??
            defaultJournalEntryControl(entry.entryId),
        }))
        .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)),
    };
  } catch {
    return { ok: false, unavailable: true };
  }
}
