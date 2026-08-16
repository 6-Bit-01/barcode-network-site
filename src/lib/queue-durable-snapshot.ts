import { createHash } from "node:crypto";
import { get, list, put } from "@vercel/blob";

const SNAPSHOT_SCHEMA_VERSION = 1;
const SNAPSHOT_COMMIT_SCHEMA_VERSION = 1;
const SNAPSHOT_PROTOCOL_SCHEMA_VERSION = 2;
const SNAPSHOT_ROOT = "barcode-radio-queue-state/v1";
const SNAPSHOT_CURRENT_PATH = `${SNAPSHOT_ROOT}/current.json`;
const SNAPSHOT_REVISIONS_PREFIX = `${SNAPSHOT_ROOT}/revisions/`;
const SNAPSHOT_COMMITTED_PATH = `${SNAPSHOT_ROOT}/committed.json`;
const SNAPSHOT_COMMITS_PREFIX = `${SNAPSHOT_ROOT}/commits/`;
const SNAPSHOT_PROTOCOL_PATH = `${SNAPSHOT_ROOT}/protocol-v2.json`;
const SNAPSHOT_PENDING_PATH = `${SNAPSHOT_ROOT}/pending.json`;

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

interface QueueDurableSnapshotCommitMarker {
  schemaVersion: typeof SNAPSHOT_COMMIT_SCHEMA_VERSION;
  committedAt: string;
  revision: number;
  checksum: string;
  revisionPath: string;
}

interface QueueDurableSnapshotProtocolMarker {
  schemaVersion: typeof SNAPSHOT_PROTOCOL_SCHEMA_VERSION;
  protocol: "committed-revision-markers";
}

interface QueueDurableSnapshotPendingMarker {
  schemaVersion: 1;
  status: "pending" | "resolved";
  revision: number;
  checksum: string;
  previousRevision: number;
  previousChecksum: string;
  updatedAt: string;
}

interface VersionedBlobRead<T> {
  value: T | null;
  etag: string | null;
}

export type QueueDurableSnapshotWritePhase = "prepare" | "fence" | "promote" | "commit";

/**
 * A durable write failure records whether Redis can still be rolled back
 * without risking a split-brain. Once current.json may have been promoted, or
 * once the commit marker may exist, rollback is intentionally unsafe.
 */
export class QueueDurableSnapshotWriteError extends Error {
  readonly phase: QueueDurableSnapshotWritePhase;
  readonly rollbackSafe: boolean;

  constructor(
    phase: QueueDurableSnapshotWritePhase,
    rollbackSafe: boolean,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "QueueDurableSnapshotWriteError";
    this.phase = phase;
    this.rollbackSafe = rollbackSafe;
  }
}

export class QueueDurableSnapshotIntegrityError extends Error {
  readonly reason: "integrity" | "no_committed_snapshot" | "pending_commit";

  constructor(
    message: string,
    reason: "integrity" | "no_committed_snapshot" | "pending_commit" = "integrity",
  ) {
    super(message);
    this.name = "QueueDurableSnapshotIntegrityError";
    this.reason = reason;
  }
}

export interface QueueDurableSnapshotWriteOptions<T extends RevisionedQueueState = RevisionedQueueState> {
  /** Verifies and renews the Redis fencing lease immediately before promotion. */
  assertFence?: () => Promise<void>;
  /** Exact pre-mutation authority committed before protocol v2 is enabled. */
  baselineState?: T;
}

let confirmedRevision = -1;

function blobToken(): string | null {
  return process.env.BLOB_READ_WRITE_TOKEN?.trim() || null;
}

export function isQueueDurableSnapshotConfigured(): boolean {
  return Boolean(blobToken());
}

/**
 * Identifies the configured private Blob store without retaining or exposing
 * its credential. In-process degraded reads may only reuse a verified snapshot
 * when this scope still matches the configuration that produced it.
 */
