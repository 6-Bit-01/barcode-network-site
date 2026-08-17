import { createHash } from "node:crypto";

import type { QueueLane, QueueSourceType } from "./queue-types";

export const QUEUE_HISTORICAL_EVIDENCE_SCHEMA = "barcode_queue_historical_evidence_v1" as const;

export type QueueRecoveryEvidenceKind =
  | "owner_export_digest"
  | "sanitized_owner_export"
  | "vercel_runtime_logs"
  | "vercel_log_aggregate"
  | "vercel_blob_inventory"
  | "stripe_record"
  | "playback_event"
  | "vod_observation"
  | "owner_attestation";

export interface QueueRecoverySource {
  evidenceId: string;
  kind: QueueRecoveryEvidenceKind;
  sha256: string | null;
  recordLocator: string;
  privacy: "private" | "sanitized";
  observedAt: string | null;
  canonicalShowDate: string;
  coverage: "not_applicable" | "point_observation" | "partial_show" | "full_show";
}

export interface QueueRecoveryAcceptanceEvent {
  requestId: string;
  occurredAt: string;
  httpStatus: 201 | 429;
  result: "accepted" | "rejected_cooldown";
  evidenceId: string;
}

export interface QueueRecoveryAcceptance {
  mode: "row_level" | "aggregate";
  acceptedRequestCount: number;
  rejectedCooldownRequestCount: number;
  acceptedEvidenceIds: string[];
  rejectedCooldownEvidenceIds: string[];
  events: QueueRecoveryAcceptanceEvent[];
}

export type QueueRecoveryAdministrativeOutcome = "marked_played" | "removed" | "still_active" | "unknown";
export type QueueRecoveryAirplayState = "played_confirmed" | "not_played_confirmed" | "unknown";
export type QueueRecoveryCompletionExtent = "full_confirmed" | "partial_confirmed" | "unknown";

export interface QueueRecoveredTrack {
  recoveryTrackId: string;
  originalTrackId: string | null;
  acceptanceState: "accepted_confirmed" | "candidate_only";
  identityState: "verified" | "partial";
  submittedArtistName: string | null;
  publicArtistCredit: string | null;
  title: string | null;
  tiktokHandle: string | null;
  submittedAt: string | null;
  sourceType: QueueSourceType | "unknown";
  exactSourceUrl: string | null;
  privateBlobPathname: string | null;
  sourceHost: string | null;
  uploadExtension: string | null;
  sourceLane: QueueLane | "unknown";
  administrativeOutcome: QueueRecoveryAdministrativeOutcome;
  airplayState: QueueRecoveryAirplayState;
  completionExtent: QueueRecoveryCompletionExtent;
  evidenceIds: string[];
  fieldEvidence: Record<string, string[]>;
}

export interface QueueRecoveryCandidate {
  candidateId: string;
  kind: "blob_upload" | "link_reference" | "stripe_track";
  observedAt: string | null;
  privateBlobPathname: string | null;
  candidateLabel: string | null;
  matchState: "unmatched" | "confirmed";
  matchedRecoveryTrackId: string | null;
  evidenceIds: string[];
}

export interface QueueHistoricalEvidenceCoverage {
  acceptedConfirmed: number;
  rejectedCooldownRequests: number;
  identitiesResolved: number;
  identitiesUnresolved: number;
  markedPlayed: number;
  removed: number;
  stillActive: number;
  administrativeOutcomeUnknown: number;
  airplayPlayedConfirmed: number;
  airplayNotPlayedConfirmed: number;
  airplayUnknown: number;
  completionFullConfirmed: number;
  completionPartialConfirmed: number;
  completionUnknown: number;
}

export interface QueueHistoricalEvidenceLedger {
  schema: typeof QUEUE_HISTORICAL_EVIDENCE_SCHEMA;
  bundleDigest: string;
  previousBundleDigest: string | null;
  canonicalShowDate: string;
  sourceSessionId: string | null;
  completeness: "complete" | "partial";
  visibility: "admin_only";
  acceptance: QueueRecoveryAcceptance;
  sources: QueueRecoverySource[];
  tracks: QueueRecoveredTrack[];
  candidates: QueueRecoveryCandidate[];
  coverage: QueueHistoricalEvidenceCoverage;
}

export type QueueHistoricalEvidenceLedgerDraft = Omit<QueueHistoricalEvidenceLedger, "bundleDigest"> & {
  bundleDigest?: string;
};

export interface QueueHistoricalEvidenceValidationOptions {
  /**
   * Optional hashes independently computed from the evidence artifacts. When
   * supplied, every hashed source must have an exact matching entry. This is
   * deliberately opt-in because raw private evidence is not embedded here.
   */
  actualEvidenceSha256ById?: Readonly<Record<string, string>>;
}

