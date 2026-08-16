import { get, list } from "@vercel/blob";

import {
  canonicalQueueHistoricalEvidenceJson,
  validateQueueHistoricalEvidenceLedger,
  type QueueHistoricalEvidenceLedger,
} from "./queue-historical-evidence-ledger";

export const QUEUE_HISTORICAL_EVIDENCE_CHAIN_PREFIX =
  "barcode-radio-queue-historical-evidence/v1/chain/";
export const QUEUE_HISTORICAL_EVIDENCE_ROOT_PATHNAME =
  `${QUEUE_HISTORICAL_EVIDENCE_CHAIN_PREFIX}root.json`;
export const QUEUE_HISTORICAL_EVIDENCE_IMPORT_PLAN_SCHEMA =
  "barcode_queue_historical_evidence_import_plan_v1" as const;
export const QUEUE_HISTORICAL_EVIDENCE_SUMMARY_SCHEMA =
  "barcode_queue_historical_evidence_chain_summary_v1" as const;
export const QUEUE_HISTORICAL_EVIDENCE_MAX_BLOB_BYTES = 1_048_576;
export const QUEUE_HISTORICAL_EVIDENCE_MAX_REQUEST_BYTES = 1_310_720;
export const QUEUE_HISTORICAL_EVIDENCE_MAX_CHAIN_LENGTH = 256;

const LIST_PAGE_LIMIT = 256;
const MAX_LIST_PAGES = 4;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export type QueueHistoricalEvidenceErrorStatus = 400 | 409 | 413 | 503;

export class QueueHistoricalEvidenceError extends Error {
  readonly code: string;
  readonly status: QueueHistoricalEvidenceErrorStatus;

  constructor(code: string, status: QueueHistoricalEvidenceErrorStatus, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "QueueHistoricalEvidenceError";
    this.code = code;
    this.status = status;
  }
}

interface HistoricalEvidenceListItem {
  pathname: string;
  size?: number;
}

interface HistoricalEvidenceListPage {
  blobs: HistoricalEvidenceListItem[];
  cursor?: string | null;
  hasMore: boolean;
}

interface HistoricalEvidenceGetResult {
  statusCode: number;
  stream: ReadableStream<Uint8Array> | null;
  blob?: {
    size: number;
  };
}

export interface QueueHistoricalEvidenceReadDependencies {
  listBlobs?: (options: {
    prefix: string;
    limit: number;
    cursor?: string;
    token: string;
  }) => Promise<HistoricalEvidenceListPage>;
  getBlob?: (pathname: string, options: {
    access: "private";
    token: string;
    useCache: false;
  }) => Promise<HistoricalEvidenceGetResult | null>;
}

export interface QueueHistoricalEvidenceChainEntry {
  pathname: string;
  ledger: QueueHistoricalEvidenceLedger;
  canonicalJson: string;
}

export interface QueueHistoricalEvidenceChainAudit {
  chainLength: number;
  headBundleDigest: string | null;
  entries: QueueHistoricalEvidenceChainEntry[];
}

export interface QueueHistoricalEvidenceImportRequest {
  ledger: unknown;
  operatorAttestedEvidenceSha256ById: unknown;
}

export interface QueueHistoricalEvidenceImportPlan {
  schema: typeof QUEUE_HISTORICAL_EVIDENCE_IMPORT_PLAN_SCHEMA;
  dryRun: true;
  canApply: boolean;
  alreadyPresent: boolean;
  bundleDigest: string;
  previousBundleDigest: string | null;
  observedHeadBundleDigest: string | null;
  canonicalShowDate: string;
  operatorAttestedHashedSourceCount: number;
  unhashedSourceEvidenceIds: string[];
  requiredConfirmation: string;
}

export interface PreparedQueueHistoricalEvidenceImport {
  plan: QueueHistoricalEvidenceImportPlan;
  ledger: QueueHistoricalEvidenceLedger;
  canonicalJson: string;
  targetPathname: string;
}

