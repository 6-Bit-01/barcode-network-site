import { createHash } from "node:crypto";
import { del, get, list, put } from "@vercel/blob";

const SNAPSHOT_SCHEMA_VERSION = 1;
const SNAPSHOT_ROOT = "barcode-radio-queue-state/v1";
const SNAPSHOT_CURRENT_PATH = `${SNAPSHOT_ROOT}/current.json`;
const SNAPSHOT_REVISIONS_PREFIX = `${SNAPSHOT_ROOT}/revisions/`;

interface RevisionedQueueState {
  revision: number;
}

interface QueueDurableSnapshotEnvelope<T extends RevisionedQueueState> {
  schemaVersion: typeof SNAPSHOT_SCHEMA_VERSION;
  savedAt: string;
  revision: number;
  checksum: string;
  state: T;
}

let confirmedRevision = -1;
let capturePromise: Promise<void> | null = null;

function blobToken(): string | null {
  return process.env.BLOB_READ_WRITE_TOKEN?.trim() || null;
}

export function isQueueDurableSnapshotConfigured(): boolean {
  return Boolean(blobToken());
}

function normalizeRevision(value: unknown): number | null {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return Math.floor(numeric);
}

function snapshotChecksum(state: RevisionedQueueState): string {
  return createHash("sha256")
    .update(`${state.revision}\n${JSON.stringify(state)}`)
    .digest("hex");
}

function revisionPath(revision: number, checksum: string): string {
  return `${SNAPSHOT_REVISIONS_PREFIX}${String(revision).padStart(12, "0")}-${checksum}.json`;
}

function makeEnvelope<T extends RevisionedQueueState>(state: T): QueueDurableSnapshotEnvelope<T> {
  const revision = normalizeRevision(state.revision);
  if (revision === null) throw new Error("Queue snapshot revision is invalid.");
  const normalizedState = { ...state, revision } as T;
  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    savedAt: new Date().toISOString(),
    revision,
    checksum: snapshotChecksum(normalizedState),
    state: normalizedState,
  };
}

function parseEnvelope<T extends RevisionedQueueState>(input: unknown): QueueDurableSnapshotEnvelope<T> | null {
  if (!input || typeof input !== "object") return null;
  const candidate = input as Partial<QueueDurableSnapshotEnvelope<T>>;
  const revision = normalizeRevision(candidate.revision);
  const stateRevision = normalizeRevision(candidate.state?.revision);
  if (
    candidate.schemaVersion !== SNAPSHOT_SCHEMA_VERSION
    || revision === null
    || stateRevision !== revision
    || typeof candidate.savedAt !== "string"
    || typeof candidate.checksum !== "string"
    || !candidate.state
  ) return null;
  if (snapshotChecksum(candidate.state) !== candidate.checksum) return null;
  return candidate as QueueDurableSnapshotEnvelope<T>;
}

async function readEnvelope<T extends RevisionedQueueState>(pathname: string, token: string): Promise<QueueDurableSnapshotEnvelope<T> | null> {
  const result = await get(pathname, {
    access: "private",
    token,
    useCache: false,
  });
  if (!result || result.statusCode !== 200) return null;
  const text = await new Response(result.stream).text();
  try {
    return parseEnvelope<T>(JSON.parse(text));
  } catch {
    return null;
  }
}

async function newestRevisionEnvelope<T extends RevisionedQueueState>(token: string): Promise<QueueDurableSnapshotEnvelope<T> | null> {
  const candidates = [] as Awaited<ReturnType<typeof list>>["blobs"];
  let cursor: string | undefined;
  let page = 0;
  do {
    const result = await list({
      prefix: SNAPSHOT_REVISIONS_PREFIX,
      limit: 1000,
      cursor,
      token,
    });
    candidates.push(...result.blobs);
    cursor = result.hasMore ? result.cursor : undefined;
    page += 1;
  } while (cursor && page < 100);

  const ordered = candidates
    .filter((blob) => blob.pathname.endsWith(".json"))
    .sort((left, right) => right.pathname.localeCompare(left.pathname));
  for (const candidate of ordered) {
    const envelope = await readEnvelope<T>(candidate.pathname, token);
    if (envelope) return envelope;
  }
  return null;
}

export async function persistQueueDurableSnapshot<T extends RevisionedQueueState>(state: T): Promise<boolean> {
  const token = blobToken();
  if (!token) return false;
  const envelope = makeEnvelope(state);
  const body = JSON.stringify(envelope);
  const options = {
    access: "private" as const,
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 60,
    contentType: "application/json",
    token,
  };

  // The revision object is written first. If the current pointer write is
  // interrupted, recovery can still locate the newest verified committed copy.
  const immutablePath = revisionPath(envelope.revision, envelope.checksum);
  await put(immutablePath, body, options);
  try {
    await put(SNAPSHOT_CURRENT_PATH, body, options);
  } catch (error) {
    // Do not leave an uncommitted-looking revision behind when promotion of the
    // current pointer fails. The caller can then roll Redis back safely.
    try { await del(immutablePath, { token }); } catch { /* best effort */ }
    throw error;
  }
  confirmedRevision = Math.max(confirmedRevision, envelope.revision);
  return true;
}

export async function captureQueueDurableSnapshotIfNeeded<T extends RevisionedQueueState>(state: T): Promise<void> {
  if (!isQueueDurableSnapshotConfigured() || state.revision <= confirmedRevision) return;
  if (capturePromise) {
    await capturePromise;
    if (state.revision <= confirmedRevision) return;
  }
  capturePromise = (async () => {
    const current = await readQueueDurableSnapshot<T>();
    if (current && current.revision >= state.revision) {
      confirmedRevision = Math.max(confirmedRevision, current.revision);
      return;
    }
    await persistQueueDurableSnapshot(state);
  })();
  try {
    await capturePromise;
  } finally {
    capturePromise = null;
  }
}

export async function readQueueDurableSnapshot<T extends RevisionedQueueState>(): Promise<T | null> {
  const token = blobToken();
  if (!token) return null;

  const current = await readEnvelope<T>(SNAPSHOT_CURRENT_PATH, token);
  if (current) {
    confirmedRevision = Math.max(confirmedRevision, current.revision);
    return current.state;
  }

  const recovered = await newestRevisionEnvelope<T>(token);
  if (!recovered) return null;
  try {
    await put(SNAPSHOT_CURRENT_PATH, JSON.stringify(recovered), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 60,
      contentType: "application/json",
      token,
    });
  } catch {
    // The verified revision can still serve this request even if repair fails.
  }
  confirmedRevision = Math.max(confirmedRevision, recovered.revision);
  return recovered.state;
}

export const QUEUE_DURABLE_SNAPSHOT_PATHS = {
  current: SNAPSHOT_CURRENT_PATH,
  revisionsPrefix: SNAPSHOT_REVISIONS_PREFIX,
} as const;
