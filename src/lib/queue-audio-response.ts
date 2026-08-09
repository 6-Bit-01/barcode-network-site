import type { QueueEntry } from "./queue-types";

type QueueAudioEntry = Pick<QueueEntry, "id" | "sourceType" | "fileUrl" | "fileName" | "mimeType">;

type HeaderReader = { get(name: string): string | null };

export type QueueAudioBlobResult = {
  statusCode: number;
  stream: ReadableStream<Uint8Array> | null;
  headers?: HeaderReader | null;
  blob: { contentType?: string | null };
};

export type QueueAudioBlobGetter = (
  url: string,
  options: { access: "private"; headers?: { range: string } },
) => Promise<QueueAudioBlobResult | null>;

const AUDIO_MIME_TYPES = new Set(["audio/mpeg", "audio/mp3", "audio/wav", "audio/wave", "audio/x-wav"]);
const SINGLE_BYTE_RANGE = /^bytes=(\d*)-(\d*)$/i;

type ParsedAudioRange = { start: number | null; end: number | null; value: string };
type ParsedContentRange = { start: number; end: number; total: number | null };

function baseHeaders(): Headers {
  const headers = new Headers();
  headers.set("cache-control", "private, no-store");
  headers.set("accept-ranges", "bytes");
  headers.set("content-disposition", "inline");
  headers.set("x-content-type-options", "nosniff");
  headers.set("cross-origin-resource-policy", "same-origin");
  return headers;
}

function audioFailure(status: number, message = "Audio delivery failed."): Response {
  const headers = baseHeaders();
  headers.set("content-type", "text/plain; charset=utf-8");
  return new Response(message, { status, headers });
}

export function parseSingleAudioRange(value?: string | null): ParsedAudioRange | null | false {
  if (!value) return null;
  const range = value.trim();
  const match = SINGLE_BYTE_RANGE.exec(range);
  if (!match) return false;
  const [, startRaw, endRaw] = match;
  if (!startRaw && !endRaw) return false;
  const start = startRaw ? Number(startRaw) : null;
  const end = endRaw ? Number(endRaw) : null;
  if ((start !== null && (!Number.isSafeInteger(start) || start < 0)) || (end !== null && (!Number.isSafeInteger(end) || end < 0))) return false;
  if (start === null && end === 0) return false;
  if (start !== null && end !== null && start > end) return false;
  return { start, end, value: `bytes=${startRaw}-${endRaw}` };
}

export function normalizeSingleAudioRange(value?: string | null): string | null | false {
  const parsed = parseSingleAudioRange(value);
  if (parsed === false || parsed === null) return parsed;
  return parsed.value;
}

function safeContentType(entry: QueueAudioEntry, result: QueueAudioBlobResult): string {
  const entryType = entry.mimeType?.trim().toLowerCase();
  if (entryType && AUDIO_MIME_TYPES.has(entryType)) return entryType;
  const blobType = result.blob.contentType?.trim().toLowerCase();
  if (blobType && AUDIO_MIME_TYPES.has(blobType)) return blobType;
  const upstreamType = result.headers?.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  return upstreamType && AUDIO_MIME_TYPES.has(upstreamType) ? upstreamType : "audio/mpeg";
}

function parseContentRange(value: string | null): ParsedContentRange | null {
  const match = value?.match(/^bytes (\d+)-(\d+)\/(\d+|\*)$/i);
  if (!match) return null;
  const start = Number(match[1]);
  const end = Number(match[2]);
  const total = match[3] === "*" ? null : Number(match[3]);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start) return null;
  if (total !== null && (!Number.isSafeInteger(total) || total <= 0 || end >= total)) return null;
  return { start, end, total };
}

function contentRangeMatchesRequest(request: ParsedAudioRange, response: ParsedContentRange): boolean {
  if (request.start !== null) {
    if (response.start !== request.start) return false;
    if (request.end !== null) {
      const expectedEnd = response.total === null ? request.end : Math.min(request.end, response.total - 1);
      return response.end === expectedEnd;
    }
    return response.total !== null && response.end === response.total - 1;
  }
  if (request.end === null || response.total === null) return false;
  const expectedStart = Math.max(0, response.total - request.end);
  return response.start === expectedStart && response.end === response.total - 1;
}

function validContentLength(value: string | null): value is string {
  return Boolean(value && /^\d+$/.test(value));
}

export async function serveAdminQueueAudio(input: {
  entry: QueueAudioEntry;
  rangeHeader?: string | null;
  getBlob: QueueAudioBlobGetter;
}): Promise<Response> {
  const { entry, getBlob } = input;
  if (entry.sourceType !== "upload" || !entry.fileUrl) return audioFailure(404, "Audio unavailable.");
  const range = parseSingleAudioRange(input.rangeHeader);
  if (range === false) return audioFailure(416, "Requested audio range is invalid.");

  try {
    const result = await getBlob(entry.fileUrl, {
      access: "private",
      ...(range ? { headers: { range: range.value } } : {}),
    });
    if (!result?.stream) return audioFailure(404, "Audio unavailable.");
    // @vercel/blob currently normalizes every successful upstream response to statusCode 200,
    // including an authenticated Range response. Content-Range is the preserved proof that the
    // storage response was partial; the browser-facing response must restore the truthful 206.
    if (range && result.statusCode !== 200 && result.statusCode !== 206) return audioFailure(502);
    if (!range && result.statusCode !== 200) return audioFailure(502);

    const sourceContentRange = result.headers?.get("content-range") ?? null;
    const parsedContentRange = parseContentRange(sourceContentRange);
    if (range && (!parsedContentRange || !contentRangeMatchesRequest(range, parsedContentRange))) return audioFailure(502);
    if (!range && sourceContentRange) return audioFailure(502);

    const headers = baseHeaders();
    headers.set("content-type", safeContentType(entry, result));
    const sourceAcceptRanges = result.headers?.get("accept-ranges") ?? null;
    if (sourceAcceptRanges?.toLowerCase() === "bytes") headers.set("accept-ranges", "bytes");
    if (range && sourceContentRange) headers.set("content-range", sourceContentRange);
    const sourceContentLength = result.headers?.get("content-length") ?? null;
    if (range && sourceContentLength && Number(sourceContentLength) !== (parsedContentRange?.end ?? 0) - (parsedContentRange?.start ?? 0) + 1) return audioFailure(502);
    if (validContentLength(sourceContentLength)) headers.set("content-length", sourceContentLength);
    return new Response(result.stream, { status: range ? 206 : 200, headers });
  } catch {
    return audioFailure(502);
  }
}