export interface QueueHistoricalEvidenceBundleSummary {
  bundleDigest: string;
  previousBundleDigest: string | null;
  canonicalShowDate: string;
  completeness: QueueHistoricalEvidenceLedger["completeness"];
  acceptedRequestCount: number;
  rejectedCooldownRequestCount: number;
  recoveredTrackCount: number;
  candidateCount: number;
  declaredHashedSourceCount: number;
  unhashedSourceCount: number;
  coverage: QueueHistoricalEvidenceLedger["coverage"];
}

export interface QueueHistoricalEvidenceChainSummary {
  schema: typeof QUEUE_HISTORICAL_EVIDENCE_SUMMARY_SCHEMA;
  integrity: "valid";
  chainLength: number;
  headBundleDigest: string | null;
  bundles: QueueHistoricalEvidenceBundleSummary[];
}

function repositoryError(
  code: string,
  message: string,
  cause?: unknown,
): QueueHistoricalEvidenceError {
  return new QueueHistoricalEvidenceError(code, 503, message, cause === undefined ? undefined : { cause });
}

function inputError(code: string, message: string, cause?: unknown): QueueHistoricalEvidenceError {
  return new QueueHistoricalEvidenceError(code, 400, message, cause === undefined ? undefined : { cause });
}

function oversizedError(code: string, message: string): QueueHistoricalEvidenceError {
  return new QueueHistoricalEvidenceError(code, 413, message);
}

export function requireQueueHistoricalEvidenceBlobToken(): string {
  const token = process.env.QUEUE_HISTORICAL_EVIDENCE_BLOB_READ_WRITE_TOKEN?.trim();
  if (!token) {
    throw repositoryError(
      "historical_evidence_storage_not_configured",
      "The dedicated queue historical evidence Blob store is not configured.",
    );
  }
  return token;
}

function defaultListBlobs(options: {
  prefix: string;
  limit: number;
  cursor?: string;
  token: string;
}): Promise<HistoricalEvidenceListPage> {
  return list(options) as Promise<HistoricalEvidenceListPage>;
}

