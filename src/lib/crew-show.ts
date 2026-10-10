import { artistCreditResolver } from "./artist-credits";
import { broadcastArchiveArtistHref, resolveArchiveArtist } from "./broadcast-archive";
import { buildQueueTimingSnapshot } from "./queue-timing";
import type { QueueEntry, QueuePublicHistoryTrack, QueuePublicShowStats, QueuePublicStats, QueueState } from "./queue-types";

export const CREW_HISTORY_START = "2026-08-24";
export const crewToolHeaders = { "cache-control": "private, no-store", "referrer-policy": "no-referrer" };
export function crewText(value: unknown, maximum = 200): string {
 return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, "").trim().slice(0, maximum) : "";
}
export function crewDate(value: unknown): string | null { return typeof value === "string" && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null; }
export function crewNumber(value: unknown): number | null { return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null; }
export function genuineQueueTrack(track: QueueEntry | null | undefined): track is QueueEntry {
 return Boolean(track && !track.isTestTrack && !track.note?.includes("[QUEUE SIMULATION TRACK]") && !track.artist.startsWith("SIM ") && !track.title.startsWith("SIM "));
}
/** The existing public projection decides eligibility. Defensive checks also retain its archive boundary. */
export function crewArchiveAvailable(stats: QueuePublicStats | null): stats is QueuePublicStats {
 return Boolean(stats && stats.schemaVersion === "queue_public_history_projection_v1" && stats.visibility === "public_safe" && stats.historyCoverageStartedAt === CREW_HISTORY_START && Array.isArray(stats.shows) && Array.isArray(stats.artists));
}
export function crewArchiveShows(stats: QueuePublicStats | null): QueuePublicShowStats[] {
 if (!crewArchiveAvailable(stats)) return [];
 return stats.shows.filter(show => show.status === "archived" && show.showDate >= CREW_HISTORY_START && (!Object.hasOwn(show, "purpose") || (show as QueuePublicShowStats & { purpose: string }).purpose === "live_broadcast"))
  .map(show => ({ ...show, trackRoster: show.trackRoster.filter(track => !track.isSimulation) }))
  .sort((left, right) => right.showDate.localeCompare(left.showDate) || left.sessionId.localeCompare(right.sessionId));
}
export function crewArchiveTracks(stats: QueuePublicStats | null): QueuePublicHistoryTrack[] { return crewArchiveShows(stats).flatMap(show => show.trackRoster); }
export type CrewShowTrack = { id: string; title: string; artist: string; collaborators: string[]; lane: string; status: string; durationSeconds: number; durationKind: "estimated" | "source_metadata" };
export type CrewArtistIntroduction = {
 trackId: string; title: string; artist: string; collaborators: string[];
 creditSource: "submitted_credit" | "reviewed_credit" | "inferred_credit";
 identityStatus: "credited_group_not_verified_identity";
 archive: { available: boolean; showCount: number | null; trackCount: number | null; firstShowDate: string | null; latestShowDate: string | null; historyCoverageStartedAt: string; href: string | null; appearances: { showDate: string; title: string; outcome: string }[] };
};
export type CrewShowOverview = {
 schemaVersion: "barcode_crew_show_v1"; available: boolean; reason: string | null;
 source: { readAt: string; queueRevision: number | null; archiveBuiltAt: string | null; historyCoverageStartedAt: string };
 session: { id: string; title: string; showDate: string; status: string; submissionsOpen: boolean; broadcastStartedAt: string | null } | null;
 current: CrewShowTrack | null; next: CrewShowTrack | null; upcoming: CrewShowTrack[];
 pressure: { level: string; accepted: number; capacity: number; full: boolean } | null;
 timing: { kind: "estimate"; confidence: string; remainingMusicSeconds: number; remainingShowSeconds: number; projectedEndAt: string | null; unknownDurationCount: number; playbackEvidence: "player_reported" | "unavailable"; wheel: { spinsOwed: number; status: string; estimatedSeconds: number }; commercial: { status: string; eligible: boolean; estimatedSeconds: number; estimatedRemainingSeconds: number | null; dueAfterTrackCount: number | null } } | null;
 introduction: CrewArtistIntroduction | null;
};

