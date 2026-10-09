import { createHash } from "node:crypto";
import type { QueueEntry, QueueSession } from "./queue-types";

export type MemberArtistReference =
  | { kind: "native"; sessionId: string; trackId: string; fingerprint: string }
  | { kind: "historical"; bundleDigest: string; recoveryTrackId: string };
export interface ApprovedMemberLegacyReference { id: string; artistId: string; reference: MemberArtistReference }
export interface MemberQueueHistoryContext {
  memberId: string;
  activeArtistIds: readonly string[];
  approvedLegacyReferences: readonly ApprovedMemberLegacyReference[];
}
export type MemberQueueHistoryStatus = "finished" | "skipped" | "removed" | "active" | "unknown";
export type MemberQueueHistoryAirplay = "played_confirmed" | "not_played_confirmed" | "unknown";
export type MemberQueueHistoryCompletion = "full_confirmed" | "partial_confirmed" | "unknown";
export type MemberQueueHistoryCoverage = "native_show_record" | "complete" | "partial";
export interface MemberQueueHistoryTrack {
  key: string;
  source: "native" | "historical";
  showLabel: string;
  showDate: string;
  title: string;
  artist: string;
  status: MemberQueueHistoryStatus;
  airplay: MemberQueueHistoryAirplay;
  completion: MemberQueueHistoryCompletion;
  coverage: MemberQueueHistoryCoverage;
  currentShow: boolean;
}
export interface MemberQueueHistoryCounts {
  submitted: number; finished: number; skipped: number; removed: number; active: number; unknown: number;
}
export interface MemberQueueHistory {
  currentShow: ({ sessionId: string; label: string; date: string } & MemberQueueHistoryCounts) | null;
  totals: MemberQueueHistoryCounts & { shows: number };
  tracks: MemberQueueHistoryTrack[];
  truncated: boolean;
}
/** Internal source record: never serialize this object into a browser response. */
export interface MemberQueueHistorySourceRow extends MemberQueueHistoryTrack {
  reference: MemberArtistReference;
  sessionId: string | null;
  submissionMemberId: string | null;
  approvedArtistId: string | null;
  submittedAt?: string | null;
  dedupKey?: string;
}
export type OwnerQueueAssociationCandidate = Omit<MemberQueueHistoryTrack, "key" | "source" | "currentShow"> & { reference: MemberArtistReference };
export interface OwnerQueueAssociationCandidateResult { candidates: OwnerQueueAssociationCandidate[]; nextCursor: string | null }
export interface OwnerQueueArtistCatalogResult { artists: { projectKey: string; projectLabel: string }[]; nextCursor: string | null }
export interface OwnerQueueHistoryQuery { query?: string; source?: "all" | "native" | "historical"; cursor?: string; limit?: number }