const SOURCE_KINDS = new Set<QueueRecoveryEvidenceKind>([
  "owner_export_digest",
  "sanitized_owner_export",
  "vercel_runtime_logs",
  "vercel_log_aggregate",
  "vercel_blob_inventory",
  "stripe_record",
  "playback_event",
  "vod_observation",
  "owner_attestation",
]);
const SOURCE_TYPES = new Set<QueueSourceType | "unknown">([
  "upload",
  "link",
  "youtube",
  "soundcloud",
  "spotify",
  "tiktok",
  "other",
  "unknown",
]);
const SOURCE_LANES = new Set<QueueLane | "unknown">(["priority", "wheel", "regular", "unknown"]);
const SOURCE_COVERAGE = new Set<QueueRecoverySource["coverage"]>([
  "not_applicable",
  "point_observation",
  "partial_show",
  "full_show",
]);
const OBSERVATION_COVERAGE = new Set<QueueRecoverySource["coverage"]>([
  "point_observation",
  "partial_show",
  "full_show",
]);
const ACCEPTANCE_EVIDENCE_KINDS = new Set<QueueRecoveryEvidenceKind>([
  "owner_export_digest",
  "sanitized_owner_export",
  "vercel_runtime_logs",
  "vercel_log_aggregate",
]);
const REJECTED_COOLDOWN_EVIDENCE_KINDS = new Set<QueueRecoveryEvidenceKind>([
  "owner_export_digest",
  "sanitized_owner_export",
  "vercel_runtime_logs",
  "vercel_log_aggregate",
]);
const TRACK_ACCEPTANCE_EVIDENCE_KINDS = new Set<QueueRecoveryEvidenceKind>([
  "sanitized_owner_export",
  "vercel_runtime_logs",
  "stripe_record",
]);
const IDENTITY_EVIDENCE_KINDS = new Set<QueueRecoveryEvidenceKind>([
  "sanitized_owner_export",
  "stripe_record",
  "owner_attestation",
  "vod_observation",
]);
const ADMINISTRATIVE_OUTCOME_EVIDENCE_KINDS = new Set<QueueRecoveryEvidenceKind>([
  "sanitized_owner_export",
  "owner_attestation",
]);
const DIRECT_PLAYED_EVIDENCE_KINDS = new Set<QueueRecoveryEvidenceKind>([
  "playback_event",
  "vod_observation",
]);
const DIRECT_NOT_PLAYED_EVIDENCE_KINDS = new Set<QueueRecoveryEvidenceKind>([
  "vod_observation",
]);
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const SHOW_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const LEDGER_KEYS = [
  "schema",
  "bundleDigest",
  "previousBundleDigest",
  "canonicalShowDate",
  "sourceSessionId",
  "completeness",
  "visibility",
  "acceptance",
  "sources",
  "tracks",
  "candidates",
  "coverage",
] as const;

function fail(path: string, message: string): never {
  throw new Error(`Invalid queue historical evidence ledger at ${path}: ${message}`);
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(path, "must be an object");
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[], path: string): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) fail(`${path}.${key}`, "is not part of the v1 schema");
  }
  for (const key of allowed) {
    if (!Object.hasOwn(value, key)) fail(`${path}.${key}`, "is required");
  }
}

function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) fail(path, "must be an array");
  return value;
}

function string(value: unknown, path: string, options: { nullable?: boolean; identifier?: boolean } = {}): string | null {
  if (value === null && options.nullable) return null;
  if (typeof value !== "string") fail(path, options.nullable ? "must be a string or null" : "must be a string");
  if (!value || value !== value.trim()) fail(path, "must be non-empty and have no surrounding whitespace");
  if (options.identifier && !IDENTIFIER_PATTERN.test(value)) fail(path, "must be a bounded portable identifier");
  return value;
}

function nullableString(value: unknown, path: string): string | null {
  return string(value, path, { nullable: true });
}

function identifier(value: unknown, path: string): string {
  return string(value, path, { identifier: true }) as string;
}

function nullableIdentifier(value: unknown, path: string): string | null {
  if (value === null) return null;
  return identifier(value, path);
}

function enumValue<T extends string>(value: unknown, allowed: ReadonlySet<T>, path: string): T {
  if (typeof value !== "string" || !allowed.has(value as T)) fail(path, `must be one of: ${[...allowed].join(", ")}`);
  return value as T;
}

function count(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) fail(path, "must be a non-negative safe integer");
  return value;
}

function timestamp(value: unknown, path: string, nullable = false): string | null {
  if (value === null && nullable) return null;
  if (typeof value !== "string" || !value) fail(path, nullable ? "must be an ISO timestamp or null" : "must be an ISO timestamp");
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) fail(path, "must be a canonical UTC ISO timestamp");
  return value;
}

function sha256(value: unknown, path: string, nullable = false): string | null {
  if (value === null && nullable) return null;
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) fail(path, nullable ? "must be a lowercase SHA-256 digest or null" : "must be a lowercase SHA-256 digest");
  return value;
}

function showDate(value: unknown, path: string): string {
  if (typeof value !== "string" || !SHOW_DATE_PATTERN.test(value)) fail(path, "must be YYYY-MM-DD");
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) fail(path, "must be a real calendar date");
  return value;
}

