import { createHash } from "crypto";
import { get, put } from "@vercel/blob";
import { getBNLJournalEntry, getBNLJournalRedis, listJournalEntryControls } from "@/lib/bnl-journal-store";
import { canonicalJSON } from "@/lib/bnl-journal-contract";

type JournalReference = { entryId: string; revision: number; contentHash: string };
type ArtMimeType = "image/png" | "image/jpeg";
export type BNLOwnArt = {
  artId: string; title: string; meaning: string; createdAt: string; sha256: string;
  mimeType?: ArtMimeType; // Existing v1 packets are PNG; v2 carries the actual type.
  journal: JournalReference | null;
  sourceJournals: JournalReference[];
};
export const MAX_ART_BODY = 2_850_000;
const PREFIX = "barcode:bnl:own-art:v1:";
const INDEX = PREFIX + "index";
export const ownArtEnabled = () => process.env.BNL_OWN_ART_ENABLED === "true";
const idValid = (id: string) => /^bnl-art-\d{4}-\d{2}-\d{2}$/.test(id);
const record = (x: unknown): x is Record<string, unknown> => Boolean(x) && typeof x === "object" && !Array.isArray(x);
const text = (x: unknown, max: number): x is string => typeof x === "string" && Boolean(x.trim()) && x.length <= max && !/[\x00-\x1f\x7f]/.test(x);
const keys = (x: Record<string, unknown>, expected: string[]) => Object.keys(x).length === expected.length && expected.every(k => Object.hasOwn(x, k));
function pacificDay(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  return ["year", "month", "day"].map(k => parts.find(p => p.type === k)?.value).join("-");
}
function imageType(image: Buffer): ArtMimeType | null {
  let width = 0, height = 0;
  let mime: ArtMimeType | null = null;
  if (image.length >= 32 && image.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")) && image.subarray(12, 16).toString() === "IHDR") {
    mime = "image/png"; width = image.readUInt32BE(16); height = image.readUInt32BE(20);
  } else if (image.length >= 32 && image.subarray(0, 3).equals(Buffer.from("ffd8ff", "hex")) && image.subarray(-2).equals(Buffer.from("ffd9", "hex"))) {
    mime = "image/jpeg";
    let offset = 2;
    while (offset + 4 <= image.length) {
      if (image[offset] !== 0xff) break;
      while (offset < image.length && image[offset] === 0xff) offset++;
      if (offset >= image.length) break;
      const marker = image[offset++];
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > image.length) break;
      const length = image.readUInt16BE(offset);
      if (length < 2 || offset + length > image.length) break;
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        if (length >= 8) { height = image.readUInt16BE(offset + 3); width = image.readUInt16BE(offset + 5); }
        break;
      }
      offset += length;
    }
  }
  return width > 0 && width <= 4096 && height > 0 && height <= 4096 ? mime : null;
}
export function validateOwnArt(body: unknown, now = Date.now()): { art: BNLOwnArt; image: Buffer } | null {
  if (!record(body) || ![1, 2].includes(Number(body.contractVersion)) || body.kind !== "bnl_own_art" || !record(body.art)) return null;
  const legacy = body.contractVersion === 1;
  if ((!legacy && body.contractVersion !== 2) || !keys(body, ["contractVersion", "kind", "art", legacy ? "pngBase64" : "imageBase64"])) return null;
  const art = body.art;
  if (!keys(art, ["artId", "title", "meaning", "createdAt", "sha256", "journal", "sourceJournals", ...(legacy ? [] : ["mimeType"])]) || !text(art.artId, 40) || !idValid(art.artId) || !text(art.title, 120) || !text(art.meaning, 1000) || !text(art.createdAt, 30) || !text(art.sha256, 64) || !/^[a-f0-9]{64}$/.test(art.sha256)) return null;
  const mime = legacy ? "image/png" : art.mimeType;
  if (mime !== "image/png" && mime !== "image/jpeg") return null;
  const date = new Date(art.createdAt);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(art.createdAt) || !Number.isFinite(date.getTime()) || date.getTime() > now + 300_000 || date.toISOString().replace(".000Z", "Z") !== art.createdAt || art.artId !== "bnl-art-" + pacificDay(date)) return null;
  const validJournal = (j: unknown): j is JournalReference => record(j) && keys(j, ["entryId", "revision", "contentHash"]) && text(j.entryId, 80) && /^[a-zA-Z0-9][a-zA-Z0-9._-]{2,79}$/.test(j.entryId) && Number.isInteger(j.revision) && Number(j.revision) >= 1 && text(j.contentHash, 64) && /^[a-f0-9]{64}$/.test(j.contentHash);
  if (!Array.isArray(art.sourceJournals) || art.sourceJournals.length > 2 || !art.sourceJournals.every(validJournal)) return null;
  if (art.journal !== null && (!validJournal(art.journal) || !art.sourceJournals.some(j => canonicalJSON(j) === canonicalJSON(art.journal)))) return null;
  const encoded = body[legacy ? "pngBase64" : "imageBase64"];
  if (typeof encoded !== "string" || encoded.length > 2_800_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) return null;
  const image = Buffer.from(encoded, "base64");
  if (image.length < 32 || image.length > 2 * 1024 * 1024 || image.toString("base64") !== encoded || imageType(image) !== mime || createHash("sha256").update(image).digest("hex") !== art.sha256) return null;
  return { art: art as BNLOwnArt, image };
}

