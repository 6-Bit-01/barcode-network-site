import { NextResponse } from "next/server";
import { detectQueueSourceType } from "@/lib/queue-types";
import { getPublicQueueSnapshot, submitRadioTrack } from "@/lib/queue";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
const AUDIO_MIME_TYPES = new Set(["audio/mpeg", "audio/mp3", "audio/wav", "audio/wave", "audio/x-wav"]);

function cleanText(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseDuration(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string" || !value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
}

function safeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-").slice(0, 120) || "track";
}

async function putBlob(file: File): Promise<{ url: string }> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) throw new Error("Uploads are not configured yet.");

  const pathname = `barcode-radio-queue/${Date.now()}-${safeFileName(file.name)}`;
  const endpoint = `https://blob.vercel-storage.com/${pathname}`;
  const response = await fetch(endpoint, {
    method: "PUT",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": file.type || "application/octet-stream",
      "x-api-version": "7",
      "x-add-random-suffix": "1",
      "x-access": "public",
    },
    body: file,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || typeof payload?.url !== "string") {
    throw new Error(typeof payload?.error === "string" ? payload.error : "Upload failed");
  }
  return { url: payload.url };
}

export async function GET(req: Request) {
  const sessionId = new URL(req.url).searchParams.get("sessionId") ?? undefined;
  return NextResponse.json(await getPublicQueueSnapshot(sessionId));
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const artist = cleanText(form.get("artist"));
    const title = cleanText(form.get("title"));
    const mode = cleanText(form.get("mode"));
    const detectedDurationSeconds = parseDuration(form.get("detectedDurationSeconds"));
    const note = cleanText(form.get("note")).slice(0, 500);
    const tiktokHandle = cleanText(form.get("tiktokHandle"));
    const collaboratorNames = cleanText(form.get("collaboratorNames")).slice(0, 200);
    const contactEmail = cleanText(form.get("contactEmail")).slice(0, 200);
    const submitterToken = cleanText(form.get("submitterToken")).slice(0, 120);
    const sessionId = cleanText(form.get("sessionId"));
    const active = await getPublicQueueSnapshot();
    if (sessionId && active.session.sessionId !== sessionId) {
      return NextResponse.json({ error: "This broadcast queue is closed." }, { status: 409 });
    }
    if (!active.status.isOpen) {
      return NextResponse.json({ error: "This broadcast queue is closed." }, { status: 409 });
    }
    if (active.status.isFull || active.status.activeCount >= active.status.capacity) {
      return NextResponse.json({ error: "This broadcast queue is full for new transmissions." }, { status: 409 });
    }

    if (!artist || !title) return NextResponse.json({ error: "Artist and title are required." }, { status: 400 });
    if (!tiktokHandle) return NextResponse.json({ error: "TikTok handle is required." }, { status: 400 });

    if (mode === "upload") {
      const file = form.get("file");
      if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "Select an MP3 or WAV file." }, { status: 400 });
      const extOk = /\.(mp3|wav)$/i.test(file.name);
      if (!extOk || !AUDIO_MIME_TYPES.has(file.type)) return NextResponse.json({ error: "Only MP3 and WAV uploads are accepted." }, { status: 400 });
      if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "Uploads must be 100MB or less." }, { status: 400 });

      const blob = await putBlob(file);
      const track = await submitRadioTrack({
        artist,
        title,
        link: blob.url,
        fileUrl: blob.url,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
        sourceType: "upload",
        detectedDurationSeconds,
        durationSource: detectedDurationSeconds ? "upload_metadata" : "file_metadata",
        note,
        submitterArtistName: artist,
        tiktokHandle,
        collaboratorNames,
        contactEmail,
        submitterToken,
      });
      return NextResponse.json({ track, message: "Track entered the Regular Queue.", cooldownRemainingSeconds: 300 }, { status: 201 });
    }

    const link = cleanText(form.get("link"));
    if (!link) return NextResponse.json({ error: "Paste a track link." }, { status: 400 });
    try { new URL(link); } catch { return NextResponse.json({ error: "Enter a valid track URL." }, { status: 400 }); }

    const sourceType = detectQueueSourceType(link);
    const track = await submitRadioTrack({ artist, title, link, sourceType, note, submitterArtistName: artist, tiktokHandle, collaboratorNames, contactEmail, submitterToken });
    return NextResponse.json({ track, message: "Track entered the Regular Queue.", cooldownRemainingSeconds: 300 }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Submission failed";
    const isLimitBlock = message === "Submission limit reached for this session.";
    const cooldownRemainingSeconds = typeof (error as { remainingSeconds?: unknown }).remainingSeconds === "number" ? (error as { remainingSeconds: number }).remainingSeconds : 0;
    if (cooldownRemainingSeconds > 0) return NextResponse.json({ error: "Submission cooldown active.", cooldownRemainingSeconds }, { status: 429 });
    return NextResponse.json({ error: isLimitBlock ? "Submission limit reached for this session." : message }, { status: isLimitBlock ? 409 : 500 });
  }
}
