import { getBNLJournalRedis } from "@/lib/bnl-journal-store";
import { getPublicQueueStats } from "@/lib/queue";
import { newBallad, publicBallad, validId, type BalladDocument, type BalladConfig, type BalladShow } from "@/lib/bnl-ballads";

const PREFIX = "barcode:bnl-ballads:v1:";
export const BALLAD_CAS = `
local raw = redis.call('GET', KEYS[1])
local revision = 0
if raw then revision = cjson.decode(raw).revision end
if revision ~= tonumber(ARGV[1]) then return 0 end
redis.call('SET', KEYS[1], ARGV[2])
return 1
`;
export function balladRedis() {
  const redis = getBNLJournalRedis();
  if (!redis) throw new Error("Ballad storage is unavailable.");
  return redis;
}
export async function eligibleBalladShows(): Promise<BalladShow[]> {
  // Existing public archive is the sole eligibility/visibility authority, including production gating.
  const stats = await getPublicQueueStats(null, true);
  return stats.shows.filter(show => show.status === "archived").map(({ sessionId, title, showDate }) => ({ sessionId, title, showDate }));
}
export async function requireBalladShow(showId: string) {
  if (!validId(showId)) throw new Error("Invalid show.");
  const show = (await eligibleBalladShows()).find(s => s.sessionId === showId);
  if (!show) throw new Error("Choose a finalized public broadcast from the archive.");
  return show;
}
export async function readBallad(showId: string): Promise<BalladDocument> {
  if (!validId(showId)) throw new Error("Invalid show.");
  return (await balladRedis().get<BalladDocument>(PREFIX + showId)) ?? newBallad(showId);
}
export async function saveBallad(doc: BalladDocument, expected: number) {
  const next = { ...doc, revision: expected + 1 };
  const saved = await balladRedis().eval(BALLAD_CAS, [PREFIX + doc.showId], [expected, JSON.stringify(next)]);
  if (saved !== 1) throw new Error("This workspace changed. Reload to keep both sets of edits.");
  return next;
}
export async function readBalladConfig(): Promise<BalladConfig> {
  return (await balladRedis().get<BalladConfig>(PREFIX + "config")) ?? { revision: 0, enabled: false, enabledSince: null };
}
export async function saveBalladConfig(enabled: boolean, expected: number) {
  const previous = await readBalladConfig();
  if (expected !== previous.revision) throw new Error("Automation settings changed. Reload first.");
  const config: BalladConfig = { revision: expected + 1, enabled, enabledSince: enabled ? (previous.enabled ? previous.enabledSince : new Date().toISOString()) : null };
  // Capture existing finalized shows when enabling, so historical edits never cause mass backfill.
  const existing = enabled && !previous.enabled ? (await eligibleBalladShows()).map(s => s.sessionId) : null;
  const redis = balladRedis();
  const script = BALLAD_CAS.replace("return 1", "if ARGV[3] ~= '' then redis.call('SET', KEYS[2], ARGV[3]) end\nreturn 1");
  const saved = await redis.eval(script, [PREFIX + "config", PREFIX + "baseline"], [expected, JSON.stringify(config), existing ? JSON.stringify(existing) : ""]);
  if (saved !== 1) throw new Error("Automation settings changed. Reload first.");
  return config;
}
export async function automationBaseline(): Promise<string[]> { return await balladRedis().get<string[]>(PREFIX + "baseline") ?? []; }
export async function listPublicBallads() {
  const shows = await eligibleBalladShows();
  const entries = await Promise.all(shows.map(async show => publicBallad(await readBallad(show.sessionId), show)));
  return entries.filter(entry => entry !== null);
}
