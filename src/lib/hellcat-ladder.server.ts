import "server-only";

import { createHash } from "node:crypto";
import { unstable_cache } from "next/cache";
import {
  HELLCAT_LADDER_REFRESH_MS,
  hellcatLadderResult,
  parseHellcatTracks,
  type HellcatLadderResult,
  type HellcatLadderSnapshot,
} from "@/lib/hellcat-ladder";

type Configuration = { url: string; token: string };
const MAX_BODY_BYTES = 512 * 1024;
const pending = new Map<string, Promise<HellcatLadderSnapshot | null>>();

export function hellcatLadderConfig(env: NodeJS.ProcessEnv = process.env): Configuration | null {
  try {
    const url = new URL(env.HELLCAT_LADDER_URL ?? "");
    const token = env.HELLCAT_LADDER_TOKEN?.trim() ?? "";
    // This is an operator-configured endpoint, never a visitor-supplied proxy URL.
    if (url.protocol !== "https:" || url.username || url.password
      || url.pathname !== "/ladder" || url.search || url.hash
      || !token || token.length > 4096 || /\s/.test(token)) return null;
    return { url: url.toString(), token };
  } catch { return null; }
}

async function readBoundedJson(response: Response): Promise<unknown> {
  if (!response.ok || !response.body) {
    await response.body?.cancel().catch(() => {});
    throw new Error("Ladder unavailable");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) throw new Error("Ladder response too large");
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally { await reader.cancel().catch(() => {}); }
}

export async function fetchHellcatLadder(
  config: Configuration,
  fetcher: typeof fetch = fetch,
  now: () => number = Date.now,
): Promise<HellcatLadderSnapshot | null> {
  try {
    const response = await fetcher(config.url, {
      method: "GET",
      headers: { Authorization: `Bearer ${config.token}`, Accept: "application/json" },
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    const tracks = parseHellcatTracks(await readBoundedJson(response));
    return tracks ? { tracks, fetchedAt: new Date(now()).toISOString() } : null;
  } catch {
    // Never log upstream bodies, URLs, credentials or fetch errors. A failed
    // read is not an empty ladder and is cached briefly to avoid retry storms.
    return null;
  }
}

export async function getHellcatLadder(): Promise<HellcatLadderResult> {
  const config = hellcatLadderConfig();
  if (!config) return hellcatLadderResult(null);
  // Include configuration changes without putting secrets in cache arguments,
  // diagnostic keys or the cached value. Only sanitized public data is stored.
  const key = createHash("sha256").update(JSON.stringify([config.url, config.token])).digest("hex");
  try {
    const cached = unstable_cache(
      async () => {
        // Share cold reads and background refreshes within this server instance.
        let read = pending.get(key);
        if (!read) { read = fetchHellcatLadder(config); pending.set(key, read); }
        try { return await read; }
        finally { if (pending.get(key) === read) pending.delete(key); }
      },
      ["hellcat-ladder-v1", key],
      { revalidate: HELLCAT_LADDER_REFRESH_MS / 1000 },
    );
    // Next can return a stale value while revalidating. Label that state and
    // withhold snapshots older than ten minutes even if its cache retains them.
    return hellcatLadderResult(await cached());
  } catch {
    return hellcatLadderResult(null);
  }
}
