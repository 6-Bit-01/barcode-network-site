import { list } from "@vercel/blob";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { COOKIE_NAME, verifyAdminToken } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE_HEADERS = { "Cache-Control": "private, no-store" };
const UPLOAD_PREFIX = "barcode-radio-queue/";
const PAGE_LIMIT = 1000;
const MAX_PAGES = 100;

// The pathname epoch is generated in the browser immediately before upload.
// Blob uploadedAt is server authority and can be later while bytes transfer.
// A 30-minute tolerance flags material clock/path anomalies without excluding
// the Blob from the recovery inventory.
const MAX_EXPECTED_UPLOAD_DELAY_MS = 30 * 60 * 1000;

const RECOVERY_WINDOWS = [
  {
    label: "aug7_pdt",
    startMs: Date.parse("2026-08-07T07:00:00.000Z"),
    endMs: Date.parse("2026-08-08T07:00:00.000Z"),
    endInclusive: false,
  },
  {
    label: "aug14_canonical",
    startMs: Date.parse("2026-08-14T07:00:00.000Z"),
    endMs: Date.parse("2026-08-15T07:00:00.000Z"),
    endInclusive: false,
  },
  {
    label: "aug14_spillover",
    startMs: Date.parse("2026-08-15T07:00:00.000Z"),
    endMs: Date.parse("2026-08-15T10:23:00.000Z"),
    endInclusive: true,
  },
] as const;

type RecoveryWindowLabel = typeof RECOVERY_WINDOWS[number]["label"];

interface RecoveryUpload {
  pathname: string;
  uploadedAt: string;
  size: number;
  contentType?: string;
  recoveryWindow: RecoveryWindowLabel;
  clientEpochMs: number | null;
  clientEpochAt: string | null;
  epochPrefixDeltaMs: number | null;
  epochPrefixDiscrepancy: boolean;
}

class BlobInventoryError extends Error {
  readonly listCalls: number;

  constructor(listCalls: number) {
    super("Blob recovery inventory is incomplete.");
    this.listCalls = listCalls;
  }
}

async function assertAdmin(): Promise<boolean> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  return token ? verifyAdminToken(token) : false;
}

function epochPrefixAudit(pathname: string, uploadedAtMs: number): Pick<RecoveryUpload, "clientEpochMs" | "clientEpochAt" | "epochPrefixDeltaMs" | "epochPrefixDiscrepancy"> {
  const match = pathname.match(/^barcode-radio-queue\/(\d{13})-/);
  if (!match) {
    return {
      clientEpochMs: null,
      clientEpochAt: null,
      epochPrefixDeltaMs: null,
      epochPrefixDiscrepancy: true,
    };
  }

  const epochMs = Number(match[1]);
  const deltaMs = uploadedAtMs - epochMs;
  return {
    clientEpochMs: epochMs,
    clientEpochAt: new Date(epochMs).toISOString(),
    epochPrefixDeltaMs: deltaMs,
    epochPrefixDiscrepancy: Math.abs(deltaMs) > MAX_EXPECTED_UPLOAD_DELAY_MS,
  };
}

function recoveryWindow(uploadedAtMs: number): RecoveryWindowLabel | null {
  for (const window of RECOVERY_WINDOWS) {
    const withinEnd = window.endInclusive ? uploadedAtMs <= window.endMs : uploadedAtMs < window.endMs;
    if (uploadedAtMs >= window.startMs && withinEnd) return window.label;
  }
  return null;
}

function recoveryUpload(blob: { pathname: string; uploadedAt: Date; size: number; contentType?: string }): RecoveryUpload | null {
  if (!blob.pathname.startsWith(UPLOAD_PREFIX)) return null;
  const uploadedAtMs = blob.uploadedAt.getTime();
  if (!Number.isFinite(uploadedAtMs)) return null;
  const window = recoveryWindow(uploadedAtMs);
  if (!window) return null;

  return {
    pathname: blob.pathname,
    uploadedAt: new Date(uploadedAtMs).toISOString(),
    size: blob.size,
    ...(typeof blob.contentType === "string" ? { contentType: blob.contentType } : {}),
    recoveryWindow: window,
    ...epochPrefixAudit(blob.pathname, uploadedAtMs),
  };
}

async function listRecoveryUploads(token: string): Promise<{ uploads: RecoveryUpload[]; listCalls: number }> {
  const uploads = new Map<string, RecoveryUpload>();
  const seenCursors = new Set<string>();
  let cursor: string | undefined;
  let listCalls = 0;

  try {
    for (let page = 0; page < MAX_PAGES; page += 1) {
      listCalls += 1;
      const result = await list({
        prefix: UPLOAD_PREFIX,
        mode: "expanded",
        limit: PAGE_LIMIT,
        cursor,
        token,
      });

      for (const blob of result.blobs) {
        const candidate = recoveryUpload(blob);
        if (!candidate) continue;

        const previous = uploads.get(candidate.pathname);
        if (previous && (previous.uploadedAt !== candidate.uploadedAt || previous.size !== candidate.size || previous.contentType !== candidate.contentType)) {
          throw new Error("Blob inventory returned conflicting metadata for one pathname.");
        }
        uploads.set(candidate.pathname, candidate);
      }

      if (!result.hasMore) {
        return {
          uploads: [...uploads.values()].sort((left, right) =>
            left.uploadedAt.localeCompare(right.uploadedAt) || left.pathname.localeCompare(right.pathname)),
          listCalls,
        };
      }

      const nextCursor = result.cursor?.trim();
      if (!nextCursor || seenCursors.has(nextCursor)) {
        throw new Error("Blob inventory pagination did not advance.");
      }
      seenCursors.add(nextCursor);
      cursor = nextCursor;
    }
  } catch {
    throw new BlobInventoryError(listCalls);
  }

  throw new BlobInventoryError(listCalls);
}

export async function GET() {
  if (!(await assertAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE_HEADERS });
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!token) {
    return NextResponse.json({
      error: "Upload storage is not configured.",
      reason: "blob_storage_not_configured",
      readOnly: true,
    }, { status: 503, headers: NO_STORE_HEADERS });
  }

  try {
    const inventory = await listRecoveryUploads(token);
    return NextResponse.json({
      readOnly: true,
      complete: true,
      truncated: false,
      prefix: UPLOAD_PREFIX,
      listCalls: inventory.listCalls,
      windows: RECOVERY_WINDOWS.map((window) => ({
        label: window.label,
        startInclusive: new Date(window.startMs).toISOString(),
        ...(window.endInclusive
          ? { endInclusive: new Date(window.endMs).toISOString() }
          : { endExclusive: new Date(window.endMs).toISOString() }),
        count: inventory.uploads.filter((upload) => upload.recoveryWindow === window.label).length,
      })),
      count: inventory.uploads.length,
      uploads: inventory.uploads,
    }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return NextResponse.json({
      error: "Upload recovery inventory could not be collected.",
      reason: "blob_inventory_unavailable",
      readOnly: true,
      complete: false,
      partialResultsReturned: false,
      listCalls: error instanceof BlobInventoryError ? error.listCalls : null,
    }, { status: 503, headers: NO_STORE_HEADERS });
  }
}
