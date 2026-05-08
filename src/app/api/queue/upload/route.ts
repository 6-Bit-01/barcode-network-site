import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { getPublicQueueSnapshot } from "@/lib/queue";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
const AUDIO_MIME_TYPES = ["audio/mpeg", "audio/mp3", "audio/wav", "audio/wave", "audio/x-wav"];
const UPLOAD_PREFIX = "barcode-radio-queue/";

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

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const payload = parseClientPayload(clientPayload);
        const snapshot = await getPublicQueueSnapshot();

        if (payload.sessionId && payload.sessionId !== snapshot.session.sessionId) throw new Error("This broadcast queue is closed.");
        if (!snapshot.status.isOpen) throw new Error("This broadcast queue is closed.");
        if (snapshot.status.isFull || snapshot.status.activeCount >= snapshot.status.capacity) throw new Error("This broadcast queue is full for new transmissions.");
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