function unique(values: readonly string[], path: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) fail(path, `contains duplicate identifier ${JSON.stringify(value)}`);
    seen.add(value);
  }
}

function parseSource(value: unknown, index: number): QueueRecoverySource {
  const path = `sources[${index}]`;
  const source = record(value, path);
  exactKeys(source, ["evidenceId", "kind", "sha256", "recordLocator", "privacy", "observedAt", "canonicalShowDate", "coverage"], path);
  const parsed: QueueRecoverySource = {
    evidenceId: identifier(source.evidenceId, `${path}.evidenceId`),
    kind: enumValue(source.kind, SOURCE_KINDS, `${path}.kind`),
    sha256: sha256(source.sha256, `${path}.sha256`, true),
    recordLocator: string(source.recordLocator, `${path}.recordLocator`) as string,
    privacy: enumValue(source.privacy, new Set(["private", "sanitized"] as const), `${path}.privacy`),
    observedAt: timestamp(source.observedAt, `${path}.observedAt`, true),
    canonicalShowDate: showDate(source.canonicalShowDate, `${path}.canonicalShowDate`),
    coverage: enumValue(source.coverage, SOURCE_COVERAGE, `${path}.coverage`),
  };
  if (parsed.kind === "vod_observation" && !OBSERVATION_COVERAGE.has(parsed.coverage)) {
    fail(`${path}.coverage`, "VOD observations require point_observation, partial_show, or full_show coverage");
  }
  if (parsed.kind !== "vod_observation" && parsed.coverage !== "not_applicable") {
    fail(`${path}.coverage`, "must be not_applicable for non-VOD evidence");
  }
  if (parsed.kind === "owner_export_digest" && parsed.sha256 === null) {
    fail(`${path}.sha256`, "owner_export_digest requires a non-null SHA-256 digest");
  }
  return parsed;
}

function parseAcceptance(value: unknown): QueueRecoveryAcceptance {
  const path = "acceptance";
  const acceptance = record(value, path);
  exactKeys(acceptance, [
    "mode",
    "acceptedRequestCount",
    "rejectedCooldownRequestCount",
    "acceptedEvidenceIds",
    "rejectedCooldownEvidenceIds",
    "events",
  ], path);
  const events = array(acceptance.events, `${path}.events`).map((item, index): QueueRecoveryAcceptanceEvent => {
    const eventPath = `${path}.events[${index}]`;
    const event = record(item, eventPath);
    exactKeys(event, ["requestId", "occurredAt", "httpStatus", "result", "evidenceId"], eventPath);
    const httpStatus = event.httpStatus;
    if (httpStatus !== 201 && httpStatus !== 429) fail(`${eventPath}.httpStatus`, "must be 201 or 429");
    const result = enumValue(event.result, new Set(["accepted", "rejected_cooldown"] as const), `${eventPath}.result`);
    if ((httpStatus === 201 && result !== "accepted") || (httpStatus === 429 && result !== "rejected_cooldown")) {
      fail(eventPath, `HTTP ${httpStatus} is inconsistent with result ${JSON.stringify(result)}`);
    }
    return {
      requestId: identifier(event.requestId, `${eventPath}.requestId`),
      occurredAt: timestamp(event.occurredAt, `${eventPath}.occurredAt`) as string,
      httpStatus,
      result,
      evidenceId: identifier(event.evidenceId, `${eventPath}.evidenceId`),
    };
  });
  unique(events.map((event) => event.requestId), `${path}.events.requestId`);

  const mode = enumValue(acceptance.mode, new Set(["row_level", "aggregate"] as const), `${path}.mode`);
  const parsed: QueueRecoveryAcceptance = {
    mode,
    acceptedRequestCount: count(acceptance.acceptedRequestCount, `${path}.acceptedRequestCount`),
    rejectedCooldownRequestCount: count(acceptance.rejectedCooldownRequestCount, `${path}.rejectedCooldownRequestCount`),
    acceptedEvidenceIds: parseEvidenceIds(acceptance.acceptedEvidenceIds, `${path}.acceptedEvidenceIds`),
    rejectedCooldownEvidenceIds: parseEvidenceIds(acceptance.rejectedCooldownEvidenceIds, `${path}.rejectedCooldownEvidenceIds`),
    events,
  };
  if (parsed.acceptedRequestCount > 0 && parsed.acceptedEvidenceIds.length === 0) {
    fail(`${path}.acceptedEvidenceIds`, "must be nonempty when acceptedRequestCount is nonzero");
  }
  if (parsed.rejectedCooldownRequestCount > 0 && parsed.rejectedCooldownEvidenceIds.length === 0) {
    fail(`${path}.rejectedCooldownEvidenceIds`, "must be nonempty when rejectedCooldownRequestCount is nonzero");
  }
  if (mode === "row_level") {
    events.forEach((event, index) => {
      const matchingEvidenceIds = event.result === "accepted"
        ? parsed.acceptedEvidenceIds
        : parsed.rejectedCooldownEvidenceIds;
      if (!matchingEvidenceIds.includes(event.evidenceId)) {
        fail(
          `${path}.events[${index}].evidenceId`,
          `must also appear in acceptance.${event.result === "accepted" ? "acceptedEvidenceIds" : "rejectedCooldownEvidenceIds"}`,
        );
      }
    });
  }
  const acceptedEvents = events.filter((event) => event.result === "accepted").length;
  const rejectedEvents = events.filter((event) => event.result === "rejected_cooldown").length;
  if (mode === "row_level" && events.length === 0) fail(`${path}.events`, "row_level accounting requires events");
  if (mode === "aggregate" && events.length > 0) fail(`${path}.events`, "aggregate accounting must not contain row-level events");
  if (mode === "row_level" || events.length > 0) {
    if (acceptedEvents !== parsed.acceptedRequestCount) fail(`${path}.acceptedRequestCount`, `claims ${parsed.acceptedRequestCount}, but events prove ${acceptedEvents}`);
    if (rejectedEvents !== parsed.rejectedCooldownRequestCount) fail(`${path}.rejectedCooldownRequestCount`, `claims ${parsed.rejectedCooldownRequestCount}, but events prove ${rejectedEvents}`);
  }
  return parsed;
}