async function journalEligible(art: BNLOwnArt, forReuse = false) {
  // Every Journal supplied as creative input remains a visibility dependency,
  // even if the model did not choose an explicit related-entry link.
  const sources = art.sourceJournals;
  if (!Array.isArray(sources)) return false;
  const controls = forReuse && sources.length ? await listJournalEntryControls() : [];
  for (const source of sources) {
    const entry = await getBNLJournalEntry(source.entryId);
    if (!entry.ok || !entry.value || entry.value.revision !== source.revision || entry.value.contentHash !== source.contentHash) return false;
    if (controls.some(c => c.entryId === source.entryId && !c.memoryEligible)) return false;
  }
  return true;
}
const PUBLISH = `
local old = redis.call('GET', KEYS[1])
if old and old ~= ARGV[1] then return 'conflict' end
redis.call('SET', KEYS[1], ARGV[1])
redis.call('ZADD', KEYS[2], ARGV[2], ARGV[3])
if KEYS[3] ~= '' then redis.call('SET', KEYS[3], ARGV[3]) end
return 'ok'
`;
const mimeFor = (art: BNLOwnArt): ArtMimeType => art.mimeType || "image/png";
const pathFor = (art: BNLOwnArt) => `bnl-own-art/${art.artId}/${art.sha256}.${mimeFor(art) === "image/jpeg" ? "jpg" : "png"}`;

export async function publishOwnArt(art: BNLOwnArt, image: Buffer) {
  const redis = getBNLJournalRedis();
  if (!ownArtEnabled() || !redis) throw new Error("art_unavailable");
  // Immutable metadata makes ambiguous delivery safely retryable by exact packet.
  const serialized = canonicalJSON(art);
  const existing = await redis.get<BNLOwnArt>(PREFIX + art.artId);
  if (existing) {
    if (canonicalJSON(existing) !== serialized) return { ok: false, conflict: true };
    // A receipt acknowledges an already committed packet. Later visibility
    // changes affect reads, not whether that exact packet was accepted.
    return { ok: true, artId: existing.artId, sha256: existing.sha256 };
  }
  if (!await journalEligible(art, true)) return { ok: false, conflict: true };
  await put(pathFor(art), image, { access: "private", addRandomSuffix: false, allowOverwrite: true, contentType: mimeFor(art), cacheControlMaxAge: 60 });
  // Recheck publication controls after the external upload; no public blob URL.
  if (!await journalEligible(art, true)) return { ok: false, conflict: true };
  const result = await redis.eval(PUBLISH, [PREFIX + art.artId, INDEX, art.journal ? PREFIX + "journal:" + art.journal.entryId : ""], [serialized, Date.parse(art.createdAt), art.artId]);
  return result === "ok" ? { ok: true, artId: art.artId, sha256: art.sha256 } : { ok: false, conflict: true };
}
export async function readOwnArt(id: string): Promise<BNLOwnArt | null> {
  if (!ownArtEnabled() || !idValid(id)) return null;
  try {
    const art = await getBNLJournalRedis()?.get<BNLOwnArt>(PREFIX + id);
    return art && art.artId === id && ["image/png", "image/jpeg"].includes(mimeFor(art)) && await journalEligible(art) ? art : null;
  } catch { return null; }
}
export async function listOwnArt(journalEntryId?: string): Promise<BNLOwnArt[]> {
  if (!ownArtEnabled()) return [];
  try {
    const redis = getBNLJournalRedis();
    if (!redis) return [];
    const ids = journalEntryId ? [await redis.get<string>(PREFIX + "journal:" + journalEntryId)] : await redis.zrange<string[]>(INDEX, 0, 11, { rev: true });
    const pieces = await Promise.all(ids.filter((id): id is string => typeof id === "string").map(readOwnArt));
    return pieces.filter((p): p is BNLOwnArt => Boolean(p) && (!journalEntryId || p?.journal?.entryId === journalEntryId));
  } catch { return []; }
}
export async function readOwnArtImage(id: string) {
  const art = await readOwnArt(id);
  if (!art) return null;
  const image = await get(pathFor(art), { access: "private", useCache: false });
  // Hides/revisions occurring during blob retrieval must also close media access.
  return image?.statusCode === 200 && await journalEligible(art) ? { ...image, mimeType: mimeFor(art) } : null;
}
