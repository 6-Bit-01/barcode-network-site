import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth";
import { getPublicQueueSnapshot, getQueueReplacementTarget, recordQueueReplacementUpload } from "@/lib/queue";
import { queueOwnerHash } from "@/lib/queue-submitter-auth";
import { requestHasRehearsalQueueAccess } from "@/lib/queue-rehearsal-access";
import { QUEUE_OPERATIONAL_UNAVAILABLE_CODE, QUEUE_OPERATIONAL_UNAVAILABLE_MESSAGE, resolveQueueOperationalAccess } from "@/lib/queue-production";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
const AUDIO_MIME_TYPES = ["audio/mpeg", "audio/mp3", "audio/wav", "audio/wave", "audio/x-wav"];
const UPLOAD_PREFIX = "barcode-radio-queue/";
const SESSION_SYNC_MESSAGE = "This session has changed. Re-enter the current BARCODE Radio queue and submit again.";

type ClientPayload = {
  replaceTrackId?: string;
  expectedRevision?: number;
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
  const allowAdminPrivateSession = await verifyAdminRequest(request);
  let queueAccessDenied = false;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const payload = parseClientPayload(clientPayload);
        const snapshot = await getPublicQueueSnapshot();
        const allowRehearsalSession = snapshot.session
          ? await requestHasRehearsalQueueAccess(request, snapshot.session, snapshot.sessionActive === true)
          : false;
        const access = resolveQueueOperationalAccess({
          isAdmin: allowAdminPrivateSession,
          hasRehearsalAccess: allowRehearsalSession,
        });
        if (!access.authorized) {
          queueAccessDenied = true;
          throw new Error(QUEUE_OPERATIONAL_UNAVAILABLE_MESSAGE);
        }
        if (!snapshot.session) throw new Error(SESSION_SYNC_MESSAGE);
        if (snapshot.session.purpose !== "live_broadcast" && !allowAdminPrivateSession && !allowRehearsalSession) throw new Error(SESSION_SYNC_MESSAGE);

        assertCurrentUploadSession(payload.sessionId, snapshot.session.sessionId);
        if (payload.replaceTrackId) {
          if (request.headers.get("origin") !== new URL(request.url).origin) throw new Error("Use the BARCODE queue page to replace a song.");
          await getQueueReplacementTarget({ sessionId: payload.sessionId!, trackId: payload.replaceTrackId, expectedRevision: payload.expectedRevision!, ownerHash: queueOwnerHash(request) });
        } else {
          assertUploadSessionOpen(snapshot.status.isOpen, snapshot.status.isFull, snapshot.status.acceptedCount ?? snapshot.status.activeCount, snapshot.status.capacity);
        }
        if (!pathname.startsWith(UPLOAD_PREFIX)) throw new Error("Invalid upload path.");
        if (!payload.uploadOriginalName?.trim()) throw new Error("Uploaded audio file name is missing.");
        if (!payload.mimeType || !AUDIO_MIME_TYPES.includes(payload.mimeType)) throw new Error("Only MP3 and WAV uploads are accepted.");
        if (!Number.isFinite(payload.fileSize) || Number(payload.fileSize) <= 0) throw new Error("Uploaded audio file size is missing.");
        if (Number(payload.fileSize) > MAX_UPLOAD_BYTES) throw new Error("Uploads must be 100MB or less.");

        return {
          allowedContentTypes: AUDIO_MIME_TYPES,
          maximumSizeInBytes: MAX_UPLOAD_BYTES,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ sessionId: payload.sessionId ?? snapshot.session.sessionId, ...(payload.replaceTrackId ? { replaceTrackId: payload.replaceTrackId, ownerHash: queueOwnerHash(request) } : {}) }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        // handleUpload verifies this provider callback. Its signed token data,
        // not browser JSON, binds abandoned replacement files to their owner.
        const payload = JSON.parse(tokenPayload || "{}") as { sessionId?: string; replaceTrackId?: string; ownerHash?: string };
        if (payload.sessionId && payload.replaceTrackId && payload.ownerHash) await recordQueueReplacementUpload({ sessionId: payload.sessionId, trackId: payload.replaceTrackId, ownerHash: payload.ownerHash, fileUrl: blob.url });
        // Acceptance still happens only in /api/queue after the final lock check.
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload could not be completed.";
    if (queueAccessDenied || message === QUEUE_OPERATIONAL_UNAVAILABLE_MESSAGE) {
      return NextResponse.json(
        { error: QUEUE_OPERATIONAL_UNAVAILABLE_MESSAGE, code: QUEUE_OPERATIONAL_UNAVAILABLE_CODE },
        { status: 404, headers: { "Cache-Control": "private, no-store, max-age=0" } },
      );
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