function parseEvidenceIds(value: unknown, path: string): string[] {
  const values = array(value, path).map((item, index) => identifier(item, `${path}[${index}]`));
  unique(values, path);
  return values;
}

function parseFieldEvidence(value: unknown, path: string): Record<string, string[]> {
  const fields = record(value, path);
  const parsed: Record<string, string[]> = {};
  for (const key of Object.keys(fields).sort()) {
    if (!IDENTIFIER_PATTERN.test(key)) fail(`${path}.${key}`, "field name must be a bounded portable identifier");
    parsed[key] = parseEvidenceIds(fields[key], `${path}.${key}`);
    if (parsed[key].length === 0) fail(`${path}.${key}`, "must contain at least one evidence reference");
  }
  return parsed;
}

function parseTrack(value: unknown, index: number): QueueRecoveredTrack {
  const path = `tracks[${index}]`;
  const track = record(value, path);
  exactKeys(track, [
    "recoveryTrackId",
    "originalTrackId",
    "acceptanceState",
    "identityState",
    "submittedArtistName",
    "publicArtistCredit",
    "title",
    "tiktokHandle",
    "submittedAt",
    "sourceType",
    "exactSourceUrl",
    "privateBlobPathname",
    "sourceHost",
    "uploadExtension",
    "sourceLane",
    "administrativeOutcome",
    "airplayState",
    "completionExtent",
    "evidenceIds",
    "fieldEvidence",
  ], path);
  const parsed: QueueRecoveredTrack = {
    recoveryTrackId: identifier(track.recoveryTrackId, `${path}.recoveryTrackId`),
    originalTrackId: nullableIdentifier(track.originalTrackId, `${path}.originalTrackId`),
    acceptanceState: enumValue(track.acceptanceState, new Set(["accepted_confirmed", "candidate_only"] as const), `${path}.acceptanceState`),
    identityState: enumValue(track.identityState, new Set(["verified", "partial"] as const), `${path}.identityState`),
    submittedArtistName: nullableString(track.submittedArtistName, `${path}.submittedArtistName`),
    publicArtistCredit: nullableString(track.publicArtistCredit, `${path}.publicArtistCredit`),
    title: nullableString(track.title, `${path}.title`),
    tiktokHandle: nullableString(track.tiktokHandle, `${path}.tiktokHandle`),
    submittedAt: timestamp(track.submittedAt, `${path}.submittedAt`, true),
    sourceType: enumValue(track.sourceType, SOURCE_TYPES, `${path}.sourceType`),
    exactSourceUrl: nullableString(track.exactSourceUrl, `${path}.exactSourceUrl`),
    privateBlobPathname: nullableString(track.privateBlobPathname, `${path}.privateBlobPathname`),
    sourceHost: nullableString(track.sourceHost, `${path}.sourceHost`),
    uploadExtension: nullableString(track.uploadExtension, `${path}.uploadExtension`),
    sourceLane: enumValue(track.sourceLane, SOURCE_LANES, `${path}.sourceLane`),
    administrativeOutcome: enumValue(track.administrativeOutcome, new Set(["marked_played", "removed", "still_active", "unknown"] as const), `${path}.administrativeOutcome`),
    airplayState: enumValue(track.airplayState, new Set(["played_confirmed", "not_played_confirmed", "unknown"] as const), `${path}.airplayState`),
    completionExtent: enumValue(track.completionExtent, new Set(["full_confirmed", "partial_confirmed", "unknown"] as const), `${path}.completionExtent`),
    evidenceIds: parseEvidenceIds(track.evidenceIds, `${path}.evidenceIds`),
    fieldEvidence: parseFieldEvidence(track.fieldEvidence, `${path}.fieldEvidence`),
  };
  if (parsed.evidenceIds.length === 0) fail(`${path}.evidenceIds`, "must contain at least one evidence reference");
  if (parsed.identityState === "verified" && (!parsed.submittedArtistName || !parsed.title)) {
    fail(`${path}.identityState`, "verified identity requires submittedArtistName and title");
  }
  if (parsed.airplayState === "unknown" && parsed.completionExtent !== "unknown") {
    fail(`${path}.completionExtent`, "must remain unknown when airplayState is unknown");
  }
  if (parsed.airplayState === "not_played_confirmed" && parsed.completionExtent !== "unknown") {
    fail(`${path}.completionExtent`, "must be unknown when no airplay is confirmed");
  }
  return parsed;
}

