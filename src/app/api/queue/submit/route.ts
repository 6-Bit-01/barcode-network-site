import { NextResponse } from "next/server";
import { submitQueueTrack } from "@/lib/queue";
import { DEFAULT_FALLBACK_DURATION_SECONDS } from "@/lib/queue-types";

export const dynamic = "force-dynamic";

function validateUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const artistName = String(body.artistName ?? "").trim();
    const songTitle = String(body.songTitle ?? "").trim();
    const songUrl = String(body.songUrl ?? "").trim();
    const submitterContact = String(body.submitterContact ?? "").trim();
    const note = String(body.note ?? "").trim();
    const requestedFallback = Number(body.fallbackDurationSeconds);

    if (!artistName || !songTitle || !songUrl) {
      return NextResponse.json({ error: "Artist, song title, and link are required." }, { status: 400 });
    }

    if (!validateUrl(songUrl)) {
      return NextResponse.json({ error: "Submit a valid http(s) song link." }, { status: 400 });
    }

    const fallbackDurationSeconds = Number.isFinite(requestedFallback) && requestedFallback > 0
      ? Math.round(requestedFallback)
      : DEFAULT_FALLBACK_DURATION_SECONDS;

    const track = await submitQueueTrack({
      artistName,
      songTitle,
      songUrl,
      submitterContact: submitterContact || undefined,
      note: note || undefined,
      fallbackDurationSeconds,
    });

    return NextResponse.json({ ok: true, track }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "QUEUE_CLOSED") {
      return NextResponse.json({ error: "Queue is currently closed." }, { status: 403 });
    }
    console.error("[queue/submit]", error);
    return NextResponse.json({ error: "Submission failed." }, { status: 500 });
  }
}
