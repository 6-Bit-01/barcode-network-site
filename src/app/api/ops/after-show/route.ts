import { createHash, timingSafeEqual } from "node:crypto";
import { getAfterShowEvidence } from "@/lib/queue";
import { isQueueProductionEnabled } from "@/lib/queue-production";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const headers = {
  "cache-control": "private, no-store, max-age=0",
  "x-content-type-options": "nosniff",
  "x-robots-tag": "noindex, nofollow",
};

export async function GET(request: Request) {
  const expected = process.env.BARCODE_AFTER_SHOW_EXPORT_TOKEN?.trim() ?? "";
  const received = request.headers.get("authorization") ?? "";
  const hash = (value: string) => createHash("sha256").update(value).digest();
  if (expected.length < 32 || !timingSafeEqual(hash(received), hash(`Bearer ${expected}`))) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers });
  }
  if (!isQueueProductionEnabled()) {
    return Response.json({ error: "Queue production unavailable" }, { status: 503, headers });
  }
  const sessionId = new URL(request.url).searchParams.get("sessionId");
  if (sessionId !== null && !/^[A-Za-z0-9_-]{1,160}$/.test(sessionId)) {
    return Response.json({ error: "Invalid session ID" }, { status: 400, headers });
  }
  try {
    const result = await getAfterShowEvidence(sessionId ?? undefined);
    if (!result) return Response.json({ error: "Archived public show not found" }, { status: 404, headers });
    const body = JSON.stringify(result);
    if (Buffer.byteLength(body) > 8 * 1024 * 1024) throw new Error("Export exceeds bound");
    return new Response(body, { headers: { ...headers, "content-type": "application/json; charset=utf-8" } });
  } catch {
    return Response.json({ error: "After-show evidence unavailable" }, { status: 503, headers });
  }
}