async function defaultGetBlob(pathname: string, options: {
  access: "private";
  token: string;
  useCache: false;
}): Promise<HistoricalEvidenceGetResult | null> {
  return get(pathname, options) as Promise<HistoricalEvidenceGetResult | null>;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function canonicalBytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

async function readBoundedStream(
  stream: ReadableStream<Uint8Array>,
  pathname: string,
): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      if (!(result.value instanceof Uint8Array)) {
        throw repositoryError(
          "historical_evidence_blob_unreadable",
          `Historical evidence object ${pathname} returned a non-byte stream.`,
        );
      }
      length += result.value.byteLength;
      if (length > QUEUE_HISTORICAL_EVIDENCE_MAX_BLOB_BYTES) {
        throw repositoryError(
          "historical_evidence_blob_too_large",
          `Historical evidence object ${pathname} exceeds the repository byte limit.`,
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
  return bytes;
}

function expectedPredecessorForPathname(pathname: string): string | null {
  if (pathname === QUEUE_HISTORICAL_EVIDENCE_ROOT_PATHNAME) return null;
  if (!pathname.startsWith(QUEUE_HISTORICAL_EVIDENCE_CHAIN_PREFIX)) {
    throw repositoryError(
      "historical_evidence_unexpected_key",
      "The historical evidence listing returned an object outside its requested prefix.",
    );
  }
  const filename = pathname.slice(QUEUE_HISTORICAL_EVIDENCE_CHAIN_PREFIX.length);
  const match = /^([a-f0-9]{64})\.json$/.exec(filename);
  if (!match) {
    throw repositoryError(
      "historical_evidence_unexpected_key",
      `Unexpected object in the historical evidence chain namespace: ${pathname}`,
    );
  }
  return match[1];
}

export function queueHistoricalEvidencePathnameForPredecessor(
  previousBundleDigest: string | null,
): string {
  if (previousBundleDigest === null) return QUEUE_HISTORICAL_EVIDENCE_ROOT_PATHNAME;
  if (!SHA256_PATTERN.test(previousBundleDigest)) {
    throw inputError(
      "historical_evidence_invalid_predecessor",
      "The historical evidence predecessor must be a lowercase SHA-256 digest or null.",
    );
  }
  return `${QUEUE_HISTORICAL_EVIDENCE_CHAIN_PREFIX}${previousBundleDigest}.json`;
}

async function listAllChainObjects(
  dependencies: QueueHistoricalEvidenceReadDependencies,
): Promise<HistoricalEvidenceListItem[]> {
  const token = requireQueueHistoricalEvidenceBlobToken();
  const listBlobs = dependencies.listBlobs ?? defaultListBlobs;
  const objects: HistoricalEvidenceListItem[] = [];
  const pathnames = new Set<string>();
  const cursors = new Set<string>();
  let cursor: string | undefined;

  for (let pageIndex = 0; pageIndex < MAX_LIST_PAGES; pageIndex += 1) {
    let page: HistoricalEvidenceListPage;
    try {
      page = await listBlobs({
        prefix: QUEUE_HISTORICAL_EVIDENCE_CHAIN_PREFIX,
        limit: LIST_PAGE_LIMIT,
        cursor,
        token,
      });
    } catch (error) {
      throw repositoryError(
        "historical_evidence_storage_unavailable",
        "The historical evidence Blob listing is unavailable.",
        error,
      );
    }

    if (!page || !Array.isArray(page.blobs) || typeof page.hasMore !== "boolean") {
      throw repositoryError(
        "historical_evidence_listing_incomplete",
        "The historical evidence Blob listing returned an invalid page.",
      );
    }
    if (page.blobs.length > LIST_PAGE_LIMIT) {
      throw repositoryError(
        "historical_evidence_listing_incomplete",
        "The historical evidence Blob listing exceeded the requested page limit.",
      );
    }

    for (const item of page.blobs) {
      if (!item || typeof item.pathname !== "string") {
        throw repositoryError(
          "historical_evidence_listing_incomplete",
          "The historical evidence Blob listing returned an invalid object.",
        );
      }
      expectedPredecessorForPathname(item.pathname);
      if (pathnames.has(item.pathname)) {
        throw repositoryError(
          "historical_evidence_duplicate_key",
          `The historical evidence Blob listing repeated ${item.pathname}.`,
        );
      }
      if (item.size !== undefined && (
        !Number.isSafeInteger(item.size)
        || item.size < 0
        || item.size > QUEUE_HISTORICAL_EVIDENCE_MAX_BLOB_BYTES
      )) {
        throw repositoryError(
          "historical_evidence_blob_too_large",
          `Historical evidence object ${item.pathname} has an invalid or oversized length.`,
        );
      }
      pathnames.add(item.pathname);
      objects.push(item);
      if (objects.length > QUEUE_HISTORICAL_EVIDENCE_MAX_CHAIN_LENGTH) {
        throw repositoryError(
          "historical_evidence_chain_too_long",
          "The historical evidence chain exceeds its configured maximum length.",
        );
      }
    }

    if (!page.hasMore) return objects;
    if (page.blobs.length === 0 || typeof page.cursor !== "string" || !page.cursor || cursors.has(page.cursor)) {
      throw repositoryError(
        "historical_evidence_listing_incomplete",
        "The historical evidence Blob listing could not complete pagination safely.",
      );
    }
    cursors.add(page.cursor);
    cursor = page.cursor;
  }

  throw repositoryError(
    "historical_evidence_listing_incomplete",
    "The historical evidence Blob listing did not terminate within the pagination bound.",
  );
}

export async function readQueueHistoricalEvidenceChainEntry(
  pathname: string,
  dependencies: QueueHistoricalEvidenceReadDependencies = {},
): Promise<QueueHistoricalEvidenceChainEntry | null> {
  const expectedPredecessor = expectedPredecessorForPathname(pathname);
  const token = requireQueueHistoricalEvidenceBlobToken();
  const getBlob = dependencies.getBlob ?? defaultGetBlob;
  let result: HistoricalEvidenceGetResult | null;
  try {
    result = await getBlob(pathname, { access: "private", token, useCache: false });
  } catch (error) {
    throw repositoryError(
      "historical_evidence_storage_unavailable",
      `Historical evidence object ${pathname} could not be read.`,
      error,
    );
  }
  if (result === null) return null;
  if (result.statusCode !== 200 || !result.stream) {
    throw repositoryError(
      "historical_evidence_blob_unreadable",
      `Historical evidence object ${pathname} did not return a complete body.`,
    );
  }
  if (!result.blob || (
    !Number.isSafeInteger(result.blob.size)
    || result.blob.size < 0
    || result.blob.size > QUEUE_HISTORICAL_EVIDENCE_MAX_BLOB_BYTES
  )) {
    throw repositoryError(
      "historical_evidence_blob_too_large",
      `Historical evidence object ${pathname} has invalid or oversized SDK metadata.`,
    );
  }

  const bytes = await readBoundedStream(result.stream, pathname);
  if (bytes.byteLength !== result.blob.size) {
    throw repositoryError(
      "historical_evidence_blob_unreadable",
      `Historical evidence object ${pathname} returned an incomplete body.`,
    );
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    throw repositoryError(
      "historical_evidence_blob_not_utf8",
      `Historical evidence object ${pathname} is not valid UTF-8.`,
      error,
    );
  }

  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw repositoryError(
      "historical_evidence_blob_not_json",
      `Historical evidence object ${pathname} is not valid JSON.`,
      error,
    );
  }

  let ledger: QueueHistoricalEvidenceLedger;
  try {
    ledger = validateQueueHistoricalEvidenceLedger(value);
  } catch (error) {
    throw repositoryError(
      "historical_evidence_ledger_invalid",
      `Historical evidence object ${pathname} failed ledger validation.`,
      error,
    );
  }
  const canonicalJson = canonicalQueueHistoricalEvidenceJson(ledger);
  if (!bytesEqual(bytes, canonicalBytes(canonicalJson))) {
    throw repositoryError(
      "historical_evidence_noncanonical_bytes",
      `Historical evidence object ${pathname} is not encoded as the exact canonical ledger JSON.`,
    );
  }
  if (ledger.previousBundleDigest !== expectedPredecessor) {
    throw repositoryError(
      "historical_evidence_predecessor_path_mismatch",
      `Historical evidence object ${pathname} does not name its body predecessor.`,
    );
  }
  return { pathname, ledger, canonicalJson };
}

export async function auditQueueHistoricalEvidenceChain(
  dependencies: QueueHistoricalEvidenceReadDependencies = {},
): Promise<QueueHistoricalEvidenceChainAudit> {
  const objects = await listAllChainObjects(dependencies);
  const entries: QueueHistoricalEvidenceChainEntry[] = [];
  for (const object of objects) {
    const entry = await readQueueHistoricalEvidenceChainEntry(object.pathname, dependencies);
    if (!entry) {
      throw repositoryError(
        "historical_evidence_listing_gap",
        `Historical evidence object ${object.pathname} disappeared after it was listed.`,
      );
    }
    entries.push(entry);
  }

  const digests = new Set<string>();
  const predecessorKeys = new Set<string>();
  const entriesByPathname = new Map<string, QueueHistoricalEvidenceChainEntry>();
  for (const entry of entries) {
    if (digests.has(entry.ledger.bundleDigest)) {
      throw repositoryError(
        "historical_evidence_repeated_digest",
        `The historical evidence chain repeats bundle digest ${entry.ledger.bundleDigest}.`,
      );
    }
    digests.add(entry.ledger.bundleDigest);

    const predecessorKey = entry.ledger.previousBundleDigest ?? "ROOT";
    if (predecessorKeys.has(predecessorKey)) {
      throw repositoryError(
        "historical_evidence_chain_fork",
        `The historical evidence chain contains multiple successors after ${predecessorKey}.`,
      );
    }
    predecessorKeys.add(predecessorKey);
    entriesByPathname.set(entry.pathname, entry);
  }

  const orderedEntries: QueueHistoricalEvidenceChainEntry[] = [];
  let nextPathname = QUEUE_HISTORICAL_EVIDENCE_ROOT_PATHNAME;
  while (true) {
    const entry = entriesByPathname.get(nextPathname);
    if (!entry) break;
    orderedEntries.push(entry);
    if (orderedEntries.length > QUEUE_HISTORICAL_EVIDENCE_MAX_CHAIN_LENGTH) {
      throw repositoryError(
        "historical_evidence_chain_too_long",
        "The historical evidence chain exceeds its configured maximum length.",
      );
    }
    nextPathname = queueHistoricalEvidencePathnameForPredecessor(entry.ledger.bundleDigest);
  }

  if (orderedEntries.length !== entries.length) {
    throw repositoryError(
      "historical_evidence_chain_gap",
      "The historical evidence namespace contains a gap or an unreachable object.",
    );
  }

  return {
    chainLength: orderedEntries.length,
    headBundleDigest: orderedEntries.at(-1)?.ledger.bundleDigest ?? null,
    entries: orderedEntries,
  };
}

function parseDigestMap(
  value: unknown,
  ledger: QueueHistoricalEvidenceLedger,
): Record<string, string> {
  if (!isPlainRecord(value)) {
    throw inputError(
      "historical_evidence_digest_map_invalid",
      "operatorAttestedEvidenceSha256ById must be an object.",
    );
  }

  const expectedIds = ledger.sources
    .filter((source) => source.sha256 !== null)
    .map((source) => source.evidenceId)
    .sort();
  const actualIds = Object.keys(value).sort();
  if (
    expectedIds.length !== actualIds.length
    || expectedIds.some((evidenceId, index) => evidenceId !== actualIds[index])
  ) {
    throw inputError(
      "historical_evidence_digest_map_mismatch",
      "The digest map must contain exactly the identifiers for sources with declared SHA-256 values.",
    );
  }

  const parsed: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const evidenceId of actualIds) {
    const digest = value[evidenceId];
    if (typeof digest !== "string" || !SHA256_PATTERN.test(digest)) {
      throw inputError(
        "historical_evidence_digest_map_invalid",
        "Every operator-attested evidence digest must be a lowercase SHA-256 value.",
      );
    }
    parsed[evidenceId] = digest;
  }
  return parsed;
}

