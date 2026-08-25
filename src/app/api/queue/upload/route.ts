import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth";
import { getPublicQueueSnapshot } from "@/lib/queue";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
const AUDIO_MIME_TYPES = ["audio/mpeg", "audio/mp3", "audio/wav", "audio/wave", "audio/x-wav"];
const UPLOAD_PREFIX = "barcode-radio-queue/";
const SESSION_SYNC_MESSAGE = "This session has changed. Re-enter the current BARCODE Radio queue and submit again.";

type ClientPayload = {
  sessionId?: string;
  uploadOriginalName?: string;
  fileSize?: number;
  mimeType?: string;
};

function parseClientPayload(value: string | null | undefined): ClientPayload {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as ClientPayload;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function assertCurrentUploadSession(payloadSessionId: string | undefined, activeSessionId: string): void {
  if (!payloadSessionId?.trim()) throw new Error(SESSION_SYNC_MESSAGE);
  if (payloadSessionId !== activeSessionId) throw new Error(SESSION_SYNC_MESSAGE);
}

export function assertUploadSessionOpen(isOpen: boolean, isFull: boolean | undefined, acceptedCount: number, capacity: number): void {
  if (!isOpen) throw new Error("This broadcast queue is closed.");
  if (isFull || acceptedCount >= capacity) throw new Error("This broadcast queue is full for new transmissions.");
}

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;
  const allowPrivateSession = await verifyAdminRequest(request);

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const payload = parseClientPayload(clientPayload);
        const snapshot = await getPublicQueueSnapshot();
        if (!snapshot.session) throw new Error(SESSION_SYNC_MESSAGE);
        if (snapshot.session.purpose !== "live_broadcast" && !allowPrivateSession) throw new Error(SESSION_SYNC_MESSAGE);

        assertCurrentUploadSession(payload.sessionId, snapshot.session.sessionId);
        assertUploadSessionOpen(snapshot.status.isOpen, snapshot.status.isFull, snapshot.status.acceptedCount ?? snapshot.status.activeCount, snapshot.status.capacity);
        if (!pathname.startsWith(UPLOAD_PREFIX)) throw new Error("Invalid upload path.");
        if (!payload.uploadOriginalName?.trim()) throw new Error("Uploaded audio file name is missing.");
        if (!payload.mimeType || !AUDIO_MIME_TYPES.includes(payload.mimeType)) throw new Error("Only MP3 and WAV uploads are accepted.");
        if (!Number.isFinite(payload.fileSize) || Number(payload.fileSize) <= 0) throw new Error("Uploaded audio file size is missing.");
        if (Number(payload.fileSize) > MAX_UPLOAD_BYTES) throw new Error("Uploads must be 100MB or less.");

        return {
          allowedContentTypes: AUDIO_MIME_TYPES,
          maximumSizeInBytes: MAX_UPLOAD_BYTES,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ sessionId: payload.sessionId ?? snapshot.session.sessionId }),
        };
      },
      onUploadCompleted: async () => {
        // Queue entries are created by /api/queue after the browser receives the private Blob URL.
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload could not be completed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
