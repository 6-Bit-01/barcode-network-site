import { NextResponse } from "next/server";
import { PUBLIC_QUEUE_LEGAL_CHECKBOX_TEXT, PUBLIC_QUEUE_LEGAL_PRIVACY_VERSION, PUBLIC_QUEUE_LEGAL_QUEUE_TERMS_VERSION, PUBLIC_QUEUE_LEGAL_TERMS_VERSION, detectQueueSourceType, parseAppleMusicSongUrl } from "@/lib/queue-types";
import { getPublicQueueSnapshot, getRadioQueueState, isTrackPersistedInSessionQueue, normalizeQueueSourceKey, requestPriorityUpgradePlaceholder, submitRadioTrack, toPublicQueueTrack } from "@/lib/queue";
import type { QueueEntry } from "@/lib/queue-types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
const AUDIO_MIME_TYPES = new Set(["audio/mpeg", "audio/mp3", "audio/wav", "audio/wave", "audio/x-wav"]);
const UPLOAD_FALLBACK_MESSAGE = "Upload could not be completed. Please try again or submit a Spotify, SoundCloud, YouTube, or direct track link.";
const DUPLICATE_TRANSMISSION_MESSAGE = "Duplicate transmission detected. This track is already in the queue for this session.";
const BLOB_HOST_SUFFIX = ".private.blob.vercel-storage.com";
const UPLOAD_PREFIX = "/barcode-radio-queue/";
const SESSION_SYNC_MESSAGE = "This session has changed. Re-enter the current BARCODE Radio queue and submit again.";
const QUEUE_ACCEPTANCE_UNCONFIRMED_MESSAGE = "Submission could not be confirmed in the queue. Please try again.";

function validateUploadedBlobUrl(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("Uploaded audio file is missing.");
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== "https:" || !parsed.hostname.endsWith(BLOB_HOST_SUFFIX) || !parsed.pathname.startsWith(UPLOAD_PREFIX)) throw new Error("Uploaded audio file is invalid.");
    return parsed.toString();
  } catch {
    throw new Error("Uploaded audio file is invalid.");
  }
}

function validateUploadFileName(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("Uploaded audio file name is missing.");
  return value.trim().slice(0, 240);
}

function validateUploadFileSize(value: unknown): number {
  const size = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(size) || size <= 0) throw new Error("Uploaded audio file size is missing.");
  if (size > MAX_UPLOAD_BYTES) throw new Error("Uploads must be 100MB or less.");
  return Math.round(size);
}

function validateUploadMimeType(value: unknown): string {
  if (typeof value !== "string" || !AUDIO_MIME_TYPES.has(value)) throw new Error("Only MP3 and WAV uploads are accepted.");
  return value;
}

function cleanBodyText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}


function validateLegalAcceptance(body: Record<string, unknown>) {
  if (body.acceptedLegal !== true) throw new Error("Legal acceptance is required before submitting to the queue.");
  if (cleanBodyText(body.termsVersion) !== PUBLIC_QUEUE_LEGAL_TERMS_VERSION) throw new Error("Legal terms version mismatch. Refresh the queue and try again.");
  if (cleanBodyText(body.privacyVersion) !== PUBLIC_QUEUE_LEGAL_PRIVACY_VERSION) throw new Error("Privacy policy version mismatch. Refresh the queue and try again.");
  if (cleanBodyText(body.queueTermsVersion) !== PUBLIC_QUEUE_LEGAL_QUEUE_TERMS_VERSION) throw new Error("Queue terms version mismatch. Refresh the queue and try again.");
  if (cleanBodyText(body.acceptedCheckboxText) !== PUBLIC_QUEUE_LEGAL_CHECKBOX_TEXT) throw new Error("Legal acceptance text mismatch. Refresh the queue and try again.");
  return {
    acceptedAt: new Date().toISOString(),
    termsVersion: PUBLIC_QUEUE_LEGAL_TERMS_VERSION,
    privacyVersion: PUBLIC_QUEUE_LEGAL_PRIVACY_VERSION,
    queueTermsVersion: PUBLIC_QUEUE_LEGAL_QUEUE_TERMS_VERSION,
    acceptedCheckboxText: PUBLIC_QUEUE_LEGAL_CHECKBOX_TEXT,
    source: "public_queue_form" as const,
  };
}

function parseBodyDuration(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
}

function isAppleMusicHostUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.hostname === "music.apple.com";
  } catch {
    return false;
  }
}

function duplicateResponse(): NextResponse {
  return NextResponse.json({ error: DUPLICATE_TRANSMISSION_MESSAGE, code: "duplicate_transmission" }, { status: 409 });
}