function validateImportLedger(input: QueueHistoricalEvidenceImportRequest): {
  ledger: QueueHistoricalEvidenceLedger;
  canonicalJson: string;
  digestMap: Record<string, string>;
} {
  let ledger: QueueHistoricalEvidenceLedger;
  try {
    ledger = validateQueueHistoricalEvidenceLedger(input.ledger);
  } catch (error) {
    throw inputError(
      "historical_evidence_ledger_invalid",
      "The submitted historical evidence ledger is invalid.",
      error,
    );
  }
  const digestMap = parseDigestMap(input.operatorAttestedEvidenceSha256ById, ledger);
  try {
    ledger = validateQueueHistoricalEvidenceLedger(ledger, {
      actualEvidenceSha256ById: digestMap,
    });
  } catch (error) {
    throw inputError(
      "historical_evidence_digest_attestation_mismatch",
      "One or more operator-attested evidence digests do not match the ledger.",
      error,
    );
  }
  const canonicalJson = canonicalQueueHistoricalEvidenceJson(ledger);
  if (canonicalBytes(canonicalJson).byteLength > QUEUE_HISTORICAL_EVIDENCE_MAX_BLOB_BYTES) {
    throw oversizedError(
      "historical_evidence_ledger_too_large",
      "The canonical historical evidence ledger exceeds the repository byte limit.",
    );
  }
  return { ledger, canonicalJson, digestMap };
}

