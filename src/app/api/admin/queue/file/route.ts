import { get } from "@vercel/blob";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { COOKIE_NAME, verifyAdminToken } from "@/lib/auth";
import { getRadioQueueState } from "@/lib/queue";
import type { QueueEntry } from "@/lib/queue-types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function assertAdmin(): Promise<boolean> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  return token ? verifyAdminToken(token) : false;
}

function findAdminTrack(state: Awaited<ReturnType<typeof getRadioQueueState>>, id: string): QueueEntry | null {
  return [state.nowPlaying, state.nextInLine, state.loadedTrack, ...state.queue, ...state.history, ...(state.removed ?? []), ...(state.spotlight ?? [])].find((entry): entry is QueueEntry => Boolean(entry && entry.id === id)) ?? null;
}

export async function GET(req: Request) {
  if (!(await assertAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const params = new URL(req.url).searchParams;
  const id = params.get("id");
  if (!id) return NextResponse.json({ error: "Missing track id" }, { status: 400 });

  const state = await getRadioQueueState(params.get("sessionId") ?? undefined);
  const entry = findAdminTrack(state, id);
  if (entry?.sourceType !== "upload" || !entry.fileUrl) return NextResponse.json({ error: "Audio not found" }, { status: 404 });
  if (!process.env.BLOB_READ_WRITE_TOKEN) return NextResponse.json({ error: "Upload storage is not configured" }, { status: 503 });

  const range = req.headers.get("range");
  const result = await get(entry.fileUrl, {
    access: "private",
    ...(range ? { headers: { range } } : {}),
  });

  if (!result?.stream) return NextResponse.json({ error: "Audio unavailable" }, { status: 404 });

  const headers = new Headers(result.headers);
  headers.set("content-type", entry.mimeType || result.blob.contentType || result.headers.get("content-type") || "audio/mpeg");
  headers.set("cache-control", "private, no-store");
  headers.set("accept-ranges", result.headers.get("accept-ranges") || "bytes");

  return new Response(result.stream, { status: result.statusCode, headers });
}