const identifier = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(value);
const digest = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
export function isMemberArtistReference(value: unknown): value is MemberArtistReference {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  const keys = Object.keys(item).sort().join(",");
  return item.kind === "native"
    ? keys === "fingerprint,kind,sessionId,trackId" && identifier(item.sessionId) && identifier(item.trackId) && digest(item.fingerprint)
    : item.kind === "historical" && keys === "bundleDigest,kind,recoveryTrackId" && digest(item.bundleDigest) && identifier(item.recoveryTrackId);
}
export function memberArtistReferenceKey(reference: MemberArtistReference): string {
  return reference.kind === "native"
    ? `native:${reference.sessionId}:${reference.trackId}:${reference.fingerprint}`
    : `historical:${reference.bundleDigest}:${reference.recoveryTrackId}`;
}
/** Lifecycle timestamps/status deliberately do not participate in source identity. */
export function memberNativeReferenceFingerprint(session: Pick<QueueSession, "sessionId" | "showDate" | "purpose" | "historicalRecoveryProvenance">, entry: QueueEntry): string {
  return createHash("sha256").update(JSON.stringify({
    sessionId: session.sessionId, showDate: session.showDate, purpose: session.purpose,
    recoverySource: session.historicalRecoveryProvenance ? {
      sourceSessionId: session.historicalRecoveryProvenance.sourceSessionId,
      canonicalShowDate: session.historicalRecoveryProvenance.canonicalShowDate,
      sourceResponseSha256: session.historicalRecoveryProvenance.sourceResponseSha256,
      sourceDigest: session.historicalRecoveryProvenance.sourceDigest,
    } : null,
    trackId: entry.id, artist: entry.submittedArtistName ?? entry.artist, title: entry.submittedSongTitle ?? entry.title,
    artistCredit: entry.artistCredit ?? null, collaborators: entry.collaboratorNames ?? null,
    sourceType: entry.sourceType ?? null, sourceKey: entry.normalizedSourceKey ?? null,
    link: entry.link, fileUrl: entry.fileUrl ?? null, providerId: entry.providerId ?? null,
    providerArtistIdentities: entry.providerArtistIdentities ?? null,
    submissionMemberId: entry.submissionMemberId ?? null, approvedArtistId: entry.approvedArtistId ?? null,
    approvedArtistLinkRevision: entry.approvedArtistLinkRevision ?? null,
  })).digest("hex");
}
function counts(rows: readonly MemberQueueHistorySourceRow[]): MemberQueueHistoryCounts {
  const count = (status: MemberQueueHistoryStatus) => rows.filter(row => row.status === status).length;
  return { submitted: rows.length, finished: count("finished"), skipped: count("skipped"), removed: count("removed"), active: count("active"), unknown: count("unknown") };
}
export function buildMemberQueueHistory(context: MemberQueueHistoryContext, sourceRows: readonly MemberQueueHistorySourceRow[], currentShow?: { sessionId: string; label: string; date: string } | null): MemberQueueHistory {
  const artists = new Set(context.activeArtistIds);
  const references = new Set(context.approvedLegacyReferences.filter(item => artists.has(item.artistId) && isMemberArtistReference(item.reference)).map(item => memberArtistReferenceKey(item.reference)));
  const selected = sourceRows.filter(row => isMemberArtistReference(row.reference) && (
    Boolean(context.memberId && row.submissionMemberId === context.memberId)
    || Boolean(row.approvedArtistId && artists.has(row.approvedArtistId))
    || references.has(memberArtistReferenceKey(row.reference))));
  // The canonical native row takes precedence only over a proven identical
  // session/track/date. Similar names or song titles never establish equivalence.
  selected.sort((a, b) => (a.source === "native" ? 0 : 1) - (b.source === "native" ? 0 : 1));
  const unique = new Map<string, MemberQueueHistorySourceRow>();
  for (const row of selected) {
    const identity = row.dedupKey ?? row.key;
    if (!unique.has(identity)) unique.set(identity, row);
  }
  const rows = [...unique.values()].sort((a, b) => b.showDate.localeCompare(a.showDate) || (b.submittedAt ?? "").localeCompare(a.submittedAt ?? "") || a.key.localeCompare(b.key));
  const currentRows = rows.filter(row => row.currentShow);
  const current = currentRows[0];
  const currentMetadata = currentShow === undefined && current?.sessionId ? { sessionId: current.sessionId, label: current.showLabel, date: current.showDate } : currentShow;
  return {
    currentShow: currentMetadata ? { ...currentMetadata, ...counts(currentRows.filter(row => row.sessionId === currentMetadata.sessionId)) } : null,
    totals: { ...counts(rows), shows: new Set(rows.map(row => row.showDate)).size },
    tracks: rows.slice(0, 100).map(({ key, source, showLabel, showDate, title, artist, status, airplay, completion, coverage, currentShow }) => ({ key, source, showLabel, showDate, title, artist, status, airplay, completion, coverage, currentShow })),
    truncated: rows.length > 100,
  };
}