export function queueHistoricalEvidenceRequiredConfirmation(
  ledger: Pick<QueueHistoricalEvidenceLedger, "canonicalShowDate" | "bundleDigest" | "previousBundleDigest">,
): string {
  return `APPEND QUEUE HISTORICAL EVIDENCE ${ledger.canonicalShowDate} ${ledger.bundleDigest} AFTER ${ledger.previousBundleDigest ?? "ROOT"}`;
}

export async function prepareQueueHistoricalEvidenceImport(
  input: QueueHistoricalEvidenceImportRequest,
  dependencies: QueueHistoricalEvidenceReadDependencies = {},
): Promise<PreparedQueueHistoricalEvidenceImport> {
  const validated = validateImportLedger(input);
  const audit = await auditQueueHistoricalEvidenceChain(dependencies);
  const existingEntry = audit.entries.find(
    (entry) => entry.ledger.bundleDigest === validated.ledger.bundleDigest,
  );
  if (existingEntry && existingEntry.canonicalJson !== validated.canonicalJson) {
    throw repositoryError(
      "historical_evidence_digest_collision",
      "An existing historical evidence bundle has the requested digest but different canonical bytes.",
    );
  }
  const alreadyPresent = Boolean(existingEntry);
  const canApply = alreadyPresent
    || validated.ledger.previousBundleDigest === audit.headBundleDigest;
  const unhashedSourceEvidenceIds = validated.ledger.sources
    .filter((source) => source.sha256 === null)
    .map((source) => source.evidenceId)
    .sort();
  const plan: QueueHistoricalEvidenceImportPlan = {
    schema: QUEUE_HISTORICAL_EVIDENCE_IMPORT_PLAN_SCHEMA,
    dryRun: true,
    canApply,
    alreadyPresent,
    bundleDigest: validated.ledger.bundleDigest,
    previousBundleDigest: validated.ledger.previousBundleDigest,
    observedHeadBundleDigest: audit.headBundleDigest,
    canonicalShowDate: validated.ledger.canonicalShowDate,
    operatorAttestedHashedSourceCount: Object.keys(validated.digestMap).length,
    unhashedSourceEvidenceIds,
    requiredConfirmation: queueHistoricalEvidenceRequiredConfirmation(validated.ledger),
  };
  return {
    plan,
    ledger: validated.ledger,
    canonicalJson: validated.canonicalJson,
    targetPathname: queueHistoricalEvidencePathnameForPredecessor(
      validated.ledger.previousBundleDigest,
    ),
  };
}