export function buildCrewShowOverview(state: QueueState | null, stats: QueuePublicStats | null, selectedTrackId?: string, now = new Date()): CrewShowOverview {
 if (!crewArchiveAvailable(stats)) stats = null;
 const dto: CrewShowOverview = { schemaVersion: "barcode_crew_show_v1", available: state !== null, reason: state ? "no_current_public_show" : "queue_unavailable", source: { readAt: now.toISOString(), queueRevision: crewNumber(state?.revision), archiveBuiltAt: crewDate(stats?.builtAt), historyCoverageStartedAt: CREW_HISTORY_START }, session: null, current: null, next: null, upcoming: [], pressure: null, timing: null, introduction: null };
 const session = state?.session;
 if (!state || !session || session.purpose !== "live_broadcast" || session.status === "archived" || state.isCurrentSession === false) return dto;
 const current = genuineQueueTrack(state.nowPlaying) ? state.nowPlaying : genuineQueueTrack(state.loadedTrack) ? state.loadedTrack : null;
 const next = genuineQueueTrack(state.nextInLine) ? state.nextInLine : null;
 const upcoming = [...new Map([...(next ? [next] : []), ...state.queue.filter(genuineQueueTrack)].filter(track => track.id !== current?.id).map(track => [track.id, track])).values()].slice(0, 200);
 const history = state.history.filter(genuineQueueTrack), removed = (state.removed ?? []).filter(genuineQueueTrack);
 const creditFor = artistCreditResolver([...(current ? [current] : []), ...upcoming, ...history]);
 const projectTrack = (track: QueueEntry | null): CrewShowTrack | null => {
  if (!track) return null;
  const credit = creditFor(track);
  return { id: crewText(track.id, 128), title: crewText(track.submittedSongTitle ?? track.title), artist: crewText(credit.primary), collaborators: credit.collaborators.map(name => crewText(name)).slice(0, 20), lane: crewText(track.lane, 20), status: crewText(track.status, 20), durationSeconds: crewNumber(track.detectedDurationSeconds) ?? crewNumber(track.estimatedDurationSeconds) ?? 300, durationKind: track.durationIsEstimate !== false || !crewNumber(track.detectedDurationSeconds) ? "estimated" : "source_metadata" };
 };
 const playbackTiming = current && state.playbackTiming?.trackId === current.id ? state.playbackTiming : null;
 const capacity = Math.max(1, crewNumber(session.queueCapacity) ?? 44);
 const load = new Set([...(current ? [current.id] : []), ...upcoming.map(track => track.id)]).size / capacity;
 const timing = buildQueueTimingSnapshot({ nowPlaying: current, nextInLine: next, queue: upcoming.filter(track => track.id !== next?.id), completed: history, removed, session, playbackTiming, wheelTiming: state.wheelTiming }, { now });
 dto.reason = null;
 dto.session = { id: crewText(session.sessionId, 128), title: crewText(session.title), showDate: crewText(session.showDate, 10), status: crewText(session.status, 20), submissionsOpen: session.queueOpen === true, broadcastStartedAt: crewDate(session.broadcastStartedAt) };
 dto.current = projectTrack(current); dto.next = projectTrack(next); dto.upcoming = upcoming.map(track => projectTrack(track)!);
 dto.pressure = { level: load >= 1 ? "max" : load >= 0.75 ? "high" : load >= 0.4 ? "medium" : "low", accepted: crewNumber(state.publicStatus?.acceptedCount ?? session.acceptedCount) ?? upcoming.length + history.length, capacity, full: state.publicStatus?.isFull === true };
 dto.timing = { kind: "estimate", confidence: timing.confidence, remainingMusicSeconds: timing.timelineSegments.filter(segment => segment.type === "track_runtime" || segment.type === "now_playing_remaining").reduce((sum, segment) => sum + segment.seconds, 0), remainingShowSeconds: timing.projectedRemainingShowSeconds, projectedEndAt: timing.projectedEndAt, unknownDurationCount: timing.unknownDurationCount, playbackEvidence: playbackTiming?.source === "player_sync" ? "player_reported" : "unavailable", wheel: { spinsOwed: Math.max(0, Math.floor(session.wheelSpinsOwed ?? 0)), status: crewText(state.wheelTiming?.status ?? "unavailable", 30), estimatedSeconds: timing.wheelCeremonySecondsIncluded }, commercial: { status: timing.sponsorBreakStatus, eligible: timing.sponsorBreak.commercialBreakEligible, estimatedSeconds: timing.sponsorBreak.sponsorBreakSeconds, estimatedRemainingSeconds: timing.sponsorBreak.sponsorBreakSecondsRemaining, dueAfterTrackCount: timing.sponsorBreak.sponsorBreakThreshold } };
 const selected = upcoming.find(track => track.id === selectedTrackId) ?? next ?? upcoming[0];
 if (!selected) return dto;
 const credit = creditFor(selected), projected = projectTrack(selected)!;
 const archive = stats ? resolveArchiveArtist(stats.artists, credit.primary) : undefined;
 const eligible = new Set(crewArchiveShows(stats).map(show => show.sessionId));
 const appearances = (archive?.tracks ?? []).filter(track => eligible.has(track.sessionId) && !track.isSimulation);
 const dates = appearances.map(track => track.showDate).sort();
 dto.introduction = { trackId: projected.id, title: projected.title, artist: projected.artist, collaborators: projected.collaborators, creditSource: credit.source === "admin" ? "reviewed_credit" : credit.source === "inferred" ? "inferred_credit" : "submitted_credit", identityStatus: "credited_group_not_verified_identity", archive: { available: stats !== null, showCount: stats ? new Set(appearances.map(track => track.sessionId)).size : null, trackCount: stats ? appearances.length : null, firstShowDate: dates[0] ?? null, latestShowDate: dates.at(-1) ?? null, historyCoverageStartedAt: CREW_HISTORY_START, href: archive ? broadcastArchiveArtistHref(archive.projectKey) : null, appearances: appearances.slice().sort((a, b) => b.showDate.localeCompare(a.showDate)).slice(0, 5).map(track => ({ showDate: crewText(track.showDate, 10), title: crewText(track.title), outcome: ["finished", "skipped", "removed", "unknown", "active"].includes(track.outcome) ? track.outcome : "unknown" })) } };
 return dto;
}
