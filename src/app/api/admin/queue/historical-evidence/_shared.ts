import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { COOKIE_NAME, verifyAdminToken } from "@/lib/auth";
import {
  QUEUE_HISTORICAL_EVIDENCE_MAX_REQUEST_BYTES,
  QueueHistoricalEvidenceError,
} from "@/lib/queue-historical-evidence-repository";

export const HISTORICAL_EVIDENCE_RESPONSE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  Vary: "Cookie",
} as const;

export async function isHistoricalEvidenceAdmin(): Promise<boolean> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  return Boolean(token && (await verifyAdminToken(token)));
}

export function historicalEvidenceUnauthorizedResponse(): NextResponse {
  return NextResponse.json(
    { error: "Unauthorized", reason: "unauthorized" },
    { status: 401, headers: HISTORICAL_EVIDENCE_RESPONSE_HEADERS },
  );
}

export function historicalEvidenceJson(
  body: unknown,
  status = 200,
): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: HISTORICAL_EVIDENCE_RESPONSE_HEADERS,
  });
}

export function historicalEvidenceErrorResponse(error: unknown): NextResponse {
  if (error instanceof QueueHistoricalEvidenceError) {
    const publicMessage = error.status === 400
      ? "The historical evidence request is invalid."
      : error.status === 409
        ? "The historical evidence append conflicts with current repository state."
        : error.status === 413
          ? "The historical evidence request is too large."
          : "The historical evidence repository is unavailable or failed integrity checks.";
    return historicalEvidenceJson(
      { error: publicMessage, reason: error.code },
      error.status,
    );
  }
  return historicalEvidenceJson(
    {
      error: "The historical evidence repository is unavailable.",
      reason: "historical_evidence_unavailable",
    },
    503,
  );
}

export function assertHistoricalEvidenceRequestKeys(
  value: unknown,
  expectedKeys: readonly string[],
): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new QueueHistoricalEvidenceError(
      "historical_evidence_request_invalid",
      400,
      "The request body must be an object.",
    );
  }
  const record = value as Record<string, unknown>;
  const actualKeys = Object.keys(record).sort();
  const sortedExpectedKeys = [...expectedKeys].sort();
  if (
    actualKeys.length !== sortedExpectedKeys.length
    || actualKeys.some((key, index) => key !== sortedExpectedKeys[index])
  ) {
    throw new QueueHistoricalEvidenceError(
      "historical_evidence_request_invalid",
      400,
      "The request body does not match the expected shape.",
    );
  }
}

export async function readHistoricalEvidenceJsonBody(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") {
    throw new QueueHistoricalEvidenceError(
      "historical_evidence_content_type_invalid",
      400,
      "The request must use application/json.",
    );
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    if (!/^\d+$/.test(contentLength)) {
      throw new QueueHistoricalEvidenceError(
        "historical_evidence_content_length_invalid",
        400,
        "The request Content-Length is invalid.",
      );
    }
    if (Number(contentLength) > QUEUE_HISTORICAL_EVIDENCE_MAX_REQUEST_BYTES) {
      throw new QueueHistoricalEvidenceError(
        "historical_evidence_request_too_large",
        413,
        "The historical evidence request exceeds the byte limit.",
      );
    }
  }

  if (!request.body) {
    throw new QueueHistoricalEvidenceError(
      "historical_evidence_request_invalid",
      400,
      "The historical evidence request body is required.",
    );
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      length += result.value.byteLength;
      if (length > QUEUE_HISTORICAL_EVIDENCE_MAX_REQUEST_BYTES) {
        await reader.cancel();
        throw new QueueHistoricalEvidenceError(
          "historical_evidence_request_too_large",
          413,
          "The historical evidence request exceeds the byte limit.",
        );
      }
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    throw new QueueHistoricalEvidenceError(
      "historical_evidence_request_not_utf8",
      400,
      "The historical evidence request is not valid UTF-8.",
      { cause: error },
    );
  }
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new QueueHistoricalEvidenceError(
      "historical_evidence_request_not_json",
      400,
      "The historical evidence request is not valid JSON.",
      { cause: error },
    );
  }
}
