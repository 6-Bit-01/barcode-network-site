import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import { Redis } from "@upstash/redis";
import { revalidateTag, unstable_cache } from "next/cache";
import { HELLCAT_RADIO_STALE_MS, hellcatRadioResult, type HellcatNowPlaying,
  type HellcatRadioResult, type HellcatRadioSnapshot } from "@/lib/hellcat-now-playing";

const MAX_BODY_BYTES = 16 * 1024;
const pending = new Map<string, Promise<unknown>>();
const warn = (reason: string) => console.warn("[hellcat-now-playing]", { reason });

function radioToken(): string {
  const token = process.env.HELLCAT_LADDER_TOKEN?.trim() ?? "";
  return token && token.length <= 4096 && !/\s/.test(token) ? token : "";
}

export function authorizeHellcatRadio(request: Request): boolean {
  const token = radioToken();
  if (!token) return false;
  const expected = Buffer.from(`Bearer ${token}`);
  const supplied = Buffer.from(request.headers.get("authorization") ?? "");
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

function configuration() {
  const token = radioToken();
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!token || !url || !redisToken) return null;
  // Partition credential rotations and deployments; preview POSTs cannot mark
  // a production ladder live even when both use the existing shared database.
  const scope = createHash("sha256").update(JSON.stringify([
    token, url, process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
    process.env.VERCEL_BRANCH_URL ?? process.env.VERCEL_URL ?? "local",
  ])).digest("hex");
  return { key: `barcode:hellcat-now-playing:v1:${scope}`, tag: `hellcat-radio:${scope}`,
    redis: new Redis({ url, token: redisToken, retry: false, signal: AbortSignal.timeout(2000) }) };
}

export async function saveHellcatNowPlaying(state: HellcatNowPlaying): Promise<boolean> {
  const config = configuration();
  if (!config) { warn("configuration_missing"); return false; }
  try {
    const snapshot: HellcatRadioSnapshot = { state, receivedAt: Date.now() };
    await config.redis.set(config.key, snapshot, { ex: HELLCAT_RADIO_STALE_MS / 1000 });
    // Webhook invalidation makes the next reader wait for the updated value.
    revalidateTag(config.tag, { expire: 0 });
    return true;
  } catch { warn("write_unavailable"); return false; }
}

export async function getHellcatNowPlaying(): Promise<HellcatRadioResult> {
  const config = configuration();
  if (!config) return { live: false };
  try {
    const read = unstable_cache(async () => {
      let promise = pending.get(config.key);
      if (!promise) { promise = config.redis.get<unknown>(config.key); pending.set(config.key, promise); }
      try { return await promise; }
      catch { warn("read_unavailable"); return null; }
      finally { if (pending.get(config.key) === promise) pending.delete(config.key); }
    }, ["hellcat-radio-v1", config.tag], { revalidate: 5, tags: [config.tag] });
    // Re-evaluate the receive age outside the cache, including framework-held
    // stale values. Reading or caching can never renew the bot's heartbeat.
    return hellcatRadioResult(await read(), Date.now());
  } catch { warn("cache_unavailable"); return { live: false }; }
}

export class HellcatRadioBodyError extends Error {
  constructor(readonly status: number) { super("Invalid radio update"); }
}

export async function readHellcatRadioBody(request: Request): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    throw new HellcatRadioBodyError(415);
  }
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) throw new HellcatRadioBodyError(413);
  const reader = request.body?.getReader();
  if (!reader) throw new HellcatRadioBodyError(400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { reject(new HellcatRadioBodyError(408)); void reader.cancel().catch(() => {}); }, 3000);
  });
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), deadline]);
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) throw new HellcatRadioBodyError(413);
      chunks.push(value);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch { throw new HellcatRadioBodyError(400); }
  } finally { clearTimeout(timer); await reader.cancel().catch(() => {}); }
}