export async function buildQueueHistoricalEvidenceImportPlan(
  input: QueueHistoricalEvidenceImportRequest,
  dependencies: QueueHistoricalEvidenceReadDependencies = {},
): Promise<QueueHistoricalEvidenceImportPlan> {
  return (await prepareQueueHistoricalEvidenceImport(input, dependencies)).plan;
}

export function summarizeQueueHistoricalEvidenceChain(
  audit: QueueHistoricalEvidenceChainAudit,
): QueueHistoricalEvidenceChainSummary {
  return {
    schema: QUEUE_HISTORICAL_EVIDENCE_SUMMARY_SCHEMA,
    integrity: "valid",
    chainLength: audit.chainLength,
    headBundleDigest: audit.headBundleDigest,
    bundles: audit.entries.map(({ ledger }) => ({
      bundleDigest: ledger.bundleDigest,
      previousBundleDigest: ledger.previousBundleDigest,
      canonicalShowDate: ledger.canonicalShowDate,
      completeness: ledger.completeness,
      acceptedRequestCount: ledger.acceptance.acceptedRequestCount,
      rejectedCooldownRequestCount: ledger.acceptance.rejectedCooldownRequestCount,
      recoveredTrackCount: ledger.tracks.length,
      candidateCount: ledger.candidates.length,
      declaredHashedSourceCount: ledger.sources.filter((source) => source.sha256 !== null).length,
      unhashedSourceCount: ledger.sources.filter((source) => source.sha256 === null).length,
      coverage: { ...ledger.coverage },
    })),
  };
}

export async function getQueueHistoricalEvidenceChainSummary(
  dependencies: QueueHistoricalEvidenceReadDependencies = {},
): Promise<QueueHistoricalEvidenceChainSummary> {
  return summarizeQueueHistoricalEvidenceChain(
    await auditQueueHistoricalEvidenceChain(dependencies),
  );
}