function acceptedResponse(track: ReturnType<typeof toPublicQueueTrack>, cooldownSeconds: number): NextResponse {
  return NextResponse.json({ track, message: "Track entered Free Transmissions.", ...(cooldownSeconds > 0 ? { cooldownRemainingSeconds: cooldownSeconds } : {}) }, { status: 201 });
}

function queueEntriesForDuplicatePreflight(state: Awaited<ReturnType<typeof getRadioQueueState>>): QueueEntry[] {
  return [
    ...state.queue,
    ...(state.nextInLine ? [state.nextInLine] : []),
    ...(state.nowPlaying ? [state.nowPlaying] : []),
    ...state.history,
    ...(state.removed ?? []),
  ];
}

function entryNormalizedSourceKeys(entry: QueueEntry): string[] {
  return [entry.normalizedSourceKey, normalizeQueueSourceKey(entry.link), normalizeQueueSourceKey(entry.fileUrl)].filter((key): key is string => Boolean(key));
}

async function hasDuplicateLinkSubmission(link: string): Promise<boolean> {
  const normalizedLink = normalizeQueueSourceKey(link);
  if (!normalizedLink) return false;
  const state = await getRadioQueueState();
  return queueEntriesForDuplicatePreflight(state).some((entry) => entryNormalizedSourceKeys(entry).includes(normalizedLink));
}

async function hasDuplicateUploadSubmission(fileName: string, fileSize: number, detectedDurationSeconds: number | null): Promise<boolean> {
  const normalizedFileName = fileName.toLowerCase();
  const state = await getRadioQueueState();
  return queueEntriesForDuplicatePreflight(state).some((entry) => {
    if (entry.sourceType !== "upload") return false;
    if (!entry.fileName || entry.fileName.toLowerCase() !== normalizedFileName) return false;
    if (entry.fileSize !== fileSize) return false;
    if (detectedDurationSeconds && entry.detectedDurationSeconds && entry.detectedDurationSeconds !== detectedDurationSeconds) return false;
    return true;
  });
}

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const sessionId = params.get("sessionId") ?? undefined;
  return NextResponse.json(await getPublicQueueSnapshot(sessionId, {
    submitterToken: params.get("submitterToken"),
    tiktokHandle: params.get("tiktokHandle"),
    contactEmail: params.get("contactEmail"),
    artist: params.get("artist"),
  }));
}

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const body = await req.json().catch(() => ({}));
      if (body.action === "priorityUpgradePlaceholder" && typeof body.id === "string") {
        const track = await requestPriorityUpgradePlaceholder(body.id);
        if (!track) return NextResponse.json({ error: "Priority Signal Upgrade is not available for this track." }, { status: 409 });
        return NextResponse.json({ track, message: "Priority Signal Upgrade is being prepared. No payment has been processed." });
      }
      if (typeof body.action === "string") return NextResponse.json({ error: "Unknown queue action" }, { status: 400 });
      return submitTrackFromBody(body);
    }

    const form = await req.formData();
    const body = Object.fromEntries(form.entries());
    return submitTrackFromBody(body);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Submission failed";
    const reasons = Array.isArray((error as { reasons?: unknown }).reasons) ? (error as { reasons: string[] }).reasons : [];
    const code = typeof (error as { code?: unknown }).code === "string" ? (error as { code: string }).code : undefined;
    const isLimitBlock = code === "submission_limit" || message === "Submission limit reached for this session.";
    const isDuplicateBlock = code === "duplicate_transmission";
    const cooldownRemainingSeconds = typeof (error as { remainingSeconds?: unknown }).remainingSeconds === "number" ? (error as { remainingSeconds: number }).remainingSeconds : 0;
    if (isDuplicateBlock) return NextResponse.json({ error: DUPLICATE_TRANSMISSION_MESSAGE, code: "duplicate_transmission" }, { status: 409 });
    if (cooldownRemainingSeconds > 0) return NextResponse.json({ error: "Submission cooldown active.", cooldownRemainingSeconds }, { status: 429 });
    const publicMessage = isLimitBlock ? "Submission limit reached for this session." : message === "Queue is closed" ? "This broadcast queue is closed." : message === "Queue is full for new transmissions." ? "This broadcast queue is full for new transmissions." : message === "Uploaded audio file is missing." || message === "Uploaded audio file is invalid." ? UPLOAD_FALLBACK_MESSAGE : message === "Only MP3 and WAV uploads are accepted." || message === "Uploads must be 100MB or less." || message === "Uploaded audio file name is missing." || message === "Uploaded audio file size is missing." ? message : "Submission failed. Please try again.";
    const status = isLimitBlock ? 409 : message === "Queue is closed" ? 409 : message.startsWith("Uploaded audio") || message === "Only MP3 and WAV uploads are accepted." || message === "Uploads must be 100MB or less." ? 400 : 500;
    return NextResponse.json({ error: publicMessage, reasons }, { status });
  }
}

