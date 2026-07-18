import { createHash, timingSafeEqual } from "crypto";

export type BNLJournalSection = { heading: string; body: string };
export type BNLJournalEntry = { entryId: string; revision: number; title: string; excerpt: string; sections: BNLJournalSection[]; authoredAt: string; sourceWindowStart: string; sourceWindowEnd: string; contentHash: string };
export type BNLJournalEnvelope = { contractVersion: 1; kind: "journal_entry"; entry: BNLJournalEntry };

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const HASH = /^[a-f0-9]{64}$/;
const ENTRY_ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]{2,79}$/;
export const BNL_JOURNAL_MAX_PAYLOAD_BYTES = 24_000;

function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function boundedString(value: unknown, max: number) { return typeof value === "string" && value.trim().length > 0 && value.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value); }
export function countJournalWords(entry: Pick<BNLJournalEntry, "title" | "excerpt" | "sections">) { return [entry.title, entry.excerpt, ...entry.sections.flatMap((s) => [s.heading, s.body])].join(" ").match(/[\p{L}\p{N}_]+/gu)?.length ?? 0; }
export function canonicalJSON(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJSON).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJSON((value as Record<string, unknown>)[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
export function computeBNLJournalContentHash(entry: Pick<BNLJournalEntry, "title" | "excerpt" | "sections">) { return createHash("sha256").update(`${entry.title}|${entry.excerpt}|${canonicalJSON(entry.sections)}`, "utf8").digest("hex"); }
function parseUtc(value: string): number | null { if (!ISO_UTC.test(value)) return null; const ms = Date.parse(value); return Number.isFinite(ms) && new Date(ms).toISOString().startsWith(value.replace(/\.000Z$/, "Z").replace(/Z$/, "")) ? ms : null; }

export function validateBNLJournalPayload(body: unknown): { ok: true; entry: BNLJournalEntry } | { ok: false; reason: string } {
  if (!isRecord(body)) return { ok: false, reason: "invalid_contract" };
  if (body.contractVersion !== 1 || body.kind !== "journal_entry" || !isRecord(body.entry)) return { ok: false, reason: "invalid_contract" };
  const entry = body.entry;
  if (!boundedString(entry.entryId, 80) || !ENTRY_ID.test(String(entry.entryId))) return { ok: false, reason: "invalid_entry" };
  if (!Number.isInteger(entry.revision) || Number(entry.revision) <= 0) return { ok: false, reason: "invalid_revision" };
  if (!boundedString(entry.title, 160) || !boundedString(entry.excerpt, 420)) return { ok: false, reason: "invalid_text" };
  if (!Array.isArray(entry.sections) || entry.sections.length < 1 || entry.sections.length > 3) return { ok: false, reason: "invalid_sections" };
  for (const section of entry.sections) if (!isRecord(section) || !boundedString(section.heading, 120) || !boundedString(section.body, 4000)) return { ok: false, reason: "invalid_sections" };
  if (!boundedString(entry.authoredAt, 40) || !boundedString(entry.sourceWindowStart, 40) || !boundedString(entry.sourceWindowEnd, 40)) return { ok: false, reason: "invalid_timestamp" };
  const authoredAt = parseUtc(String(entry.authoredAt)), start = parseUtc(String(entry.sourceWindowStart)), end = parseUtc(String(entry.sourceWindowEnd));
  if (authoredAt === null || start === null || end === null || start > end || end > authoredAt) return { ok: false, reason: "invalid_timestamp" };
  const normalized = entry as unknown as BNLJournalEntry;
  const words = countJournalWords(normalized);
  if (words < 250 || words > 500) return { ok: false, reason: "invalid_word_count" };
  if (typeof entry.contentHash !== "string" || !HASH.test(entry.contentHash) || computeBNLJournalContentHash(normalized) !== entry.contentHash) return { ok: false, reason: "invalid_hash" };
  return { ok: true, entry: normalized };
}

export function authenticateBNLJournalRequest(provided: string | null, expected = process.env.BNL_API_KEY): boolean {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided, "utf8"); const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