function parseCandidate(value: unknown, index: number): QueueRecoveryCandidate {
  const path = `candidates[${index}]`;
  const candidate = record(value, path);
  exactKeys(candidate, ["candidateId", "kind", "observedAt", "privateBlobPathname", "candidateLabel", "matchState", "matchedRecoveryTrackId", "evidenceIds"], path);
  const parsed: QueueRecoveryCandidate = {
    candidateId: identifier(candidate.candidateId, `${path}.candidateId`),
    kind: enumValue(candidate.kind, new Set(["blob_upload", "link_reference", "stripe_track"] as const), `${path}.kind`),
    observedAt: timestamp(candidate.observedAt, `${path}.observedAt`, true),
    privateBlobPathname: nullableString(candidate.privateBlobPathname, `${path}.privateBlobPathname`),
    candidateLabel: nullableString(candidate.candidateLabel, `${path}.candidateLabel`),
    matchState: enumValue(candidate.matchState, new Set(["unmatched", "confirmed"] as const), `${path}.matchState`),
    matchedRecoveryTrackId: nullableIdentifier(candidate.matchedRecoveryTrackId, `${path}.matchedRecoveryTrackId`),
    evidenceIds: parseEvidenceIds(candidate.evidenceIds, `${path}.evidenceIds`),
  };
  if (parsed.evidenceIds.length === 0) fail(`${path}.evidenceIds`, "must contain at least one evidence reference");
  if (parsed.kind === "blob_upload" && !parsed.privateBlobPathname) fail(`${path}.privateBlobPathname`, "is required for blob_upload candidates");
  if (parsed.matchState === "confirmed" && !parsed.matchedRecoveryTrackId) fail(`${path}.matchedRecoveryTrackId`, "is required for a confirmed match");
  if (parsed.matchState === "unmatched" && parsed.matchedRecoveryTrackId) fail(`${path}.matchedRecoveryTrackId`, "must be null for an unmatched candidate");
  return parsed;
}

function parseCoverage(value: unknown): QueueHistoricalEvidenceCoverage {
  const path = "coverage";
  const coverage = record(value, path);
  const keys = [
    "acceptedConfirmed",
    "rejectedCooldownRequests",
    "identitiesResolved",
    "identitiesUnresolved",
    "markedPlayed",
    "removed",
    "stillActive",
    "administrativeOutcomeUnknown",
    "airplayPlayedConfirmed",
    "airplayNotPlayedConfirmed",
    "airplayUnknown",
    "completionFullConfirmed",
    "completionPartialConfirmed",
    "completionUnknown",
  ] as const;
  exactKeys(coverage, keys, path);
  return Object.fromEntries(keys.map((key) => [key, count(coverage[key], `${path}.${key}`)])) as unknown as QueueHistoricalEvidenceCoverage;
}

export function deriveQueueHistoricalEvidenceCoverage(
  acceptance: Pick<QueueRecoveryAcceptance, "acceptedRequestCount" | "rejectedCooldownRequestCount">,
  tracks: readonly QueueRecoveredTrack[],
): QueueHistoricalEvidenceCoverage {
  const acceptedTracks = tracks.filter((track) => track.acceptanceState === "accepted_confirmed");
  if (acceptedTracks.length > acceptance.acceptedRequestCount) {
    fail("coverage.acceptedConfirmed", "cannot exceed the accepted request count; candidate_only tracks never count as accepted");
  }
  const identitiesResolved = acceptedTracks.filter((track) => track.identityState === "verified").length;
  const markedPlayed = acceptedTracks.filter((track) => track.administrativeOutcome === "marked_played").length;
  const removed = acceptedTracks.filter((track) => track.administrativeOutcome === "removed").length;
  const stillActive = acceptedTracks.filter((track) => track.administrativeOutcome === "still_active").length;
  const airplayPlayedConfirmed = acceptedTracks.filter((track) => track.airplayState === "played_confirmed").length;
  const airplayNotPlayedConfirmed = acceptedTracks.filter((track) => track.airplayState === "not_played_confirmed").length;
  const completionFullConfirmed = acceptedTracks.filter((track) => track.airplayState === "played_confirmed" && track.completionExtent === "full_confirmed").length;
  const completionPartialConfirmed = acceptedTracks.filter((track) => track.airplayState === "played_confirmed" && track.completionExtent === "partial_confirmed").length;
  const completionUnknown = acceptedTracks.filter((track) => track.airplayState === "played_confirmed" && track.completionExtent === "unknown").length;
  return {
    acceptedConfirmed: acceptedTracks.length,
    rejectedCooldownRequests: acceptance.rejectedCooldownRequestCount,
    identitiesResolved,
    identitiesUnresolved: acceptance.acceptedRequestCount - identitiesResolved,
    markedPlayed,
    removed,
    stillActive,
    administrativeOutcomeUnknown: acceptance.acceptedRequestCount - markedPlayed - removed - stillActive,
    airplayPlayedConfirmed,
    airplayNotPlayedConfirmed,
    airplayUnknown: acceptance.acceptedRequestCount - airplayPlayedConfirmed - airplayNotPlayedConfirmed,
    completionFullConfirmed,
    completionPartialConfirmed,
    completionUnknown,
  };
}