export function getQueueDurableSnapshotScope(): string | null {
  const token = blobToken();
  return token ? createHash("sha256").update(token).digest("hex") : null;
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

function commitPath(revision: number, checksum: string): string {
  return `${SNAPSHOT_COMMITS_PREFIX}${String(revision).padStart(12, "0")}-${checksum}.json`;
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

function makeCommitMarker<T extends RevisionedQueueState>(
  envelope: QueueDurableSnapshotEnvelope<T>,
): QueueDurableSnapshotCommitMarker {
  return {
    schemaVersion: SNAPSHOT_COMMIT_SCHEMA_VERSION,
    committedAt: new Date().toISOString(),
    revision: envelope.revision,
    checksum: envelope.checksum,
    revisionPath: revisionPath(envelope.revision, envelope.checksum),
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

function parseCommitMarker(input: unknown): QueueDurableSnapshotCommitMarker | null {
  if (!input || typeof input !== "object") return null;
  const candidate = input as Partial<QueueDurableSnapshotCommitMarker>;
  const revision = normalizeRevision(candidate.revision);
  if (
    candidate.schemaVersion !== SNAPSHOT_COMMIT_SCHEMA_VERSION
    || revision === null
    || typeof candidate.committedAt !== "string"
    || typeof candidate.checksum !== "string"
    || !/^[a-f0-9]{64}$/.test(candidate.checksum)
    || candidate.revisionPath !== revisionPath(revision, candidate.checksum)
  ) return null;
  return { ...candidate, revision } as QueueDurableSnapshotCommitMarker;
}

function parsePendingMarker(input: unknown): QueueDurableSnapshotPendingMarker | null {
  if (!input || typeof input !== "object") return null;
  const candidate = input as Partial<QueueDurableSnapshotPendingMarker>;
  const revision = normalizeRevision(candidate.revision);
  const previousRevision = normalizeRevision(candidate.previousRevision);
  if (
    candidate.schemaVersion !== 1
    || (candidate.status !== "pending" && candidate.status !== "resolved")
    || revision === null
    || previousRevision === null
    || revision !== previousRevision + 1
    || typeof candidate.updatedAt !== "string"
    || typeof candidate.checksum !== "string"
    || typeof candidate.previousChecksum !== "string"
    || !/^[a-f0-9]{64}$/.test(candidate.checksum)
    || !/^[a-f0-9]{64}$/.test(candidate.previousChecksum)
  ) return null;
  return { ...candidate, revision, previousRevision } as QueueDurableSnapshotPendingMarker;
}

function envelopeMatches<T extends RevisionedQueueState>(
  envelope: QueueDurableSnapshotEnvelope<T> | null,
  expected: QueueDurableSnapshotEnvelope<T>,
): boolean {
  return Boolean(envelope
    && envelope.revision === expected.revision
    && envelope.checksum === expected.checksum);
}

function markerMatchesEnvelope<T extends RevisionedQueueState>(
  marker: QueueDurableSnapshotCommitMarker | null,
  envelope: QueueDurableSnapshotEnvelope<T>,
): boolean {
  return Boolean(marker
    && marker.revision === envelope.revision
    && marker.checksum === envelope.checksum
    && marker.revisionPath === revisionPath(envelope.revision, envelope.checksum));
}

async function readEnvelopeVersioned<T extends RevisionedQueueState>(
  pathname: string,
  token: string,
): Promise<VersionedBlobRead<QueueDurableSnapshotEnvelope<T>>> {
  const result = await get(pathname, {
    access: "private",
    token,
    useCache: false,
  });
  if (!result || result.statusCode !== 200) return { value: null, etag: null };
  const text = await new Response(result.stream).text();
  try {
    return { value: parseEnvelope<T>(JSON.parse(text)), etag: result.blob.etag };
  } catch {
    return { value: null, etag: result.blob.etag };
  }
}

async function readEnvelope<T extends RevisionedQueueState>(pathname: string, token: string): Promise<QueueDurableSnapshotEnvelope<T> | null> {
  return (await readEnvelopeVersioned<T>(pathname, token)).value;
}

async function readCommitMarkerVersioned(
  pathname: string,
  token: string,
): Promise<VersionedBlobRead<QueueDurableSnapshotCommitMarker>> {
  const result = await get(pathname, {
    access: "private",
    token,
    useCache: false,
  });
  if (!result || result.statusCode !== 200) return { value: null, etag: null };
  const text = await new Response(result.stream).text();
  try {
    return { value: parseCommitMarker(JSON.parse(text)), etag: result.blob.etag };
  } catch {
    return { value: null, etag: result.blob.etag };
  }
}

async function readCommitMarker(pathname: string, token: string): Promise<QueueDurableSnapshotCommitMarker | null> {
  return (await readCommitMarkerVersioned(pathname, token)).value;
}

async function readPendingMarkerVersioned(
  token: string,
): Promise<VersionedBlobRead<QueueDurableSnapshotPendingMarker>> {
  const result = await get(SNAPSHOT_PENDING_PATH, {
    access: "private",
    token,
    useCache: false,
  });
  if (!result || result.statusCode !== 200) return { value: null, etag: null };
  const text = await new Response(result.stream).text();
  try {
    return { value: parsePendingMarker(JSON.parse(text)), etag: result.blob.etag };
  } catch {
    return { value: null, etag: result.blob.etag };
  }
}

async function readProtocolMarkerVersioned(token: string): Promise<VersionedBlobRead<boolean>> {
  const result = await get(SNAPSHOT_PROTOCOL_PATH, {
    access: "private",
    token,
    useCache: false,
  });
  if (!result || result.statusCode !== 200) return { value: null, etag: null };
  const text = await new Response(result.stream).text();
  try {
    const marker = JSON.parse(text) as Partial<QueueDurableSnapshotProtocolMarker>;
    const valid = marker.schemaVersion === SNAPSHOT_PROTOCOL_SCHEMA_VERSION
      && marker.protocol === "committed-revision-markers";
    return { value: valid ? true : null, etag: result.blob.etag };
  } catch {
    return { value: null, etag: result.blob.etag };
  }
}

async function readProtocolMarker(token: string): Promise<boolean> {
  const marker = await readProtocolMarkerVersioned(token);
  if (marker.etag && marker.value !== true) {
    throw new QueueDurableSnapshotIntegrityError(
      "The durable queue snapshot protocol marker is invalid.",
    );
  }
  return marker.value === true;
}

function commitIdentityFromCanonicalPath(
  pathname: string,
): { revision: number; checksum: string } | null {
  const escapedPrefix = SNAPSHOT_COMMITS_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`^${escapedPrefix}(\\d{12})-([a-f0-9]{64})\\.json$`).exec(pathname);
  if (!match) return null;
  const revision = normalizeRevision(match[1]);
  if (revision === null || commitPath(revision, match[2]) !== pathname) return null;
  return { revision, checksum: match[2] };
}

async function envelopeForCommitMarker<T extends RevisionedQueueState>(
  marker: QueueDurableSnapshotCommitMarker,
  token: string,
  currentProof: QueueDurableSnapshotEnvelope<T> | null = null,
): Promise<QueueDurableSnapshotEnvelope<T>> {
  let envelope: QueueDurableSnapshotEnvelope<T> | null;
  try {
    envelope = await readEnvelope<T>(marker.revisionPath, token);
  } catch {
    throw new QueueDurableSnapshotIntegrityError(
      `Committed queue snapshot revision ${marker.revision} cannot be read.`,
    );
  }
  if (envelope && markerMatchesEnvelope(marker, envelope)) return envelope;

  // A syntactically valid commit marker is the durable commit point. Ignoring
  // one whose immutable revision disappeared (or no longer validates) could
  // silently roll recovery back to an older show. Only the independently
  // checksummed current pointer can prove the exact same committed state.
  if (currentProof && markerMatchesEnvelope(marker, currentProof)) return currentProof;
  throw new QueueDurableSnapshotIntegrityError(
    `Committed queue snapshot revision ${marker.revision} cannot be verified.`,
  );
}

async function envelopeForCommittedManifest<T extends RevisionedQueueState>(
  manifest: QueueDurableSnapshotCommitMarker,
  token: string,
  currentProof: QueueDurableSnapshotEnvelope<T> | null,
): Promise<QueueDurableSnapshotEnvelope<T>> {
  const envelope = await envelopeForCommitMarker<T>(manifest, token, currentProof);
  let canonicalRead: VersionedBlobRead<QueueDurableSnapshotCommitMarker>;
  try {
    canonicalRead = await readCommitMarkerVersioned(
      commitPath(manifest.revision, manifest.checksum),
      token,
    );
  } catch {
    throw new QueueDurableSnapshotIntegrityError(
      `Canonical commit marker for revision ${manifest.revision} cannot be read.`,
    );
  }
  if (!canonicalRead.value
    || !markerMatchesEnvelope(canonicalRead.value, envelope)) {
    throw new QueueDurableSnapshotIntegrityError(
      `Canonical commit marker for revision ${manifest.revision} cannot be verified.`,
    );
  }
  return envelope;
}

async function newestCommittedRevisionEnvelope<T extends RevisionedQueueState>(
  token: string,
  currentProof: QueueDurableSnapshotEnvelope<T> | null,
): Promise<QueueDurableSnapshotEnvelope<T> | null> {
  const candidates = [] as Awaited<ReturnType<typeof list>>["blobs"];
  let cursor: string | undefined;
  let page = 0;
  do {
    const result = await list({
      prefix: SNAPSHOT_COMMITS_PREFIX,
      limit: 1000,
      cursor,
      token,
    });
    candidates.push(...result.blobs);
    cursor = result.hasMore ? result.cursor : undefined;
    page += 1;
  } while (cursor && page < 100);
  if (cursor) {
    throw new QueueDurableSnapshotIntegrityError(
      "Committed queue snapshot marker pagination exceeded the safe audit limit.",
    );
  }

  let newest: QueueDurableSnapshotEnvelope<T> | null = null;
  for (const candidate of candidates.filter((blob) => blob.pathname.endsWith(".json"))) {
    const identity = commitIdentityFromCanonicalPath(candidate.pathname);
    if (!identity) continue;
    let markerRead: VersionedBlobRead<QueueDurableSnapshotCommitMarker>;
    try {
      markerRead = await readCommitMarkerVersioned(candidate.pathname, token);
    } catch {
      throw new QueueDurableSnapshotIntegrityError(
        `Committed queue snapshot marker ${candidate.pathname} cannot be read.`,
      );
    }
    const marker = markerRead.value;
    if (!marker
      || marker.revision !== identity.revision
      || marker.checksum !== identity.checksum) {
      throw new QueueDurableSnapshotIntegrityError(
        `Committed queue snapshot marker ${candidate.pathname} cannot be verified.`,
      );
    }
    // Blob listing order is not an authority boundary. Numeric revision is
    // the only ordering input after canonical pathname/content validation.
    const envelope = await envelopeForCommitMarker<T>(marker, token, currentProof);
    if (!newest || envelope.revision > newest.revision) {
      newest = envelope;
      continue;
    }
    if (envelope.revision === newest.revision && envelope.checksum !== newest.checksum) {
      throw new QueueDurableSnapshotIntegrityError(
        `Conflicting committed queue snapshots exist at revision ${envelope.revision}.`,
      );
    }
  }
  return newest;
}

function blobWriteOptions(token: string, concurrency?: { etag: string | null }) {
  return {
    access: "private" as const,
    addRandomSuffix: false,
    allowOverwrite: concurrency ? Boolean(concurrency.etag) : true,
    cacheControlMaxAge: 60,
    contentType: "application/json",
    token,
    ...(concurrency?.etag ? { ifMatch: concurrency.etag } : {}),
  };
}

function pendingMarkerFor<T extends RevisionedQueueState>(
  envelope: QueueDurableSnapshotEnvelope<T>,
  previous: QueueDurableSnapshotEnvelope<T>,
  status: QueueDurableSnapshotPendingMarker["status"] = "pending",
): QueueDurableSnapshotPendingMarker {
  if (envelope.revision !== previous.revision + 1) {
    throw new QueueDurableSnapshotWriteError(
      "prepare",
      true,
      "Durable queue snapshot revisions must advance exactly once.",
    );
  }
  return {
    schemaVersion: 1,
    status,
    revision: envelope.revision,
    checksum: envelope.checksum,
    previousRevision: previous.revision,
    previousChecksum: previous.checksum,
    updatedAt: new Date().toISOString(),
  };
}

function pendingIdentityMatches(
  left: QueueDurableSnapshotPendingMarker,
  right: QueueDurableSnapshotPendingMarker,
): boolean {
  return left.revision === right.revision
    && left.checksum === right.checksum
    && left.previousRevision === right.previousRevision
    && left.previousChecksum === right.previousChecksum;
}

async function promotePendingMarkerVerified(
  marker: QueueDurableSnapshotPendingMarker,
  token: string,
): Promise<void> {
  let observed: VersionedBlobRead<QueueDurableSnapshotPendingMarker>;
  try {
    observed = await readPendingMarkerVersioned(token);
  } catch (error) {
    throw new QueueDurableSnapshotWriteError(
      "prepare",
      true,
      "Durable queue pending intent could not be read.",
      { cause: error },
    );
  }
  if (observed.etag && !observed.value) {
    throw new QueueDurableSnapshotIntegrityError("The durable queue pending intent is invalid.");
  }
  if (observed.value?.status === "pending") {
    if (pendingIdentityMatches(observed.value, marker)) return;
    throw new QueueDurableSnapshotIntegrityError(
      "A different durable queue mutation is still pending.",
      "pending_commit",
    );
  }
  try {
    await put(
      SNAPSHOT_PENDING_PATH,
      JSON.stringify(marker),
      blobWriteOptions(token, { etag: observed.etag }),
    );
  } catch (error) {
    try {
      const confirmed = await readPendingMarkerVersioned(token);
      if (confirmed.value?.status === "pending"
        && pendingIdentityMatches(confirmed.value, marker)) return;
    } catch {
      // The intent remains unconfirmed.
    }
    throw new QueueDurableSnapshotWriteError(
      "prepare",
      true,
      "Durable queue pending intent could not be confirmed.",
      { cause: error },
    );
  }
}

async function resolvePendingMarkerIfExact(
  envelope: { revision: number; checksum: string },
  token: string,
): Promise<boolean> {
  let observed: VersionedBlobRead<QueueDurableSnapshotPendingMarker>;
  try {
    observed = await readPendingMarkerVersioned(token);
  } catch (error) {
    throw new QueueDurableSnapshotWriteError(
      "commit",
      false,
      "Durable queue pending intent could not be read during resolution.",
      { cause: error },
    );
  }
  if (!observed.etag) return true;
  if (!observed.value) {
    throw new QueueDurableSnapshotIntegrityError("The durable queue pending intent is invalid.");
  }
  if (observed.value.status === "resolved") return true;
  if (observed.value.revision !== envelope.revision
    || observed.value.checksum !== envelope.checksum) return false;
  const resolved = { ...observed.value, status: "resolved" as const, updatedAt: new Date().toISOString() };
  try {
    await put(
      SNAPSHOT_PENDING_PATH,
      JSON.stringify(resolved),
      blobWriteOptions(token, { etag: observed.etag }),
    );
  } catch (error) {
    try {
      const confirmed = await readPendingMarkerVersioned(token);
      if (confirmed.value?.status === "resolved"
        && pendingIdentityMatches(confirmed.value, resolved)) return true;
      if (confirmed.value && !pendingIdentityMatches(confirmed.value, resolved)) return false;
    } catch {
      // The resolution remains ambiguous.
    }
    throw new QueueDurableSnapshotWriteError(
      "commit",
      false,
      "Durable queue pending intent resolution could not be confirmed.",
      { cause: error },
    );
  }
  return true;
}

export async function abandonPreparedQueueDurableSnapshotIfExact<T extends RevisionedQueueState>(
  state: T,
): Promise<boolean> {
  const token = blobToken();
  if (!token) return false;
  return resolvePendingMarkerIfExact(makeEnvelope(state), token);
}

/**
 * Resolves the one bounded durable intent while a caller holds an exact Redis
 * fence. Redis equal to the target finishes the prepared commit; Redis equal
 * to the recorded predecessor proves the intent was abandoned. Anything else
 * is a split-brain conflict and remains visibly pending.
 */
export async function reconcileQueueDurablePendingSnapshot<T extends RevisionedQueueState>(
  redisState: T,
  options: QueueDurableSnapshotWriteOptions<T> = {},
): Promise<"none" | "committed" | "abandoned"> {
  const token = blobToken();
  if (!token) return "none";
  const observed = await readPendingMarkerVersioned(token);
  if (!observed.etag) return "none";
  if (!observed.value) {
    throw new QueueDurableSnapshotIntegrityError("The durable queue pending intent is invalid.");
  }
  const pending = observed.value;
  if (pending.status === "resolved") return "none";
  const redisEnvelope = makeEnvelope(redisState);
  if (redisEnvelope.revision === pending.revision
    && redisEnvelope.checksum === pending.checksum) {
    const committed = await commitPreparedQueueDurableSnapshotIfExact(redisState, options);
    if (!committed) {
      throw new QueueDurableSnapshotIntegrityError(
        "The pending durable queue target has no exact immutable snapshot.",
        "pending_commit",
      );
    }
    return "committed";
  }
  if (redisEnvelope.revision === pending.previousRevision
    && redisEnvelope.checksum === pending.previousChecksum) {
    await assertFence(options, true);
    if (!await resolvePendingMarkerIfExact(pending, token)) {
      throw new QueueDurableSnapshotIntegrityError(
        "The durable queue pending intent changed during abandonment.",
        "pending_commit",
      );
    }
    await assertFence(options, true);
    return "abandoned";
  }
  throw new QueueDurableSnapshotIntegrityError(
    "Redis matches neither side of the durable queue pending intent.",
    "pending_commit",
  );
}

async function putEnvelopeVerified<T extends RevisionedQueueState>(
  pathname: string,
  envelope: QueueDurableSnapshotEnvelope<T>,
  token: string,
  phase: QueueDurableSnapshotWritePhase,
  rollbackSafe: boolean,
  createOnly = false,
): Promise<void> {
  try {
    await put(pathname, JSON.stringify(envelope), {
      ...blobWriteOptions(token),
      ...(createOnly ? { allowOverwrite: false } : {}),
    });
    return;
  } catch (error) {
    try {
      if (envelopeMatches(await readEnvelope<T>(pathname, token), envelope)) return;
    } catch {
      // The write result remains ambiguous and is classified by its phase.
    }
    throw new QueueDurableSnapshotWriteError(
      phase,
      rollbackSafe,
      `Durable queue snapshot ${phase} could not be confirmed.`,
      { cause: error },
    );
  }
}

async function putCommitMarkerVerified<T extends RevisionedQueueState>(
  pathname: string,
  marker: QueueDurableSnapshotCommitMarker,
  envelope: QueueDurableSnapshotEnvelope<T>,
  token: string,
  rollbackSafe = false,
): Promise<void> {
  try {
    await put(pathname, JSON.stringify(marker), {
      ...blobWriteOptions(token),
      allowOverwrite: false,
    });
    return;
  } catch (error) {
    try {
      if (markerMatchesEnvelope(await readCommitMarker(pathname, token), envelope)) return;
    } catch {
      // A commit-marker write can have succeeded even when its response failed.
    }
    throw new QueueDurableSnapshotWriteError(
      "commit",
      rollbackSafe,
      "Durable queue snapshot commit could not be confirmed.",
      { cause: error },
    );
  }
}

async function assertFence(
  options: QueueDurableSnapshotWriteOptions,
  rollbackSafe: boolean,
): Promise<void> {
  if (!options.assertFence) return;
  try {
    await options.assertFence();
  } catch (error) {
    throw new QueueDurableSnapshotWriteError(
      "fence",
      rollbackSafe,
      "Queue mutation fencing lease could not be confirmed.",
      { cause: error },
    );
  }
}

async function promoteCurrentPointerVerified<T extends RevisionedQueueState>(
  envelope: QueueDurableSnapshotEnvelope<T>,
  token: string,
): Promise<void> {
  let observed: VersionedBlobRead<QueueDurableSnapshotEnvelope<T>>;
  try {
    observed = await readEnvelopeVersioned<T>(SNAPSHOT_CURRENT_PATH, token);
  } catch (error) {
    throw new QueueDurableSnapshotWriteError(
      "promote",
      true,
      "Durable queue current pointer could not be read before promotion.",
      { cause: error },
    );
  }
  if (envelopeMatches(observed.value, envelope)) return;
  if (observed.value && (observed.value.revision > envelope.revision
    || observed.value.revision === envelope.revision)) {
    throw new QueueDurableSnapshotWriteError(
      "promote",
      false,
      "Durable queue current pointer is newer or differs at the proposed revision.",
    );
  }
  try {
    await put(
      SNAPSHOT_CURRENT_PATH,
      JSON.stringify(envelope),
      blobWriteOptions(token, { etag: observed.etag }),
    );
  } catch (error) {
    try {
      const confirmed = await readEnvelope<T>(SNAPSHOT_CURRENT_PATH, token);
      if (envelopeMatches(confirmed, envelope)) return;
    } catch {
      // The conditional promotion outcome remains unknown.
    }
    throw new QueueDurableSnapshotWriteError(
      "promote",
      false,
      "Durable queue current pointer promotion could not be confirmed.",
      { cause: error },
    );
  }
}

async function promoteCommittedManifestBestEffort<T extends RevisionedQueueState>(
  marker: QueueDurableSnapshotCommitMarker,
  envelope: QueueDurableSnapshotEnvelope<T>,
  token: string,
): Promise<void> {
  try {
    const observed = await readCommitMarkerVersioned(SNAPSHOT_COMMITTED_PATH, token);
    const current = observed.value;
    if (current && current.revision > marker.revision) return;
    if (current && current.revision === marker.revision && current.checksum !== marker.checksum) return;
    if (current && current.revision === marker.revision && current.checksum === marker.checksum) return;
    await put(
      SNAPSHOT_COMMITTED_PATH,
      JSON.stringify(marker),
      blobWriteOptions(token, { etag: observed.etag }),
    );
  } catch {
    // The per-revision commit marker remains authoritative. A later read can
    // repair this optimization pointer without weakening the append-only
    // recovery boundary.
  }
  confirmedRevision = Math.max(confirmedRevision, envelope.revision);
}

async function promoteCommittedManifestVerified<T extends RevisionedQueueState>(
  marker: QueueDurableSnapshotCommitMarker,
  envelope: QueueDurableSnapshotEnvelope<T>,
  token: string,
  phase: QueueDurableSnapshotWritePhase = "prepare",
  rollbackSafe = true,
): Promise<void> {
  let observed: VersionedBlobRead<QueueDurableSnapshotCommitMarker>;
  try {
    observed = await readCommitMarkerVersioned(SNAPSHOT_COMMITTED_PATH, token);
  } catch (error) {
    throw new QueueDurableSnapshotWriteError(
      phase,
      rollbackSafe,
      "Durable queue snapshot baseline manifest could not be read.",
      { cause: error },
    );
  }
  if (observed.value) {
    if (observed.value.revision > marker.revision
      || (observed.value.revision === marker.revision
        && observed.value.checksum !== marker.checksum)) {
      throw new QueueDurableSnapshotWriteError(
        phase,
        rollbackSafe,
        "Durable queue snapshot baseline manifest conflicts with initialization.",
      );
    }
    if (observed.value.revision === marker.revision
      && observed.value.checksum === marker.checksum) return;
  } else if (observed.etag) {
    throw new QueueDurableSnapshotWriteError(
      phase,
      rollbackSafe,
      "Durable queue snapshot baseline manifest is invalid.",
    );
  }
  try {
    await put(
      SNAPSHOT_COMMITTED_PATH,
      JSON.stringify(marker),
      blobWriteOptions(token, { etag: observed.etag }),
    );
  } catch (error) {
    try {
      const confirmed = await readCommitMarker(SNAPSHOT_COMMITTED_PATH, token);
      if (confirmed
        && confirmed.revision === marker.revision
        && confirmed.checksum === marker.checksum
        && markerMatchesEnvelope(confirmed, envelope)) return;
    } catch {
      // The initialization head remains unverified.
    }
    throw new QueueDurableSnapshotWriteError(
      phase,
      rollbackSafe,
      "Durable queue snapshot baseline manifest could not be confirmed.",
      { cause: error },
    );
  }
}

async function committedSnapshotProtocolEnabled(token: string): Promise<boolean> {
  try {
    return await readProtocolMarker(token);
  } catch (error) {
    throw new QueueDurableSnapshotWriteError(
      "prepare",
      true,
      "Durable queue snapshot protocol could not be read before mutation.",
      { cause: error },
    );
  }
}

async function seedCommittedSnapshotProtocolBaseline<T extends RevisionedQueueState>(
  token: string,
  legacyEnvelope: QueueDurableSnapshotEnvelope<T> | null,
  options: QueueDurableSnapshotWriteOptions<T> = {},
): Promise<void> {
  // Migration must make the last legacy current.json state recoverable before
  // enabling protocol v2. Otherwise a crash between the protocol marker and
  // the next commit could strand the only known-good snapshot.
  if (legacyEnvelope) {
    await assertFence(options, true);
    await putEnvelopeVerified(
      revisionPath(legacyEnvelope.revision, legacyEnvelope.checksum),
      legacyEnvelope,
      token,
      "prepare",
      true,
      true,
    );
    const legacyMarker = makeCommitMarker(legacyEnvelope);
    await assertFence(options, true);
    await putCommitMarkerVerified(
      commitPath(legacyMarker.revision, legacyMarker.checksum),
      legacyMarker,
      legacyEnvelope,
      token,
      true,
    );
    await assertFence(options, true);
    await promoteCommittedManifestVerified(legacyMarker, legacyEnvelope, token);
  }
}

async function enableCommittedSnapshotProtocol(
  token: string,
  options: QueueDurableSnapshotWriteOptions = {},
): Promise<void> {
  const marker: QueueDurableSnapshotProtocolMarker = {
    schemaVersion: SNAPSHOT_PROTOCOL_SCHEMA_VERSION,
    protocol: "committed-revision-markers",
  };
  await assertFence(options, true);
  try {
    await put(SNAPSHOT_PROTOCOL_PATH, JSON.stringify(marker), blobWriteOptions(token));
  } catch (error) {
    try {
      if (!await readProtocolMarker(token)) throw error;
    } catch {
      throw new QueueDurableSnapshotWriteError(
        "prepare",
        true,
        "Durable queue snapshot protocol could not be confirmed.",
        { cause: error },
      );
    }
  }
  await assertFence(options, true);
}

/**
 * Creates the immutable next revision before Redis is allowed to commit. An
 * interrupted mutation therefore leaves either harmless uncommitted data or
 * an exact revision that a later fenced worker can finish.
 */
export async function prepareQueueDurableSnapshot<T extends RevisionedQueueState>(
  state: T,
  options: QueueDurableSnapshotWriteOptions<T> = {},
): Promise<boolean> {
  const token = blobToken();
  if (!token) return false;
  const envelope = makeEnvelope(state);
  let existing: T | null;
  let existingEnvelope: QueueDurableSnapshotEnvelope<T> | null = null;
  try {
    existing = await readQueueDurableSnapshot<T>();
  } catch (error) {
    // No durable promotion has been attempted yet, so Redis can still be
    // rolled back honestly when the authoritative pre-write read is
    // unavailable.
    throw new QueueDurableSnapshotWriteError(
      "prepare",
      true,
      "Durable queue snapshot state could not be read before mutation.",
      { cause: error },
    );
  }
  if (existing) {
    existingEnvelope = makeEnvelope(existing);
    if (existingEnvelope.revision > envelope.revision) {
      throw new QueueDurableSnapshotWriteError(
        "promote",
        true,
        "Durable queue snapshot is newer than the proposed revision.",
      );
    }
    if (existingEnvelope.revision === envelope.revision) {
      if (existingEnvelope.checksum !== envelope.checksum) {
        throw new QueueDurableSnapshotWriteError(
          "promote",
          true,
          "Durable queue snapshot differs at the proposed revision.",
        );
      }
      confirmedRevision = Math.max(confirmedRevision, envelope.revision);
      return true;
    }
  }

  // Once this marker exists, readers will never interpret an unmarked
  // current.json write as a legacy committed snapshot.
  if (!existing && !options.baselineState) {
    throw new QueueDurableSnapshotWriteError(
      "prepare",
      true,
      "A durable queue snapshot baseline is required before protocol initialization.",
    );
  }
  const baseline = existing
    ? makeEnvelope(existing)
    : options.baselineState
      ? makeEnvelope(options.baselineState)
      : null;
  // The migration seed preserves the raw legacy durable authority, while the
  // pending predecessor must describe the exact canonical Redis value guarded
  // by the caller's fence. Legacy snapshots may omit fields that normalization
  // adds, so those two checksums are intentionally allowed to differ.
  const pendingBaseline = options.baselineState
    ? makeEnvelope(options.baselineState)
    : baseline;
  if (baseline && pendingBaseline && baseline.revision !== pendingBaseline.revision) {
    throw new QueueDurableSnapshotWriteError(
      "prepare",
      true,
      "The durable and Redis queue baselines are at different revisions.",
    );
  }
  await assertFence(options, true);
  const protocolAlreadyEnabled = await committedSnapshotProtocolEnabled(token);
  if (protocolAlreadyEnabled && existingEnvelope) {
    // Before current.json can be overwritten with an uncommitted next
    // revision, the currently committed head must have a second bounded
    // recovery pointer. Otherwise a later pre-marker crash could hide it.
    await promoteCommittedManifestVerified(
      makeCommitMarker(existingEnvelope),
      existingEnvelope,
      token,
    );
    await assertFence(options, true);
    await resolvePendingMarkerIfExact(existingEnvelope, token);
    await assertFence(options, true);
  }

  const immutablePath = revisionPath(envelope.revision, envelope.checksum);
  await putEnvelopeVerified(immutablePath, envelope, token, "prepare", true, true);
  await assertFence(options, true);
  if (!pendingBaseline) {
    throw new QueueDurableSnapshotWriteError(
      "prepare",
      true,
      "A durable queue snapshot baseline is required before publishing a pending intent.",
    );
  }
  await promotePendingMarkerVerified(pendingMarkerFor(envelope, pendingBaseline), token);
  await assertFence(options, true);
  if (!protocolAlreadyEnabled) {
    // The target immutable and exact predecessor/target intent are visible
    // before protocol v2 changes read semantics. A legacy writer that wins
    // during the protocol PUT therefore leaves an explicit pending conflict,
    // never a clean stale baseline.
    await seedCommittedSnapshotProtocolBaseline(token, baseline, options);
    await enableCommittedSnapshotProtocol(token, options);
  }
  return true;
}

export async function persistQueueDurableSnapshot<T extends RevisionedQueueState>(
  state: T,
  options: QueueDurableSnapshotWriteOptions<T> = {},
): Promise<boolean> {
  if (!await prepareQueueDurableSnapshot(state, options)) return false;
  return commitPreparedQueueDurableSnapshotIfExact(state, options);
}

/**
 * Completes an interrupted durable commit only when the immutable revision
 * exactly matches the Redis state, current.json is not newer/conflicting, and
 * the Redis state remains protected by assertFence.
 */
export async function commitPreparedQueueDurableSnapshotIfExact<T extends RevisionedQueueState>(
  state: T,
  options: QueueDurableSnapshotWriteOptions<T> = {},
): Promise<boolean> {
  const token = blobToken();
  if (!token) return false;
  const envelope = makeEnvelope(state);
  const immutablePath = revisionPath(envelope.revision, envelope.checksum);
  const [currentRead, immutable, committedProtocol] = await Promise.all([
    readEnvelopeVersioned<T>(SNAPSHOT_CURRENT_PATH, token),
    readEnvelope<T>(immutablePath, token),
    readProtocolMarker(token),
  ]);
  const current = currentRead.value;
  if (!committedProtocol && currentRead.etag && !current) {
    throw new QueueDurableSnapshotIntegrityError(
      "The legacy durable queue current snapshot is invalid.",
    );
  }
  if (!envelopeMatches(immutable, envelope)) return false;
  if (current && (current.revision > envelope.revision
    || (current.revision === envelope.revision && !envelopeMatches(current, envelope)))) return false;

  // Verify the prepared revision before changing the recovery protocol. If a
  // legacy current pointer exists, it must itself become an immutable,
  // committed revision before protocol v2 can make unmarked current pointers
  // ineligible. A failed seed therefore leaves legacy recovery intact.
  const protocolAlreadyEnabled = await committedSnapshotProtocolEnabled(token);
  if (!protocolAlreadyEnabled) {
    const migrationPrevious = current
      ?? (options.baselineState ? makeEnvelope(options.baselineState) : null);
    if (migrationPrevious && envelope.revision === migrationPrevious.revision + 1) {
      await assertFence(options, false);
      await promotePendingMarkerVerified(pendingMarkerFor(envelope, migrationPrevious), token);
      await assertFence(options, false);
    } else if (!migrationPrevious || envelope.revision !== migrationPrevious.revision) {
      throw new QueueDurableSnapshotIntegrityError(
        "Protocol migration cannot prove the prepared revision predecessor.",
        "pending_commit",
      );
    }
    await seedCommittedSnapshotProtocolBaseline(token, migrationPrevious, options);
    await enableCommittedSnapshotProtocol(token, options);
  }
  await assertFence(options, false);
  await promoteCurrentPointerVerified(envelope, token);
  await assertFence(options, false);
  // This marker is the durable commit point. Revision objects without it are
  // prepared/orphaned data and are never eligible for fallback recovery.
  const marker = makeCommitMarker(envelope);
  await putCommitMarkerVerified(commitPath(marker.revision, marker.checksum), marker, envelope, token);
  try { await assertFence(options, false); } catch { /* marker already committed */ }
  await promoteCommittedManifestVerified(marker, envelope, token, "commit", false);
  if (!await resolvePendingMarkerIfExact(envelope, token)) {
    throw new QueueDurableSnapshotWriteError(
      "commit",
      false,
      "Durable queue pending intent changed before commit resolution.",
    );
  }
  confirmedRevision = Math.max(confirmedRevision, envelope.revision);
  return true;
}

async function readQueueDurableSnapshotInternal<T extends RevisionedQueueState>(
  includeCommitHistory: boolean,
): Promise<T | null> {
  const token = blobToken();
  if (!token) return null;

  const [currentRead, committedManifestRead, committedProtocolRead, pendingRead] = await Promise.all([
    readEnvelopeVersioned<T>(SNAPSHOT_CURRENT_PATH, token),
    readCommitMarkerVersioned(SNAPSHOT_COMMITTED_PATH, token),
    readProtocolMarkerVersioned(token),
    readPendingMarkerVersioned(token),
  ]);
  const current = currentRead.value;
  const committedManifest = committedManifestRead.value;
  const committedProtocol = committedProtocolRead.value === true;

  if (committedProtocolRead.etag && !committedProtocol) {
    throw new QueueDurableSnapshotIntegrityError(
      "The durable queue snapshot protocol marker is invalid.",
    );
  }
  if (pendingRead.etag && !pendingRead.value) {
    throw new QueueDurableSnapshotIntegrityError(
      "The durable queue pending intent is invalid.",
    );
  }

  // Before protocol v2 exists, current.json is legacy authority unless an
  // interrupted migration already produced valid committed artifacts. Their
  // highest nonconflicting state is recoverable when current is absent, and
  // must match current exactly when it is present. This deliberately rejects a
  // newer unmarked current: the protocol marker may have been deleted after v2
  // prepared that pointer.
  if (!committedProtocol) {
    if (pendingRead.value?.status === "pending") {
      throw new QueueDurableSnapshotIntegrityError(
        `Durable queue revision ${pendingRead.value.revision} is pending commit resolution.`,
        "pending_commit",
      );
    }
    if (currentRead.etag && !current) {
      throw new QueueDurableSnapshotIntegrityError(
        "The legacy durable queue current snapshot is invalid.",
      );
    }
    if (committedManifestRead.etag && !committedManifest) {
      throw new QueueDurableSnapshotIntegrityError(
        "The committed queue snapshot manifest is invalid.",
      );
    }
    const partialManifest = committedManifest
      ? await envelopeForCommittedManifest<T>(committedManifest, token, current)
      : null;
    const partialCommitted = includeCommitHistory
      ? await newestCommittedRevisionEnvelope<T>(token, current)
      : null;
    const partials = [partialManifest, partialCommitted]
      .filter((candidate): candidate is QueueDurableSnapshotEnvelope<T> => Boolean(candidate))
      .sort((left, right) => right.revision - left.revision);
    const partialAuthority = partials[0] ?? null;
    if (partialAuthority && partials.some((candidate) => (
      candidate.revision === partialAuthority.revision
      && candidate.checksum !== partialAuthority.checksum
    ))) {
      throw new QueueDurableSnapshotIntegrityError(
        `Conflicting partial queue snapshot artifacts exist at revision ${partialAuthority.revision}.`,
      );
    }
    if (!current) {
      if (!partialAuthority) return null;
      confirmedRevision = Math.max(confirmedRevision, partialAuthority.revision);
      return partialAuthority.state;
    }
    if (partialAuthority && !envelopeMatches(partialAuthority, current)) {
      throw new QueueDurableSnapshotIntegrityError(
        "Legacy current and committed queue snapshot artifacts do not match.",
      );
    }
    confirmedRevision = Math.max(confirmedRevision, current.revision);
    return current.state;
  }

  if (committedManifestRead.etag && !committedManifest) {
    throw new QueueDurableSnapshotIntegrityError(
      "The committed queue snapshot manifest is invalid.",
    );
  }

  const candidates: QueueDurableSnapshotEnvelope<T>[] = [];
  let currentIsCommitted = false;
  if (committedManifest) {
    candidates.push(await envelopeForCommittedManifest<T>(committedManifest, token, current));
  }
  if (current) {
    const currentMarkerRead = await readCommitMarkerVersioned(
      commitPath(current.revision, current.checksum),
      token,
    );
    if (currentMarkerRead.etag && !currentMarkerRead.value) {
      throw new QueueDurableSnapshotIntegrityError(
        `Committed queue snapshot marker for revision ${current.revision} is invalid.`,
      );
    }
    if (currentMarkerRead.value) {
      if (!markerMatchesEnvelope(currentMarkerRead.value, current)) {
        throw new QueueDurableSnapshotIntegrityError(
          `Committed queue snapshot marker for revision ${current.revision} does not match current.`,
        );
      }
      currentIsCommitted = true;
      candidates.push(current);
    }
  }
  if (includeCommitHistory) {
    const recovered = await newestCommittedRevisionEnvelope<T>(token, current);
    if (recovered) candidates.push(recovered);
  }

  if (candidates.length > 0) {
    candidates.sort((left, right) => right.revision - left.revision);
    const selected = candidates[0];
    const conflicting = candidates.find((candidate) => candidate.revision === selected.revision
      && candidate.checksum !== selected.checksum);
    if (conflicting) {
      throw new QueueDurableSnapshotIntegrityError(
        `Conflicting committed queue snapshots exist at revision ${selected.revision}.`,
      );
    }
    if (current && !currentIsCommitted && (
      current.revision > selected.revision
      || (current.revision === selected.revision && current.checksum !== selected.checksum)
    )) {
      throw new QueueDurableSnapshotIntegrityError(
        `Durable queue current revision ${current.revision} is newer or conflicts without a commit marker.`,
        "pending_commit",
      );
    }
    if (pendingRead.value?.status === "pending") {
      const pending = pendingRead.value;
      const manifestProvesTarget = Boolean(committedManifest
        && committedManifest.revision === pending.revision
        && committedManifest.checksum === pending.checksum
        && selected.revision === pending.revision
        && selected.checksum === pending.checksum);
      const currentMarkerProvesTarget = Boolean(currentIsCommitted
        && current
        && current.revision === pending.revision
        && current.checksum === pending.checksum
        && selected.revision === pending.revision
        && selected.checksum === pending.checksum);
      if (!manifestProvesTarget && !currentMarkerProvesTarget) {
        throw new QueueDurableSnapshotIntegrityError(
          `Durable queue revision ${pending.revision} is pending commit resolution.`,
          "pending_commit",
        );
      }
    }
    if (includeCommitHistory) {
      const selectedMarker = makeCommitMarker(selected);
      await promoteCommittedManifestBestEffort(selectedMarker, selected, token);
    }
    confirmedRevision = Math.max(confirmedRevision, selected.revision);
    return selected.state;
  }

  if (pendingRead.value?.status === "pending") {
    throw new QueueDurableSnapshotIntegrityError(
      `Durable queue revision ${pendingRead.value.revision} is pending commit resolution.`,
      "pending_commit",
    );
  }

  // Under protocol v2, an unmarked current pointer is a prepared/ambiguous
  // write. Falling through to Redis here would advertise an uncommitted show
  // as healthy, so absence of committed authority is itself an integrity stop.
  throw new QueueDurableSnapshotIntegrityError(
    "No committed durable queue snapshot exists under protocol v2.",
    "no_committed_snapshot",
  );
}

/** Constant-cost read used by polling, request handling, and normal mutations. */
export async function readQueueDurableSnapshot<T extends RevisionedQueueState>(): Promise<T | null> {
  return readQueueDurableSnapshotInternal<T>(false);
}

/** Full append-only history scan reserved for explicit recovery/audit flows. */
export async function auditQueueDurableSnapshots<T extends RevisionedQueueState>(): Promise<T | null> {
  return readQueueDurableSnapshotInternal<T>(true);
}

export const QUEUE_DURABLE_SNAPSHOT_PATHS = {
  current: SNAPSHOT_CURRENT_PATH,
  revisionsPrefix: SNAPSHOT_REVISIONS_PREFIX,
  committed: SNAPSHOT_COMMITTED_PATH,
  commitsPrefix: SNAPSHOT_COMMITS_PREFIX,
  protocol: SNAPSHOT_PROTOCOL_PATH,
} as const;