export async function submitTrackFromBody(body: Record<string, unknown>): Promise<NextResponse> {
  const artist = cleanBodyText(body.artist);
  const title = cleanBodyText(body.title);
  const mode = cleanBodyText(body.mode);
  const detectedDurationSeconds = parseBodyDuration(body.detectedDurationSeconds);
  const note = cleanBodyText(body.note).slice(0, 500);
  const tiktokHandle = cleanBodyText(body.tiktokHandle);
  const collaboratorNames = cleanBodyText(body.collaboratorNames).slice(0, 200);
  const contactEmail = cleanBodyText(body.contactEmail).slice(0, 200);
  const submitterToken = cleanBodyText(body.submitterToken).slice(0, 120);
  const sessionId = cleanBodyText(body.sessionId);
  let legalAcceptance;
  try {
    legalAcceptance = validateLegalAcceptance(body);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Legal acceptance is required before submitting to the queue." }, { status: 400 });
  }
  const active = await getPublicQueueSnapshot();

  if (!sessionId) return NextResponse.json({ error: "Session sync required. Refresh the queue and try again.", code: "session_sync_required" }, { status: 409 });
  if (active.session.sessionId !== sessionId) return NextResponse.json({ error: SESSION_SYNC_MESSAGE, code: "stale_session" }, { status: 409 });
  if (!active.status.isOpen) {
    return NextResponse.json({ error: "This broadcast queue is closed." }, { status: 409 });
  }
  if (active.status.isFull || active.status.activeCount >= active.status.capacity) {
    return NextResponse.json({ error: "This broadcast queue is full for new transmissions." }, { status: 409 });
  }

  if (!artist || !title) return NextResponse.json({ error: "Artist and title are required." }, { status: 400 });
  if (!tiktokHandle) return NextResponse.json({ error: "TikTok handle is required." }, { status: 400 });

  if (mode === "upload") {
    const fileUrl = validateUploadedBlobUrl(body.uploadedBlobUrl || body.fileUrl);
    const fileName = validateUploadFileName(body.uploadOriginalName || body.fileName);
    const fileSize = validateUploadFileSize(body.fileSize);
    const mimeType = validateUploadMimeType(body.mimeType);

    if (await hasDuplicateUploadSubmission(fileName, fileSize, detectedDurationSeconds)) return duplicateResponse();

    const track = await submitRadioTrack({
      artist,
      title,
      link: fileUrl,
      fileUrl,
      fileName,
      fileSize,
      mimeType,
      sourceType: "upload",
      detectedDurationSeconds,
      durationSource: detectedDurationSeconds ? "upload_metadata" : "estimated",
      note,
      submitterArtistName: artist,
      tiktokHandle,
      collaboratorNames,
      contactEmail,
      submitterToken,
      legalAcceptance,
    });
    if (!(await isTrackPersistedInSessionQueue(track.id, active.session.sessionId))) {
      return NextResponse.json({ error: QUEUE_ACCEPTANCE_UNCONFIRMED_MESSAGE, code: "queue_acceptance_unconfirmed" }, { status: 500 });
    }
    return acceptedResponse(toPublicQueueTrack(track), active.session.submissionCooldownSeconds);
  }

  const link = cleanBodyText(body.link);
  if (!link) return NextResponse.json({ error: "Paste a track link." }, { status: 400 });
  try { new URL(link); } catch { return NextResponse.json({ error: "Enter a valid track URL." }, { status: 400 }); }
  if (isAppleMusicHostUrl(link) && !parseAppleMusicSongUrl(link)) return NextResponse.json({ error: "Use a direct Apple Music song link. Album, artist, playlist, and station pages are not accepted.", code: "invalid_apple_music_song_url" }, { status: 400 });
  if (await hasDuplicateLinkSubmission(link)) return duplicateResponse();

  const sourceType = detectQueueSourceType(link);
  const track = await submitRadioTrack({ artist, title, link, sourceType, note, submitterArtistName: artist, tiktokHandle, collaboratorNames, contactEmail, submitterToken, legalAcceptance });
  if (!(await isTrackPersistedInSessionQueue(track.id, active.session.sessionId))) {
    return NextResponse.json({ error: QUEUE_ACCEPTANCE_UNCONFIRMED_MESSAGE, code: "queue_acceptance_unconfirmed" }, { status: 500 });
  }
  return acceptedResponse(toPublicQueueTrack(track), active.session.submissionCooldownSeconds);
}