function compareCoverage(actual: QueueHistoricalEvidenceCoverage, expected: QueueHistoricalEvidenceCoverage): void {
  for (const key of Object.keys(expected) as (keyof QueueHistoricalEvidenceCoverage)[]) {
    if (actual[key] !== expected[key]) fail(`coverage.${key}`, `claims ${actual[key]}, but records prove ${expected[key]}`);
  }
}

function assertEvidenceReferences(ledger: QueueHistoricalEvidenceLedger): void {
  const sourcesById = new Map(ledger.sources.map((source) => [source.evidenceId, source]));
  const trackIds = new Set(ledger.tracks.map((track) => track.recoveryTrackId));
  const requireEvidence = (evidenceId: string, path: string): QueueRecoverySource => {
    const source = sourcesById.get(evidenceId);
    if (!source) fail(path, `references missing evidence ${JSON.stringify(evidenceId)}`);
    return source;
  };

  ledger.acceptance.acceptedEvidenceIds.forEach((evidenceId, index) => {
    const source = requireEvidence(evidenceId, `acceptance.acceptedEvidenceIds[${index}]`);
    if (!ACCEPTANCE_EVIDENCE_KINDS.has(source.kind)) {
      fail(`acceptance.acceptedEvidenceIds[${index}]`, `references ${source.kind}, which cannot prove accepted-request accounting`);
    }
    if (source.sha256 === null) {
      fail(`acceptance.acceptedEvidenceIds[${index}]`, "must reference evidence with a non-null SHA-256 digest");
    }
  });
  ledger.acceptance.rejectedCooldownEvidenceIds.forEach((evidenceId, index) => {
    const source = requireEvidence(evidenceId, `acceptance.rejectedCooldownEvidenceIds[${index}]`);
    if (!REJECTED_COOLDOWN_EVIDENCE_KINDS.has(source.kind)) {
      fail(`acceptance.rejectedCooldownEvidenceIds[${index}]`, `references ${source.kind}, which cannot prove rejected-cooldown accounting`);
    }
    if (source.sha256 === null) {
      fail(`acceptance.rejectedCooldownEvidenceIds[${index}]`, "must reference evidence with a non-null SHA-256 digest");
    }
  });
  ledger.acceptance.events.forEach((event, index) => requireEvidence(event.evidenceId, `acceptance.events[${index}].evidenceId`));
  ledger.tracks.forEach((track, trackIndex) => {
    const trackEvidence = new Set(track.evidenceIds);
    track.evidenceIds.forEach((evidenceId, evidenceIndex) => requireEvidence(evidenceId, `tracks[${trackIndex}].evidenceIds[${evidenceIndex}]`));
    for (const [field, evidenceIds] of Object.entries(track.fieldEvidence)) {
      evidenceIds.forEach((evidenceId, evidenceIndex) => {
        requireEvidence(evidenceId, `tracks[${trackIndex}].fieldEvidence.${field}[${evidenceIndex}]`);
        if (!trackEvidence.has(evidenceId)) fail(`tracks[${trackIndex}].fieldEvidence.${field}[${evidenceIndex}]`, "must also appear in the track evidenceIds list");
      });
    }

    const sourcesForField = (field: string): QueueRecoverySource[] => (track.fieldEvidence[field] ?? [])
      .map((evidenceId) => requireEvidence(evidenceId, `tracks[${trackIndex}].fieldEvidence.${field}`));
    if (track.acceptanceState === "accepted_confirmed") {
      const acceptanceSources = sourcesForField("acceptanceState");
      if (!acceptanceSources.some((source) => TRACK_ACCEPTANCE_EVIDENCE_KINDS.has(source.kind))) {
        fail(`tracks[${trackIndex}].fieldEvidence.acceptanceState`, "accepted_confirmed requires row-level acceptance evidence; count aggregates, digests, and Blob evidence are insufficient");
      }
    }
    if (track.identityState === "verified") {
      for (const field of ["identityState", "submittedArtistName", "title"]) {
        const identitySources = sourcesForField(field);
        if (!identitySources.some((source) => IDENTITY_EVIDENCE_KINDS.has(source.kind))) {
          fail(`tracks[${trackIndex}].fieldEvidence.${field}`, "verified identity requires owner export, Stripe, owner-attestation, or VOD evidence");
        }
      }
    }
    if (track.administrativeOutcome !== "unknown") {
      const outcomeSources = sourcesForField("administrativeOutcome");
      if (!outcomeSources.some((source) => ADMINISTRATIVE_OUTCOME_EVIDENCE_KINDS.has(source.kind))) {
        fail(`tracks[${trackIndex}].fieldEvidence.administrativeOutcome`, "known administrative outcome requires sanitized owner export or owner-attestation evidence");
      }
    }

    if (track.airplayState !== "unknown") {
      const airplayEvidence = track.fieldEvidence.airplayState;
      if (!airplayEvidence?.length) fail(`tracks[${trackIndex}].fieldEvidence.airplayState`, "confirmed airplay state requires field-specific evidence");
      const airplaySources = airplayEvidence.map((evidenceId) => requireEvidence(evidenceId, `tracks[${trackIndex}].fieldEvidence.airplayState`));
      const supported = track.airplayState === "played_confirmed"
        ? airplaySources.some((source) => DIRECT_PLAYED_EVIDENCE_KINDS.has(source.kind))
        : airplaySources.some((source) => DIRECT_NOT_PLAYED_EVIDENCE_KINDS.has(source.kind) && source.coverage === "full_show");
      if (!supported) {
        fail(
          `tracks[${trackIndex}].airplayState`,
          track.airplayState === "played_confirmed"
            ? "is not backed by a playback event or VOD observation"
            : "is not backed by a full-show VOD observation",
        );
      }
    }
    if (track.completionExtent !== "unknown") {
      const completionEvidence = track.fieldEvidence.completionExtent;
      if (!completionEvidence?.length) {
        fail(`tracks[${trackIndex}].fieldEvidence.completionExtent`, "confirmed completion extent requires field-specific VOD evidence");
      }
      const completionSources = completionEvidence.map((evidenceId) => requireEvidence(
        evidenceId,
        `tracks[${trackIndex}].fieldEvidence.completionExtent`,
      ));
      const supported = track.completionExtent === "full_confirmed"
        ? completionSources.some((source) => source.kind === "vod_observation" && (source.coverage === "partial_show" || source.coverage === "full_show"))
        : completionSources.some((source) => source.kind === "vod_observation");
      if (!supported) {
        fail(`tracks[${trackIndex}].completionExtent`, "is not backed by a VOD observation");
      }
    }
  });
  ledger.candidates.forEach((candidate, candidateIndex) => {
    candidate.evidenceIds.forEach((evidenceId, evidenceIndex) => requireEvidence(evidenceId, `candidates[${candidateIndex}].evidenceIds[${evidenceIndex}]`));
    if (candidate.matchedRecoveryTrackId && !trackIds.has(candidate.matchedRecoveryTrackId)) {
      fail(`candidates[${candidateIndex}].matchedRecoveryTrackId`, `references missing recovery track ${JSON.stringify(candidate.matchedRecoveryTrackId)}`);
    }
  });
}

