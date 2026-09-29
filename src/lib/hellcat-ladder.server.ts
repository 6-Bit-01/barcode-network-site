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

type FailureReason = "configuration_missing" | "configuration_invalid" | "upstream_unauthorized"
  | "upstream_http_error" | "upstream_empty_response" | "upstream_body_too_large"
  | "upstream_invalid_json" | "upstream_invalid_tracks" | "upstream_timeout"
  | "upstream_network_error" | "cache_error";

class LadderReadError extends Error {
  constructor(readonly reason: FailureReason, readonly status?: number) {
    super("Hellcat ladder unavailable");
  }
}

function reportFailure(reason: FailureReason, status?: number): void {
  // Only fixed reason codes and numeric HTTP statuses reach private server logs.
  // Never pass configuration, response bodies or original errors to the logger.
  console.warn("[hellcat-ladder]", status === undefined ? { reason } : { reason, status });
}

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
    throw new LadderReadError(
      response.status === 401 || response.status === 403 ? "upstream_unauthorized"
        : !response.ok ? "upstream_http_error" : "upstream_empty_response",
      response.status,
    );
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) throw new LadderReadError("upstream_body_too_large");
      chunks.push(value);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch { throw new LadderReadError("upstream_invalid_json"); }
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
    const payload = await readBoundedJson(response);
    if (payload && typeof payload === "object" && "error" in payload && payload.error === "unauthorized") {
      throw new LadderReadError("upstream_unauthorized", response.status);
    }
    const tracks = parseHellcatTracks(payload);
    if (!tracks) throw new LadderReadError("upstream_invalid_tracks");
    return { tracks, fetchedAt: new Date(now()).toISOString() };
  } catch (error) {
    if (error instanceof LadderReadError) reportFailure(error.reason, error.status);
    else {
      const name = error && typeof error === "object" && "name" in error ? error.name : null;
      reportFailure(name === "TimeoutError" || name === "AbortError" ? "upstream_timeout" : "upstream_network_error");
    }
    // A failed read is not an empty ladder and is cached briefly to avoid retry storms.
    return null;
  }
}

export async function getHellcatLadder(): Promise<HellcatLadderResult> {
  const config = hellcatLadderConfig();
  if (!config) {
    reportFailure(!process.env.HELLCAT_LADDER_URL?.trim() || !process.env.HELLCAT_LADDER_TOKEN?.trim()
      ? "configuration_missing" : "configuration_invalid");
    return hellcatLadderResult(null);
  }
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
    const result = hellcatLadderResult(await cached());
    const refresh = pending.get(key);
    // After a long quiet period (or a cached outage), the first visitor should
    // receive the refresh already in flight instead of waiting another poll.
    return result.status === "unavailable" && refresh
      ? hellcatLadderResult(await refresh)
      : result;
  } catch {
    reportFailure("cache_error");
    return hellcatLadderResult(null);
  }
}