function parseLedger(value: unknown, allowMissingDigest: boolean): QueueHistoricalEvidenceLedger {
  const ledger = record(value, "ledger");
  const requiredKeys = allowMissingDigest && !Object.hasOwn(ledger, "bundleDigest")
    ? LEDGER_KEYS.filter((key) => key !== "bundleDigest")
    : LEDGER_KEYS;
  exactKeys(ledger, requiredKeys, "ledger");
  const schema = ledger.schema;
  if (schema !== QUEUE_HISTORICAL_EVIDENCE_SCHEMA) fail("schema", `must equal ${QUEUE_HISTORICAL_EVIDENCE_SCHEMA}`);
  const sources = array(ledger.sources, "sources").map(parseSource);
  const tracks = array(ledger.tracks, "tracks").map(parseTrack);
  const candidates = array(ledger.candidates, "candidates").map(parseCandidate);
  unique(sources.map((source) => source.evidenceId), "sources.evidenceId");
  unique(tracks.map((track) => track.recoveryTrackId), "tracks.recoveryTrackId");
  unique(tracks.flatMap((track) => track.originalTrackId ? [track.originalTrackId] : []), "tracks.originalTrackId");
  unique(candidates.map((candidate) => candidate.candidateId), "candidates.candidateId");

  const acceptance = parseAcceptance(ledger.acceptance);
  const coverage = parseCoverage(ledger.coverage);
  const parsed: QueueHistoricalEvidenceLedger = {
    schema,
    bundleDigest: allowMissingDigest && (!Object.hasOwn(ledger, "bundleDigest") || ledger.bundleDigest === "")
      ? ""
      : (sha256(ledger.bundleDigest, "bundleDigest") as string),
    previousBundleDigest: sha256(ledger.previousBundleDigest, "previousBundleDigest", true),
    canonicalShowDate: showDate(ledger.canonicalShowDate, "canonicalShowDate"),
    sourceSessionId: nullableIdentifier(ledger.sourceSessionId, "sourceSessionId"),
    completeness: enumValue(ledger.completeness, new Set(["complete", "partial"] as const), "completeness"),
    visibility: enumValue(ledger.visibility, new Set(["admin_only"] as const), "visibility"),
    acceptance,
    sources,
    tracks,
    candidates,
    coverage,
  };
  parsed.sources.forEach((source, index) => {
    if (source.canonicalShowDate !== parsed.canonicalShowDate) {
      fail(
        `sources[${index}].canonicalShowDate`,
        `must equal ledger canonicalShowDate ${parsed.canonicalShowDate}`,
      );
    }
  });
  assertEvidenceReferences(parsed);
  compareCoverage(coverage, deriveQueueHistoricalEvidenceCoverage(acceptance, tracks));
  if (parsed.completeness === "complete" && (
    coverage.acceptedConfirmed !== acceptance.acceptedRequestCount
    || coverage.identitiesUnresolved !== 0
    || coverage.administrativeOutcomeUnknown !== 0
    || coverage.airplayUnknown !== 0
    || coverage.completionUnknown !== 0
  )) {
    fail("completeness", "complete requires every accepted request to have resolved identity, administrative outcome, and airplay evidence");
  }
  return parsed;
}

type CanonicalJson = null | boolean | number | string | CanonicalJson[] | { [key: string]: CanonicalJson };

function canonicalJson(value: unknown, path = "value"): CanonicalJson {
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail(path, "contains a non-finite number");
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) return value.map((item, index) => canonicalJson(item, `${path}[${index}]`));
  if (typeof value === "object") {
    const source = value as Record<string, unknown>;
    const result: { [key: string]: CanonicalJson } = {};
    for (const key of Object.keys(source).sort()) {
      if (source[key] === undefined) fail(`${path}.${key}`, "contains undefined");
      result[key] = canonicalJson(source[key], `${path}.${key}`);
    }
    return result;
  }
  fail(path, "contains a non-JSON value");
}

export function canonicalQueueHistoricalEvidenceJson(value: unknown): string {
  return JSON.stringify(canonicalJson(value));
}

export function computeQueueHistoricalEvidenceBundleDigest(
  value: QueueHistoricalEvidenceLedger | QueueHistoricalEvidenceLedgerDraft,
): string {
  const parsed = parseLedger(value, true);
  const digestInput: QueueHistoricalEvidenceLedger = { ...parsed, bundleDigest: "" };
  return createHash("sha256").update(canonicalQueueHistoricalEvidenceJson(digestInput), "utf8").digest("hex");
}

export function assertQueueRecoveryEvidenceHashes(
  ledger: Pick<QueueHistoricalEvidenceLedger, "sources">,
  actualEvidenceSha256ById: Readonly<Record<string, string>>,
): void {
  const declaredIds = new Set(ledger.sources.map((source) => source.evidenceId));
  for (const evidenceId of Object.keys(actualEvidenceSha256ById)) {
    if (!declaredIds.has(evidenceId)) fail(`actualEvidenceSha256ById.${evidenceId}`, "does not correspond to a declared source");
  }
  for (const [index, source] of ledger.sources.entries()) {
    if (source.sha256 === null) continue;
    if (!Object.hasOwn(actualEvidenceSha256ById, source.evidenceId)) {
      fail(`sources[${index}].sha256`, "cannot be verified because the independently computed digest is missing");
    }
    const actual = actualEvidenceSha256ById[source.evidenceId];
    if (!SHA256_PATTERN.test(actual)) fail(`actualEvidenceSha256ById.${source.evidenceId}`, "must be a lowercase SHA-256 digest");
    if (actual !== source.sha256) fail(`sources[${index}].sha256`, `does not match the independently computed digest for ${source.evidenceId}`);
  }
}

export function sealQueueHistoricalEvidenceLedger(
  draft: QueueHistoricalEvidenceLedgerDraft,
): QueueHistoricalEvidenceLedger {
  const parsed = parseLedger({ ...draft, bundleDigest: "" }, true);
  const bundleDigest = computeQueueHistoricalEvidenceBundleDigest(parsed);
  return { ...parsed, bundleDigest };
}

export function validateQueueHistoricalEvidenceLedger(
  value: unknown,
  options: QueueHistoricalEvidenceValidationOptions = {},
): QueueHistoricalEvidenceLedger {
  const parsed = parseLedger(value, false);
  const expectedDigest = computeQueueHistoricalEvidenceBundleDigest(parsed);
  if (parsed.bundleDigest !== expectedDigest) fail("bundleDigest", `does not match canonical bundle digest ${expectedDigest}`);
  if (options.actualEvidenceSha256ById) assertQueueRecoveryEvidenceHashes(parsed, options.actualEvidenceSha256ById);
  return parsed;
}
