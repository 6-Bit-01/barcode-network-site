import { NextResponse } from "next/server";
import { databasePage, siteConfig } from "@/content";
import { dossierAuthoringGuide } from "@/lib/dossier-authoring-guide";
import { buildDossierTagRegistry } from "@/lib/dossier-tags";
import { DOSSIER_TAXONOMY_GUIDE } from "@/lib/dossier-taxonomy";
import type {
  BnlReadModelExposure,
  DatabaseEntry,
  DossierLink,
  ClearanceMeaning,
  DossierEcosystemLane,
  DossierIdentityAuthority,
  PublicDossierAuthority,
  PublicDossierKind,
  PublicDossierLifecycle,
  PublicPageVisibility,
} from "@/content";
import { getDatabaseAggregateStats } from "@/lib/database-stats";
import { authenticateBNLJournalRequest } from "@/lib/bnl-journal-contract";
import {
  getDossierPrimaryLink,
  getDossierPublicLinks,
} from "@/lib/dossier-links";
import {
  getBnlReadModelExposure,
  getClearanceMeaning,
  getPublicPageVisibility,
  isBnlAggregateOnly,
  isBnlReadModelDossierVisible,
  isHiddenFromBnl,
  isPublicDatabasePageVisible,
} from "@/lib/database-visibility";
import {
  getQueueBnlReadProjections,
  getQueueSessionShowLog,
  getRadioQueueState,
  toPublicQueueTrack,
} from "@/lib/queue";
import { getLiveOverlayRuntimeState } from "@/lib/live-overlay";
import { attachQueueLiveTiming } from "@/lib/queue-live-timing";
import {
  isQueueProductionEnabled,
  queueProductionCapability,
} from "@/lib/queue-production";
import { getRadioSubmissionRouting } from "@/lib/radio-submission-routing";
import type {
  QueueEntry,
  QueueLane,
  QueuePlaybackDiagnostics,
  QueuePlaybackTiming,
  QueuePublicTrack,
  QueueSessionBnlPublicationAccess,
  QueueShowLogEvent,
  QueueShowLogEventDetails,
  QueueShowLogEventType,
  QueueSourceType,
} from "@/lib/queue-types";
import {
  getTrackRuntimeSeconds,
  queueSessionBnlPublicationAccess,
} from "@/lib/queue-types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PUBLIC_CACHE_CONTROL = "public, max-age=15, s-maxage=30";
const PRIVATE_CACHE_CONTROL = "private, no-store, max-age=0";
const MAX_ARTISTS = 25;
const MAX_TRACKS_PER_ARTIST = 5;
const MAX_BNL_OPERATIONAL_EVENTS = 30;
const MAX_BNL_WHEEL_EVENTS = 12;

const BNL_OPERATIONAL_EVENT_TYPES = new Set<QueueShowLogEventType>([
  "submissions_opened",
  "submissions_closed",
  "broadcast_started",
  "track_loaded",
  "track_play_started",
  "track_paused",
  "track_stalled",
  "track_resumed",
  "track_playback_error",
  "track_finished",
  "track_skipped",
  "track_removed",
  "track_returned",
  "track_restored",
  "track_signal_hold_applied",
  "wheel_spin_unlocked",
  "wheel_launched",
  "wheel_reencrypted",
  "wheel_spun",
  "wheel_result_rejected",
  "wheel_confirmed",
  "wheel_cancelled",
  "sponsor_break_started",
  "sponsor_break_completed",
  "sponsor_break_skipped",
  "sponsor_break_reset",
  "session_archived",
]);

type BnlReadModelTrackStatus = "queued" | "completed" | "nowPlaying" | "upNext";

type BnlTrackContextRole = "runtime" | "recap_candidate";

type BnlTrackContext = {
  source: "queue_public_snapshot";
  visibility: "private" | "public";
  contextRole: BnlTrackContextRole;
  status: BnlReadModelTrackStatus;
  memoryDefault: "do_not_store" | "recap_candidate_only";
  profileDefault: "not_profile";
  identityDefault: "not_discord_identity";
  recapDefault: "not_until_completed" | "recap_candidate";
};

type BnlArtistTrackStatusCounts = Record<BnlReadModelTrackStatus, number>;

type BnlReadModelArtist = {
  name: string;
  normalizedName: string;
  tiktokHandle?: string | null;
  tracks: Array<{
    trackId: string;
    title: string;
    lane: QueueLane;
    status: BnlReadModelTrackStatus;
    sourceType: QueueSourceType;
    publicSourceUrl?: string | null;
  }>;
  source: "queue_public_snapshot";
  trackStatusCounts: BnlArtistTrackStatusCounts;
  bnlContext: {
    source: "queue_public_snapshot";
    visibility: "private" | "public";
    surfaceType: "queue_derived_artist_surface";
    profileStatus: "not_profile";
    identityStatus: "not_discord_or_account_identity";
    memoryDefault: "do_not_store";
    dossierDefault: "not_seed_without_operator_reason";
  };
};

type BnlQueueTrack = Pick<
  QueuePublicTrack,
  | "id"
  | "submittedArtistName"
  | "submittedSongTitle"
  | "submittedAlbumName"
  | "collaboratorNames"
  | "detectedArtistName"
  | "detectedSongTitle"
  | "detectedAlbumName"
  | "providerTitle"
  | "sourceType"
  | "lane"
  | "durationLabel"
  | "estimatedDurationSeconds"
  | "detectedDurationSeconds"
  | "durationIsEstimate"
  | "durationSource"
  | "sourceArtworkUrl"
  | "publicSourceUrl"
  | "tiktokHandle"
> & {
  stage: BnlReadModelTrackStatus | "removed" | "spotlight" | "loaded";
  queuePosition: number | null;
  storedStatus: QueueEntry["status"];
  submittedAt: string;
  playedAt: string | null;
  completedAt: string | null;
  removedAt: string | null;
  restoredAt: string | null;
  playback: {
    outcome: QueueEntry["playbackOutcome"] | null;
    endedNaturally: boolean | null;
    earlyCutoff: boolean | null;
    endPositionSeconds: number | null;
    observedDurationSeconds: number | null;
    issueCode: QueueEntry["playbackIssueCode"] | null;
  };
  priority: {
    active: boolean;
    paused: boolean;
  };
  signalHold: {
    protected: boolean;
    state: "none" | "active" | "fulfilled" | "expired";
    applicationCount: number;
    lastAppliedAt: string | null;
    priorityRelinquishedAt: string | null;
  };
  isSimulation: boolean;
  bnlContext: BnlTrackContext;
};

type BnlQueueTrackStage = BnlQueueTrack["stage"];
type BnlQueueAccessScope = "none" | "private" | "public";

type BnlOperationalEventTrack = {
  trackId: string;
  artist: string;
  title: string;
  currentStage: BnlQueueTrackStage | null;
  currentQueuePosition: number | null;
  currentLane: QueueLane | null;
};

type BnlOperationalEvent = {
  sequence: number;
  eventType: QueueShowLogEventType;
  occurredAt: string;
  track: BnlOperationalEventTrack | null;
  details: QueueShowLogEventDetails | null;
};

function bnlOperationalEventDetails(
  details: QueueShowLogEventDetails | null | undefined,
): QueueShowLogEventDetails | null {
  if (!details) return null;
  const safe: QueueShowLogEventDetails = {
    playbackProvider: details.playbackProvider ?? null,
    playbackPositionSeconds: details.playbackPositionSeconds ?? null,
    playbackDurationSeconds: details.playbackDurationSeconds ?? null,
    playbackErrorCode: details.playbackErrorCode ?? null,
    wheelCandidateCount: details.wheelCandidateCount ?? null,
    wheelSpinDurationMs: details.wheelSpinDurationMs ?? null,
    wheelSpinsAdded: details.wheelSpinsAdded ?? null,
    wheelSpinsOwed: details.wheelSpinsOwed ?? null,
    signalHoldPreviousLane: details.signalHoldPreviousLane ?? null,
    signalHoldApplicationCount: details.signalHoldApplicationCount ?? null,
  };
  return Object.values(safe).some((value) => value !== null) ? safe : null;
}

function bnlOperationalEvents(
  events: readonly QueueShowLogEvent[],
  currentTracks: ReadonlyMap<string, BnlQueueTrack>,
): BnlOperationalEvent[] {
  return events
    .filter((event) =>
      BNL_OPERATIONAL_EVENT_TYPES.has(event.eventType)
      && (!event.track || currentTracks.has(event.track.trackId)))
    .slice(-MAX_BNL_OPERATIONAL_EVENTS)
    .map((event) => {
      const current = event.track?.trackId
        ? currentTracks.get(event.track.trackId) ?? null
        : null;
      return {
        sequence: event.sequence,
        eventType: event.eventType,
        occurredAt: event.occurredAt,
        track: event.track
          ? {
              trackId: event.track.trackId,
              artist: event.track.artist,
              title: event.track.title,
              currentStage: current?.stage ?? null,
              currentQueuePosition: current?.queuePosition ?? null,
              currentLane: current?.lane ?? null,
            }
          : null,
        details: bnlOperationalEventDetails(event.details),
      };
    });
}

function bnlTrackContext(
  status: BnlReadModelTrackStatus,
  accessScope: Exclude<BnlQueueAccessScope, "none">,
): BnlTrackContext {
  const completed = status === "completed";
  return {
    source: "queue_public_snapshot",
    visibility: accessScope,
    contextRole: completed ? "recap_candidate" : "runtime",
    status,
    memoryDefault: completed ? "recap_candidate_only" : "do_not_store",
    profileDefault: "not_profile",
    identityDefault: "not_discord_identity",
    recapDefault: completed ? "recap_candidate" : "not_until_completed",
  };
}

function safeSignalHoldState(entry: QueueEntry): BnlQueueTrack["signalHold"]["state"] {
  if (entry.signalHoldStatus === "active") return "active";
  if (entry.signalHoldStatus === "fulfilled") return "fulfilled";
  if (entry.signalHoldStatus === "expired") return "expired";
  return "none";
}

function operationalTrack(
  entry: QueueEntry | null | undefined,
  stage: BnlQueueTrackStage,
  accessScope: Exclude<BnlQueueAccessScope, "none">,
  queuePosition: number | null = null,
): BnlQueueTrack | null {
  if (!entry) return null;
  const track = toPublicQueueTrack(entry);
  const contextStatus: BnlReadModelTrackStatus = stage === "removed" || stage === "spotlight" || stage === "loaded"
    ? entry.playbackOutcome || entry.status === "completed" || entry.status === "played"
      ? "completed"
      : "queued"
    : stage;
  return {
    id: track.id,
    submittedArtistName: track.submittedArtistName,
    submittedSongTitle: track.submittedSongTitle,
    submittedAlbumName: track.submittedAlbumName ?? null,
    collaboratorNames: track.collaboratorNames ?? null,
    detectedArtistName: track.detectedArtistName ?? null,
    detectedSongTitle: track.detectedSongTitle ?? null,
    detectedAlbumName: track.detectedAlbumName ?? null,
    providerTitle: track.providerTitle ?? null,
    sourceType: track.sourceType,
    lane: track.lane,
    durationLabel: track.durationLabel,
    estimatedDurationSeconds: track.estimatedDurationSeconds,
    detectedDurationSeconds: track.detectedDurationSeconds ?? null,
    durationIsEstimate: track.durationIsEstimate,
    durationSource: track.durationSource,
    sourceArtworkUrl: track.sourceArtworkUrl ?? null,
    publicSourceUrl: track.publicSourceUrl ?? null,
    tiktokHandle: track.tiktokHandle ?? null,
    stage,
    queuePosition,
    storedStatus: entry.status,
    submittedAt: entry.createdAt,
    playedAt: entry.playedAt ?? null,
    completedAt: entry.completedAt ?? null,
    removedAt: entry.removedAt ?? null,
    restoredAt: entry.restoredAt ?? null,
    playback: {
      outcome: entry.playbackOutcome ?? null,
      endedNaturally: entry.playbackEndedNaturally ?? null,
      earlyCutoff: entry.playbackEarlyCutoff ?? null,
      endPositionSeconds: entry.playbackEndPositionSeconds ?? null,
      observedDurationSeconds: entry.playbackObservedDurationSeconds ?? null,
      issueCode: entry.playbackIssueCode ?? null,
    },
    priority: {
      active: (entry.lane ?? "regular") === "priority",
      paused: Boolean(entry.priorityPausedAt),
    },
    signalHold: {
      protected: entry.signalHoldStatus === "active",
      state: safeSignalHoldState(entry),
      applicationCount: Math.max(0, Math.floor(entry.signalHoldApplicationCount ?? 0)),
      lastAppliedAt: entry.signalHoldAppliedAt ?? null,
      priorityRelinquishedAt: entry.signalHoldPriorityRelinquishedAt ?? null,
    },
    isSimulation: track.isSimulation === true,
    bnlContext: bnlTrackContext(contextStatus, accessScope),
  };
}

function isBnlQueueEntry(
  entry: QueueEntry | null | undefined,
  includeSimulationTracks: boolean,
): entry is QueueEntry {
  if (!entry) return false;
  if (includeSimulationTracks) return true;
  if (entry.isTestTrack === true) return false;
  if (entry.note?.includes("[QUEUE SIMULATION TRACK]") === true) return false;
  if (entry.artist.startsWith("SIM ") || entry.title.startsWith("SIM "))
    return false;
  return true;
}

function pressureFor(
  activeCount: number,
  capacity: number,
): "low" | "medium" | "high" | "max" {
  if (capacity <= 0) return "low";
  const load = activeCount / capacity;
  if (load >= 1) return "max";
  if (load >= 0.75) return "high";
  if (load >= 0.4) return "medium";
  return "low";
}

function disabledQueueProjection() {
  return {
    available: false,
    reason: "queue_production_disabled",
    message:
      "BARCODE Radio queue production signals are disabled; queue data is unavailable to BNL.",
  };
}

function unavailableQueueProjection() {
  return {
    available: false,
    reason: "queue_data_unavailable",
    message: "No public BNL queue data is available.",
  };
}

function safePlaybackDiagnostics(
  diagnostics: QueuePlaybackDiagnostics | null | undefined,
  readableTrackIds: ReadonlySet<string>,
) {
  if (!diagnostics) return null;
  const events = diagnostics.events
    .filter((event) => readableTrackIds.has(event.trackId))
    .slice(-20);
  const latestStoredEvent = diagnostics.events.at(-1);
  const currentTrackReadable = diagnostics.currentTrackId !== null
    && readableTrackIds.has(diagnostics.currentTrackId);
  const currentStateReadable = diagnostics.currentTrackId !== null
    ? currentTrackReadable
    : !latestStoredEvent || readableTrackIds.has(latestStoredEvent.trackId);
  return {
    schemaVersion: diagnostics.schemaVersion,
    currentTrackId: currentTrackReadable ? diagnostics.currentTrackId : null,
    lifecycleState: currentStateReadable ? diagnostics.lifecycleState : "idle",
    lastEventAt: events.at(-1)?.observedAt ?? null,
    lastErrorCode: currentStateReadable ? diagnostics.lastErrorCode : null,
    events: events.map((event) => ({
      sequence: event.sequence,
      trackId: event.trackId,
      provider: event.provider,
      eventType: event.eventType,
      lifecycleState: event.lifecycleState,
      observedAt: event.observedAt,
      currentTimeSeconds: event.currentTimeSeconds,
      durationSeconds: event.durationSeconds,
      readyState: event.readyState,
      networkState: event.networkState,
      errorCode: event.errorCode,
    })),
  };
}

function safePlaybackTiming(
  timing: QueuePlaybackTiming | null | undefined,
  nowPlayingTrackId: string | null,
) {
  if (!timing || !nowPlayingTrackId || timing.trackId !== nowPlayingTrackId)
    return null;
  return {
    trackId: timing.trackId,
    playbackState: timing.playbackState,
    currentTimeSeconds: timing.currentTimeSeconds,
    durationSeconds: timing.durationSeconds,
    observedAt: timing.observedAt,
    source: timing.source,
  };
}

function runtimeSecondsFor(entries: readonly QueueEntry[]): number {
  const seen = new Set<string>();
  return entries.reduce((total, entry) => {
    if (seen.has(entry.id)) return total;
    seen.add(entry.id);
    return total + getTrackRuntimeSeconds(entry);
  }, 0);
}

async function readQueueForBnl(authenticated: boolean) {
  let state = await getRadioQueueState();
  const publication = queueSessionBnlPublicationAccess(state.session);
  const accessScope: BnlQueueAccessScope = publication.accessLevel === "public"
    ? "public"
    : publication.accessLevel === "private" && authenticated
      ? "private"
      : "none";
  if (!publication.queueReadable) {
    return {
      accessScope,
      queue: unavailableQueueProjection(),
      artists: [] as BnlReadModelArtist[],
      operatorQueue: null,
      publication: null,
    };
  }
  if (publication.accessLevel === "private" && !authenticated) {
    return {
      accessScope,
      queue: unavailableQueueProjection(),
      artists: [] as BnlReadModelArtist[],
      operatorQueue: null,
      publication: null,
    };
  }

  let showLogEvents: QueueShowLogEvent[] = [];
  let showLogRevision: number | null = null;
  const sessionId = state.session?.sessionId ?? null;
  if (sessionId) {
    const [runtimeResult, showLogResult] = await Promise.allSettled([
      getLiveOverlayRuntimeState(),
      getQueueSessionShowLog(sessionId),
    ]);
    if (runtimeResult.status === "fulfilled") {
      state = attachQueueLiveTiming(
        state,
        runtimeResult.value.playerSync,
        runtimeResult.value.overlayState,
      );
    }
    if (
      showLogResult.status === "fulfilled"
      && showLogResult.value.session.sessionId === sessionId
    ) {
      showLogEvents = showLogResult.value.events;
      showLogRevision = showLogResult.value.revision;
    }
  }

  const readableScope = accessScope as Exclude<BnlQueueAccessScope, "none">;
  const includeSimulationTracks = readableScope === "private";
  const sessionEnded =
    state.session?.status === "archived" ||
    state.session?.broadcastPhase === "ended";
  const queueEntries = sessionEnded
    ? []
    : state.queue.filter((entry) => isBnlQueueEntry(entry, includeSimulationTracks));
  const completedEntries = state.history.filter((entry) =>
    isBnlQueueEntry(entry, includeSimulationTracks));
  const removedEntries = (state.removed ?? []).filter((entry) =>
    isBnlQueueEntry(entry, includeSimulationTracks));
  const spotlightEntries = (state.spotlight ?? []).filter((entry) =>
    isBnlQueueEntry(entry, includeSimulationTracks));
  const nowPlayingEntry = !sessionEnded && isBnlQueueEntry(state.nowPlaying, includeSimulationTracks)
    ? state.nowPlaying
    : null;
  const upNextEntry = !sessionEnded && isBnlQueueEntry(state.nextInLine, includeSimulationTracks)
    ? state.nextInLine
    : null;
  const activeIds = new Set<string>();
  for (const entry of queueEntries) {
    if (entry.status === "queued" || entry.status === "playing")
      activeIds.add(entry.id);
  }
  if (nowPlayingEntry) activeIds.add(nowPlayingEntry.id);
  if (upNextEntry) activeIds.add(upNextEntry.id);
  const readableActiveTrackIds = new Set(queueEntries.map((entry) => entry.id));
  if (upNextEntry) readableActiveTrackIds.add(upNextEntry.id);
  if (nowPlayingEntry) readableActiveTrackIds.add(nowPlayingEntry.id);
  const readableTrackIds = new Set([
    ...readableActiveTrackIds,
    ...completedEntries.map((entry) => entry.id),
    ...removedEntries.map((entry) => entry.id),
    ...spotlightEntries.map((entry) => entry.id),
  ]);

  const capacity =
    state.publicStatus?.capacity ?? state.session?.queueCapacity ?? 0;
  const activeCount = activeIds.size;
  const activeEntries = [
    ...queueEntries.filter((entry) => entry.status === "queued" || entry.status === "playing"),
    ...(upNextEntry ? [upNextEntry] : []),
    ...(nowPlayingEntry ? [nowPlayingEntry] : []),
  ];
  const estimatedActiveRuntimeSeconds = runtimeSecondsFor(activeEntries);
  const completedRuntimeSeconds = runtimeSecondsFor(completedEntries);
  const publicQueueTracks = queueEntries.map(toPublicQueueTrack);
  const publicCompletedTracks = completedEntries.map(toPublicQueueTrack);
  const nowPlaying = nowPlayingEntry ? toPublicQueueTrack(nowPlayingEntry) : null;
  const upNext = upNextEntry ? toPublicQueueTrack(upNextEntry) : null;
  const operationalNowPlaying = operationalTrack(
    nowPlayingEntry,
    "nowPlaying",
    readableScope,
  );
  const operationalUpNext = operationalTrack(
    upNextEntry,
    "upNext",
    readableScope,
    upNextEntry ? 1 : null,
  );
  const operationalQueue = queueEntries
    .map((entry, index) => operationalTrack(
      entry,
      "queued",
      readableScope,
      index + (upNextEntry ? 2 : 1),
    ))
    .filter((track): track is BnlQueueTrack => Boolean(track));
  const operationalCompleted = completedEntries
    .map((entry) => operationalTrack(entry, "completed", readableScope))
    .filter((track): track is BnlQueueTrack => Boolean(track));
  const operationalRemoved = removedEntries
    .map((entry) => operationalTrack(entry, "removed", readableScope))
    .filter((track): track is BnlQueueTrack => Boolean(track));
  const operationalSpotlight = spotlightEntries
    .map((entry) => operationalTrack(entry, "spotlight", readableScope))
    .filter((track): track is BnlQueueTrack => Boolean(track));
  const currentTracks = new Map<string, BnlQueueTrack>();
  for (const track of [
    ...operationalSpotlight,
    ...operationalRemoved,
    ...operationalCompleted,
    ...operationalQueue,
    operationalUpNext,
    operationalNowPlaying,
  ]) {
    if (track) currentTracks.set(track.id, track);
  }
  const recentEvents = bnlOperationalEvents(showLogEvents, currentTracks);
  const wheelEvents = recentEvents
    .filter((event) => event.eventType.startsWith("wheel_"))
    .slice(-MAX_BNL_WHEEL_EVENTS);
  const lastConfirmedWinnerRaw = [...showLogEvents]
    .reverse()
    .find((event) =>
      event.eventType === "wheel_confirmed"
      && event.track
      && currentTracks.has(event.track.trackId));
  const lastConfirmedWinnerEvent = lastConfirmedWinnerRaw
    ? bnlOperationalEvents([lastConfirmedWinnerRaw], currentTracks)[0]
    : undefined;
  const wheelSpinsOwed = sessionEnded
    ? 0
    : state.session?.wheelSpinsOwed ?? 0;

  const queue = {
    available: true,
    accessScope: readableScope,
    mutationAllowed: false,
    queueUrl: `${siteConfig.domain}/queue`,
    publication,
    revision: state.revision ?? 0,
    operationalEventsSourceRevision: showLogRevision,
    session: {
      sessionId: state.session?.sessionId ?? "",
      title: state.session?.title ?? "",
      showDate: state.session?.showDate ?? "",
      status: state.session?.status ?? "prepared",
      purpose: publication.purpose,
      bnlAccessLevel: publication.accessLevel,
      queueOpen: !sessionEnded && state.session?.queueOpen === true,
      broadcastPhase: state.session?.broadcastPhase ?? null,
      broadcastStartedAt: state.session?.broadcastStartedAt ?? null,
      showStarted: !sessionEnded && state.session?.showStarted === true,
      activeCount,
      acceptedCount: state.session?.acceptedCount ?? activeCount + completedEntries.length + removedEntries.length,
      completedCount:
        state.session?.completedCount ?? completedEntries.length,
      removedCount: removedEntries.length,
      estimatedActiveRuntimeSeconds,
      completedRuntimeSeconds,
      submissionClosureReason: state.session?.submissionClosureReason ?? null,
      wheelSpinsOwed,
      nextNonPriorityLane: state.nextNonPriorityLane ?? state.session?.nextNonPriorityLane ?? "wheel",
      autoRoutingPaused: state.autoRoutingPaused === true,
      priorityUpgradesEnabled:
        !sessionEnded && state.session?.priorityUpgradesEnabled === true,
      priorityUpgradeLabel:
        state.session?.priorityUpgradeLabel ?? "Priority Signal",
      signalHoldEnabled:
        !sessionEnded && state.session?.signalHoldEnabled === true,
      signalHoldLabel: state.session?.signalHoldLabel ?? "Signal Hold",
      sponsorBreak: {
        status: state.session?.sponsorBreakStatus ?? "not_due",
        mode: state.session?.sponsorBreakMode ?? "mid_show",
        startedAt: state.session?.sponsorBreakStartedAt ?? null,
        completedAt: state.session?.sponsorBreakCompletedAt ?? null,
      },
    },
    status: {
      isOpen:
        !sessionEnded &&
        (state.publicStatus?.isOpen ?? state.session?.queueOpen === true),
      activeCount,
      capacity,
      pressure: pressureFor(activeCount, capacity),
      estimatedRuntimeSeconds: estimatedActiveRuntimeSeconds,
    },
    nowPlaying: operationalNowPlaying,
    upNext: operationalUpNext,
    queue: operationalQueue,
    completed: operationalCompleted,
    removed: operationalRemoved,
    spotlight: operationalSpotlight,
    wheelEligibleArtists: sessionEnded ? [] : (state.wheelEligibleArtists ?? []).flatMap((artist) => {
      const trackIds = artist.trackIds.filter((trackId) => readableActiveTrackIds.has(trackId));
      return trackIds.length > 0 ? [{
        artist: artist.artist,
        normalizedArtist: artist.normalizedArtist,
        trackIds,
        trackCount: trackIds.length,
      }] : [];
    }),
    wheel: {
      spinsOwed: wheelSpinsOwed,
      status: state.wheelTiming?.status ?? "idle",
      timing: state.wheelTiming ?? null,
      lastConfirmedWinner: lastConfirmedWinnerEvent?.track
        ? {
            ...lastConfirmedWinnerEvent.track,
            sequence: lastConfirmedWinnerEvent.sequence,
            occurredAt: lastConfirmedWinnerEvent.occurredAt,
          }
        : null,
      recentEvents: wheelEvents,
    },
    recentEvents,
    playbackTiming: safePlaybackTiming(state.playbackTiming, nowPlayingEntry?.id ?? null),
    wheelTiming: state.wheelTiming ?? null,
    playbackDiagnostics: safePlaybackDiagnostics(state.playbackDiagnostics, readableTrackIds),
  };

  return {
    accessScope,
    queue,
    artists: artistsFromTracks(
      nowPlaying,
      upNext,
      publicQueueTracks,
      publicCompletedTracks,
      readableScope,
    ),
    operatorQueue: queue,
    publication,
  };
}

function stableArtistKeyFallback(name: string): string {
  let hash = 0;
  for (const char of name) {
    hash = (hash * 31 + char.codePointAt(0)!) >>> 0;
  }
  return `artist-${hash.toString(36)}`;
}

function normalizeArtistName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "";

  const normalized = trimmed
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return normalized || stableArtistKeyFallback(trimmed);
}

function artistNameForTrack(track: QueuePublicTrack): string {
  return (track.detectedArtistName || track.submittedArtistName).trim();
}

function titleForTrack(track: QueuePublicTrack): string {
  return (
    track.detectedSongTitle ||
    track.submittedSongTitle ||
    track.providerTitle ||
    "Untitled track"
  ).trim();
}

function addArtistTrack(
  artists: Map<string, BnlReadModelArtist>,
  track: QueuePublicTrack | null | undefined,
  status: BnlReadModelTrackStatus,
  accessScope: Exclude<BnlQueueAccessScope, "none">,
) {
  if (!track) return;
  const name = artistNameForTrack(track);
  if (!name) return;
  const normalizedName = normalizeArtistName(name);
  if (!normalizedName) return;

  const existing = artists.get(normalizedName);
  const artist: BnlReadModelArtist = existing ?? {
    name,
    normalizedName,
    tiktokHandle: track.tiktokHandle ?? null,
    tracks: [],
    source: "queue_public_snapshot",
    trackStatusCounts: {
      queued: 0,
      completed: 0,
      nowPlaying: 0,
      upNext: 0,
    },
    bnlContext: {
      source: "queue_public_snapshot",
      visibility: accessScope,
      surfaceType: "queue_derived_artist_surface",
      profileStatus: "not_profile",
      identityStatus: "not_discord_or_account_identity",
      memoryDefault: "do_not_store",
      dossierDefault: "not_seed_without_operator_reason",
    },
  };

  if (!artist.tiktokHandle && track.tiktokHandle)
    artist.tiktokHandle = track.tiktokHandle;
  if (
    !artist.tracks.some((artistTrack) => artistTrack.trackId === track.id) &&
    artist.tracks.length < MAX_TRACKS_PER_ARTIST
  ) {
    artist.tracks.push({
      trackId: track.id,
      title: titleForTrack(track),
      lane: track.lane,
      status,
      sourceType: track.sourceType,
      publicSourceUrl: track.publicSourceUrl ?? null,
    });
  }
  artist.trackStatusCounts[status] += 1;

  artists.set(normalizedName, artist);
}

function artistsFromTracks(
  nowPlaying: QueuePublicTrack | null,
  upNext: QueuePublicTrack | null,
  queue: QueuePublicTrack[],
  completed: QueuePublicTrack[],
  accessScope: Exclude<BnlQueueAccessScope, "none">,
): BnlReadModelArtist[] {
  const artists = new Map<string, BnlReadModelArtist>();
  addArtistTrack(artists, nowPlaying, "nowPlaying", accessScope);
  addArtistTrack(artists, upNext, "upNext", accessScope);
  for (const track of queue) addArtistTrack(artists, track, "queued", accessScope);
  for (const track of completed) addArtistTrack(artists, track, "completed", accessScope);
  return [...artists.values()].slice(0, MAX_ARTISTS);
}

type PublicDossierStatus =
  | "ACTIVE"
  | "INACTIVE"
  | "ARCHIVED"
  | "PENDING"
  | "UNKNOWN";
type PublicDatabaseEntry = DatabaseEntry;

type BnlPublicDossier = {
  id: string;
  name: string;
  kind: PublicDossierKind;
  category: DatabaseEntry["category"];
  ecosystemLane?: DossierEcosystemLane;
  identityAuthority?: DossierIdentityAuthority;
  status: PublicDossierStatus;
  lifecycle: PublicDossierLifecycle;
  role: string;
  origin: DatabaseEntry["origin"];
  clearance: DatabaseEntry["clearance"];
  publicPageVisibility: PublicPageVisibility;
  bnlReadModelExposure: BnlReadModelExposure;
  clearanceMeaning: ClearanceMeaning;
  visibilityBoundary: "same_summary_fields_as_public_database_page";
  authority: PublicDossierAuthority;
  summary: string;
  tags: string[];
  link: string | null;
  primaryLink: DossierLink | null;
  links: DossierLink[];
  publicFacts: string[];
  knownBoundaries: string[];
  relatedPublicIds: string[];
  source: "public_database_dossier";
  bnlContext: {
    source: "public_database_dossier";
    visibility: "public_page_visible";
    dossierStatus: "existing_public_page_dossier";
    clearanceMeaning: ClearanceMeaning;
    hiddenDetailsDefault: "do_not_infer";
    memoryDefault: "site_context_not_broadcast_memory";
    seedDefault: "not_seed_already_public_dossier";
    identityDefault: "public_site_entity_not_discord_identity";
  };
};

const PUBLIC_DOSSIER_BOUNDARIES = [
  "not Discord identity",
  "not payment profile",
  "not private account",
  "not automatic broadcast memory",
  "same summary fields as public database page",
  "do not infer hidden restricted/internal details",
];

const DOSSIER_RULES = [
  "Existing public-page-visible dossiers are website-published public context.",
  "Clearance is a public-facing classification label unless a record explicitly says otherwise.",
  "Public database page visibility means BNL may summarize the same public-safe fields shown by the website.",
  "RESTRICTED means restricted-classified in universe, not private user data by default.",
  "BNL must not infer hidden details from RESTRICTED or INTERNAL clearance labels.",
  "BNL must not claim private access to dossiers, systems, admin tools, Discord identity, or payment data.",
  "BNL must not expose admin notes, Discord IDs, payment/customer data, contact fields, upload fields, or private fields.",
  "Full database aggregate counts are public-safe count summaries.",
  "publicCount is a compatibility alias for BNL-visible public-page-safe dossier summaries, not PUBLIC-clearance-only records.",
  "publicClearanceOnly contains records whose clearance label is PUBLIC.",
  "Public-page-visible dossiers are not automatic broadcast memory.",
  "Public-page-visible dossiers are not automatic dossier seeds.",
  "Queue-derived artists are still not dossier records unless manually promoted through a future approved workflow.",
  "Artist, Collaborator, and Community are first-class public categories and must not collapse into Personnel by default.",
  "Personnel is reserved for official/formal BARCODE staff, operator, moderator, admin, or personnel roles.",
  "Research classifier dossier seeds are not public dossiers until a future approved site workflow publishes them.",
  "BNL should classify dossiers in order: category, kind, ecosystem lane, identity authority, then tags.",
  "AI, human, hybrid, and unknown nature are tags/traits, not primary dossier organization.",
  "Sheila/Cliff-style BARCODE-controlled characters are not community-owned mods.",
];

function lifecycleForStatus(
  status: PublicDossierStatus,
): PublicDossierLifecycle {
  if (status === "ACTIVE") return "active";
  if (status === "INACTIVE") return "inactive";
  if (status === "ARCHIVED") return "archived";
  if (status === "PENDING") return "planned";
  return "unknown";
}

function inferPublicDossierKind(entry: DatabaseEntry): PublicDossierKind {
  const name = entry.name.toLocaleLowerCase();
  const category = entry.category.toLocaleLowerCase();

  if (name === "barcode radio") return "program";
  if (name === "discord community") return "interface";
  if (name === "auxchord" || name === "tiktok live") return "platform";
  if (name.includes("bnl-01")) return "system";
  if (category === "artist") return "artist";
  if (category === "collaborator") return "collaborator";
  if (category === "community") return "community_member";
  if (category === "personnel") return "moderator";
  if (category === "production") return "program";
  if (category === "interface") return "interface";
  if (category === "sponsor") return "sponsor_character";
  if ((entry.status as PublicDossierStatus) === "ARCHIVED")
    return "archive_record";
  return "entity";
}

function normalizePublicDossier(entry: PublicDatabaseEntry): BnlPublicDossier {
  return {
    id: entry.id,
    name: entry.name,
    kind: entry.kind ?? inferPublicDossierKind(entry),
    category: entry.category,
    ecosystemLane: entry.ecosystemLane,
    identityAuthority: entry.identityAuthority,
    status: entry.status as PublicDossierStatus,
    lifecycle:
      entry.lifecycle ??
      lifecycleForStatus(entry.status as PublicDossierStatus),
    role: entry.role,
    origin: entry.origin,
    clearance: entry.clearance,
    publicPageVisibility: getPublicPageVisibility(entry),
    bnlReadModelExposure: getBnlReadModelExposure(entry),
    clearanceMeaning: getClearanceMeaning(entry),
    visibilityBoundary: "same_summary_fields_as_public_database_page",
    authority: entry.authority ?? "website_public_database",
    summary: entry.summary,
    tags: [...entry.tags],
    link: entry.link || null,
    primaryLink: getDossierPrimaryLink(entry),
    links: getDossierPublicLinks(entry),
    publicFacts: entry.publicFacts ?? [],
    knownBoundaries: entry.knownBoundaries ?? [...PUBLIC_DOSSIER_BOUNDARIES],
    relatedPublicIds: entry.relatedPublicIds ?? [],
    source: "public_database_dossier",
    bnlContext: {
      source: "public_database_dossier",
      visibility: "public_page_visible",
      dossierStatus: "existing_public_page_dossier",
      clearanceMeaning: getClearanceMeaning(entry),
      hiddenDetailsDefault: "do_not_infer",
      memoryDefault: "site_context_not_broadcast_memory",
      seedDefault: "not_seed_already_public_dossier",
      identityDefault: "public_site_entity_not_discord_identity",
    },
  };
}

function countVisibleByLifecycle(entries: BnlPublicDossier[]) {
  return entries.reduce<Partial<Record<PublicDossierLifecycle, number>>>(
    (counts, entry) => {
      counts[entry.lifecycle] = (counts[entry.lifecycle] ?? 0) + 1;
      return counts;
    },
    {},
  );
}

function countVisibleByKind(entries: BnlPublicDossier[]) {
  return entries.reduce<Partial<Record<PublicDossierKind, number>>>(
    (counts, entry) => {
      counts[entry.kind] = (counts[entry.kind] ?? 0) + 1;
      return counts;
    },
    {},
  );
}

function buildDossierRegistry(
  allEntries: DatabaseEntry[],
  bnlVisibleEntries: BnlPublicDossier[],
) {
  const stats = getDatabaseAggregateStats(allEntries);
  const siteVisibleEntries = allEntries.filter(isPublicDatabasePageVisible);
  const aggregateOnlyCount = allEntries.filter(isBnlAggregateOnly).length;
  const hiddenFromBnlCount = allEntries.filter(isHiddenFromBnl).length;
  const publicClearanceCount = allEntries.filter(
    (entry) => entry.clearance === "PUBLIC",
  ).length;
  const internalClearanceCount = allEntries.filter(
    (entry) => entry.clearance === "INTERNAL",
  ).length;
  const restrictedClearanceCount = allEntries.filter(
    (entry) => entry.clearance === "RESTRICTED",
  ).length;
  const restrictedSummariesExposed = bnlVisibleEntries.some(
    (entry) => entry.clearance === "RESTRICTED",
  );

  return {
    source: "databasePage.entries",
    sourceOfTruth: "src/content.ts:databasePage.entries",
    statsHelper: "src/lib/database-stats.ts:getDatabaseAggregateStats",
    visibilityHelper: "src/lib/database-visibility.ts",
    countScope: "full_database_aggregates",
    publicItemScope: "public_database_page_visible",
    totalCount: stats.totalCount,
    siteVisibleCount: siteVisibleEntries.length,
    bnlExposedDetailCount: bnlVisibleEntries.length,
    publicCount: bnlVisibleEntries.length,
    publicClearanceCount,
    internalClearanceCount,
    restrictedClearanceCount,
    aggregateOnlyCount,
    hiddenFromBnlCount,
    restrictedCount: stats.restrictedCount,
    activeCount: stats.activeCount,
    pendingCount: stats.pendingCount,
    categoryCount: stats.categoryCount,
    statusCounts: stats.statusCounts,
    clearanceCounts: stats.clearanceCounts,
    categoryCounts: stats.categoryCounts,
    restrictedDetailsExposed: false,
    restrictedSummariesExposed,
    clearanceMeaning: "public_lore_label" as ClearanceMeaning,
    scope: {
      aggregateCounts: "full_database",
      publicItems: "public_database_page_visible",
      public: "compatibility_alias_for_public_database_page_visible",
      publicClearanceOnly: "clearance_label_public_only",
      restrictedDetails: "summary_only_no_hidden_details",
    },
    rules: {
      aggregateCounts:
        "Full database aggregate counts are public-safe count summaries.",
      clearance:
        "Clearance is a public-facing classification label unless a record explicitly says otherwise.",
      publicPageVisibility:
        "If a dossier is listed on the public database page, BNL may summarize the same public-safe fields.",
      restrictedRecords:
        "Restricted-classified public-page dossiers may expose only the same summary fields as the public database page; hidden details remain unexposed.",
      publicCount:
        "Compatibility count for BNL-visible public-page-safe dossier summaries.",
      publicClearanceCount:
        "Number of records whose clearance label is PUBLIC.",
      totalCount:
        "Number of records in the full website database source of truth.",
      queueDerivedProfiles:
        "Queue-derived artists are not dossier records unless manually promoted through a future approved workflow.",
      citationBoundary:
        "BNL may cite public-page-safe summaries and aggregate counts, but must not claim private access or infer hidden details.",
    },
    kinds: countVisibleByKind(bnlVisibleEntries),
    ecosystemLaneCounts: bnlVisibleEntries.reduce<
      Partial<Record<DossierEcosystemLane, number>>
    >((counts, entry) => {
      if (entry.ecosystemLane)
        counts[entry.ecosystemLane] = (counts[entry.ecosystemLane] ?? 0) + 1;
      return counts;
    }, {}),
    identityAuthorityCounts: bnlVisibleEntries.reduce<
      Partial<Record<DossierIdentityAuthority, number>>
    >((counts, entry) => {
      if (entry.identityAuthority)
        counts[entry.identityAuthority] =
          (counts[entry.identityAuthority] ?? 0) + 1;
      return counts;
    }, {}),
    lifecycleCounts: countVisibleByLifecycle(bnlVisibleEntries),
    authority: "website_public_database" as PublicDossierAuthority,
    autoPromotion: false,
    queueDerivedProfiles: false,
  };
}

function countWords(value: string) {
  const words = value.trim().match(/\S+/g);
  return words?.length ?? 0;
}

function buildDossierStyleProfile(
  entries: DatabaseEntry[],
  tagRegistry: ReturnType<typeof buildDossierTagRegistry>,
) {
  const summaryCounts = entries.map((entry) => countWords(entry.summary));
  const totalSummaryWords = summaryCounts.reduce(
    (sum, count) => sum + count,
    0,
  );
  const mostUsedTags = [...tagRegistry.items]
    .sort((a, b) => b.usageCount - a.usageCount || a.tag.localeCompare(b.tag))
    .slice(0, 10)
    .map((item) => ({ tag: item.tag, usageCount: item.usageCount }));
  const singleUseTags = tagRegistry.items
    .filter((item) => item.usageCount === 1)
    .map((item) => item.tag)
    .sort((a, b) => a.localeCompare(b))
    .slice(0, 10);

  return {
    entryCount: entries.length,
    summaryWordCount: {
      min: summaryCounts.length > 0 ? Math.min(...summaryCounts) : 0,
      max: summaryCounts.length > 0 ? Math.max(...summaryCounts) : 0,
      average:
        summaryCounts.length > 0
          ? Math.round(totalSummaryWords / summaryCounts.length)
          : 0,
    },
    notesPresenceCount: entries.filter((entry) => entry.notes.trim().length > 0)
      .length,
    tagProfile: {
      totalUniqueTags: tagRegistry.totalUniqueTags,
      averageTagsPerDossier:
        entries.length > 0
          ? Math.round(
              (tagRegistry.totalTagAssignments / entries.length) * 100,
            ) / 100
          : 0,
      mostUsedTags,
      singleUseTags,
    },
    commonSections: [
      "Hero / dossier ID",
      "Portrait/card",
      "Dossier Record",
      "Intelligence Brief",
      "Attached Files",
      "Terminal Readout",
    ],
    commonFields: [
      "id",
      "name",
      "category",
      "status",
      "clearance",
      "role",
      "origin",
      "summary",
      "tags",
      "notes",
      "link",
      "primaryLink",
      "links",
      "files",
    ],
  };
}

function publicDossiers() {
  const databaseEntries = databasePage.entries;
  const publicPageVisibleEntries = databaseEntries.filter(
    isPublicDatabasePageVisible,
  );
  const bnlVisibleEntries = publicPageVisibleEntries
    .filter(isBnlReadModelDossierVisible)
    .map((entry) => normalizePublicDossier(entry));
  const publicClearanceOnly = bnlVisibleEntries.filter(
    (entry) => entry.clearance === "PUBLIC",
  );
  const registry = buildDossierRegistry(databaseEntries, bnlVisibleEntries);
  const tagRegistry = buildDossierTagRegistry(databaseEntries);
  const styleProfile = buildDossierStyleProfile(databaseEntries, tagRegistry);

  if (bnlVisibleEntries.length === 0) {
    return {
      implemented: false,
      public: [],
      items: [],
      publicPageVisible: [],
      publicClearanceOnly: [],
      registry,
      authoringGuide: dossierAuthoringGuide,
      taxonomyGuide: DOSSIER_TAXONOMY_GUIDE,
      styleProfile,
      tagRegistry,
      sourceAuthority: "public_database_page_visible_entries_only",
      rules: DOSSIER_RULES,
      note: "No public-page-visible database dossier summaries are currently included.",
    };
  }

  return {
    implemented: true,
    public: bnlVisibleEntries,
    items: bnlVisibleEntries,
    publicPageVisible: bnlVisibleEntries,
    publicClearanceOnly,
    registry,
    authoringGuide: dossierAuthoringGuide,
    taxonomyGuide: DOSSIER_TAXONOMY_GUIDE,
    styleProfile,
    tagRegistry,
    sourceAuthority: "public_database_page_visible_entries_only",
    rules: DOSSIER_RULES,
    note: "Public/read-model dossier summaries include the same public-safe fields visible on the public database page; clearance labels are preserved as lore classification labels unless explicitly overridden.",
  };
}

function buildSourceContext() {
  const submission = getRadioSubmissionRouting();

  return [
  {
    id: "barcode_network",
    title: "BARCODE Network",
    summary: `${siteConfig.name} is the public broadcast infrastructure behind BARCODE Radio: a connected site, archive, and signal surface for programs, transmissions, releases, and live-show context.`,
  },
  {
    id: "barcode_radio",
    title: "BARCODE Radio",
    summary: submission.readModelSummary,
  },
  {
    id: "bnl_01",
    title: "BNL-01",
    summary:
      "BNL-01 is the BARCODE Network liaison/bot surface for public-safe context and community-facing continuity. This read model does not grant BNL private system control or admin access.",
  },
  {
    id: "broadcast_memory",
    title: "Broadcast Memory",
    summary:
      "Broadcast memory is public-facing continuity about what the Network has already surfaced through broadcasts, site copy, queue state, and public records. It is not raw Discord data, private notes, or hidden research process material.",
  },
  {
    id: "priority_signal",
    title: "Priority Signal",
    summary:
      "Priority Signal is the public queue upgrade concept shown on the BARCODE Radio queue surface when enabled. This endpoint only exposes public-safe priority labels/statuses, never Stripe secrets, checkout records, or payment facts.",
  },
  {
    id: "boundaries",
    title: "Public Read Boundary",
    summary:
      "This source context is not user accounts, payment records, private queue notes, Discord identity mapping, hidden dossiers, private upload access, or private admin state.",
  },
  ];
}

type OperatorLaneItem = {
  id: string;
  label: string;
  source:
    | "queue_public_snapshot"
    | "public_database_dossier"
    | "read_model_boundary";
  kind: string;
  trackId?: string;
  dossierId?: string;
  status?: BnlReadModelTrackStatus;
  value?: string | number | boolean | null;
  reason: string;
};

function trackLaneItem(
  track: BnlQueueTrack,
  status: BnlReadModelTrackStatus,
  lane:
    | "temporaryRuntimeContext"
    | "recapCandidates"
    | "publicSafeCopyCandidates",
): OperatorLaneItem {
  const title =
    track.detectedSongTitle ||
    track.submittedSongTitle ||
    track.providerTitle ||
    "Untitled track";
  const artist =
    track.detectedArtistName || track.submittedArtistName || "Unknown artist";
  return {
    id: `${lane}:${track.id}:${status}`,
    label: `${artist} — ${title}`,
    source: "queue_public_snapshot",
    kind: "track",
    trackId: track.id,
    status,
    reason:
      lane === "recapCandidates"
        ? "Completed sanitized queue track available under public BNL access."
        : lane === "publicSafeCopyCandidates"
          ? "Sanitized queue track available under public BNL access."
          : "Sanitized queue track; temporary read-only context only.",
  };
}

type OperatorQueueView = {
  session: {
    queueOpen: boolean;
    status: string;
    broadcastPhase: string | null;
    activeCount: number;
    priorityUpgradesEnabled: boolean;
    priorityUpgradeLabel: string;
    wheelSpinsOwed: number;
  };
  nowPlaying: BnlQueueTrack | null;
  upNext: BnlQueueTrack | null;
  queue: BnlQueueTrack[];
  completed: BnlQueueTrack[];
};

function buildOperatorLanes(
  queue: OperatorQueueView | null,
  dossiers: ReturnType<typeof publicDossiers>,
  publication: QueueSessionBnlPublicationAccess | null,
) {
  const temporaryRuntimeContext: OperatorLaneItem[] = [];
  if (queue && publication?.runtimeContext) {
    temporaryRuntimeContext.push(
      {
        id: "queue:open",
        label: "Queue open/closed",
        source: "queue_public_snapshot",
        kind: "queue_status",
        value: queue.session.queueOpen,
        reason: "Authorized sanitized queue runtime status.",
      },
      {
        id: "session:status",
        label: "Session status",
        source: "queue_public_snapshot",
        kind: "session_status",
        value: queue.session.status,
        reason: "Authorized sanitized session runtime status.",
      },
      {
        id: "session:broadcastPhase",
        label: "Broadcast phase",
        source: "queue_public_snapshot",
        kind: "broadcast_phase",
        value: queue.session.broadcastPhase,
        reason: "Authorized sanitized broadcast phase runtime status.",
      },
      {
        id: "queue:activeCount",
        label: "Active queue count",
        source: "queue_public_snapshot",
        kind: "queue_count",
        value: queue.session.activeCount,
        reason: "Authorized sanitized count of active queue tracks.",
      },
      {
        id: "priority:enabled",
        label: "Priority Signal enabled",
        source: "queue_public_snapshot",
        kind: "priority_signal_status",
        value: queue.session.priorityUpgradesEnabled,
        reason: "Operational feature availability only, not a payment fact.",
      },
      {
        id: "priority:label",
        label: "Priority Signal label",
        source: "queue_public_snapshot",
        kind: "priority_signal_label",
        value: queue.session.priorityUpgradeLabel,
        reason: "Operational queue label only.",
      },
      {
        id: "wheel:spinsOwed",
        label: "Wheel spins owed",
        source: "queue_public_snapshot",
        kind: "wheel_status",
        value: queue.session.wheelSpinsOwed,
        reason: "Authorized sanitized queue runtime status.",
      },
    );
  }

  if (queue && publication?.runtimeContext && queue.nowPlaying)
    temporaryRuntimeContext.push(
      trackLaneItem(queue.nowPlaying, "nowPlaying", "temporaryRuntimeContext"),
    );
  if (queue && publication?.runtimeContext && queue.upNext)
    temporaryRuntimeContext.push(
      trackLaneItem(queue.upNext, "upNext", "temporaryRuntimeContext"),
    );
  if (queue && publication?.runtimeContext)
    temporaryRuntimeContext.push(...queue.queue.map((track) =>
      trackLaneItem(track, "queued", "temporaryRuntimeContext"),
    ));

  const recapCandidates = queue && publication?.recapCandidates
    ? queue.completed.map((track) => trackLaneItem(track, "completed", "recapCandidates"))
    : [];
  const publicSafeCopyCandidates: OperatorLaneItem[] = [];
  if (queue && publication?.publicCopyCandidates) {
    publicSafeCopyCandidates.push({
      id: "copy:queue:open",
      label: "Queue open/closed",
      source: "queue_public_snapshot",
      kind: "queue_status",
      value: queue.session.queueOpen,
      reason: "Explicitly approved high-level queue copy.",
    });
  }
  if (queue && publication?.publicCopyCandidates && queue.nowPlaying)
    publicSafeCopyCandidates.push(
      trackLaneItem(queue.nowPlaying, "nowPlaying", "publicSafeCopyCandidates"),
    );
  if (queue && publication?.publicCopyCandidates && queue.upNext)
    publicSafeCopyCandidates.push(
      trackLaneItem(queue.upNext, "upNext", "publicSafeCopyCandidates"),
    );
  if (queue && publication?.publicCopyCandidates)
    publicSafeCopyCandidates.push(...queue.completed.map((track) =>
      trackLaneItem(track, "completed", "publicSafeCopyCandidates"),
    ));
  publicSafeCopyCandidates.push(
    ...dossiers.public.map((dossier) => ({
      id: `copy:dossier:${dossier.id}`,
      label: dossier.name,
      source: "public_database_dossier" as const,
      kind: "public_dossier_summary",
      dossierId: dossier.id,
      value: dossier.kind,
      reason:
        "Public-page-visible dossier summary is safe site context with clearance label preserved; not private memory or a seed.",
    })),
  );

  return {
    temporaryRuntimeContext,
    recapCandidates,
    broadcastMemoryCandidates: [] as OperatorLaneItem[],
    dossierSeedCandidates: [] as OperatorLaneItem[],
    publicSafeCopyCandidates,
    doNotStore: [
      "queue artist surface is not a permanent profile",
      "queue track presence is not broadcast memory",
      "TikTok handle is not Discord identity",
      "Priority Signal status is not payment fact",
      "public dossier summary is not private dossier seed",
      "website queue read model is temporary context",
      "only sections.artistMemory may enter durable artist catalog memory",
      publication?.accessLevel === "private"
        ? "simulation/test tracks are private test evidence only"
        : "simulation/test tracks are excluded",
      "no private payment/contact/upload/admin data",
      ...(publication?.runtimeContext
        ? []
        : ["queue session provenance does not authorize BNL projection"]),
    ],
  };
}

function rulesForAccess(accessScope: BnlQueueAccessScope) {
  const privateAccess = accessScope === "private";
  const publicAccess = accessScope === "public";
  return {
    allowedUse: [
      "research/reference use",
      ...(accessScope === "none"
        ? []
        : [
            "read-only queue/session awareness",
            "read-only artist/track awareness from the sanitized queue snapshot",
            "read-only Broadcast Deck and Archive interaction",
          ]),
      ...(publicAccess
        ? ["public replies and public show companion output when relevant"]
        : []),
      ...(privateAccess
        ? ["owner/admin and private-test output only"]
        : []),
      "operatorLanes are hints, not actions",
      "temporary queue context should not be stored",
      "sections.artistMemory alone authorizes durable public artist, song, album, and show-lifecycle facts",
      "public database page visibility permits only the same public-safe summary fields",
      "queue-derived artists are not dossier records",
    ],
    disallowedUse: [
      "queue mutation or playback control",
      "private user identity",
      "payment, checkout, Stripe, amount, currency, or purchase-state facts",
      "contact emails or submitter tokens",
      "private upload URLs or file metadata",
      "legal acceptance records",
      "private queue notes, suspicious flags, or admin-only fields",
      "account or Discord identity merging",
      "automatic canon, Source File, relationship, or dossier creation",
      "automatic durable memory from queue, archive, artists, operatorLanes, or any section other than artistMemory",
      ...(privateAccess
        ? [
            "public replies from this private queue data",
            "public Broadcast Deck or public Broadcast Archive output from this private queue data",
            "public recap or announcement drafting from this private queue data",
          ]
        : []),
      "inferring BNL access from native queue visibility, playback, or archive state",
      "inferring hidden details from restricted/internal dossier clearance labels",
    ],
    sourceAuthority: {
      queue: accessScope === "none"
        ? "current session does not authorize BNL queue access"
        : `${accessScope} read-only sanitized operational queue snapshot`,
      artists: accessScope === "none"
        ? "queue-derived artist surfaces unavailable"
        : `queue-derived ${accessScope} artist surface, not profiles`,
      artistMemory:
        "public-production artist/song/album lifecycle facts authorized for durable memory; never Discord identity or automatic dossier authority",
      dossiers:
        "public-page-visible database dossier summaries with clearance labels preserved; hidden/private details are not exposed",
      operatorLanes:
        "deterministic read-only lane hints, never automatic actions or writes",
      sourceContext: "public site context aligned with the production capability",
      simulationData: privateAccess
        ? "simulation/test tracks are private test evidence and must never enter public output"
        : "simulation/test tracks are excluded from public BNL queue context",
    },
  };
}

export async function GET(req?: Request) {
  const authenticated = authenticateBNLJournalRequest(req?.headers.get("x-api-key") ?? null);
  const queueProductionEnabled = isQueueProductionEnabled();
  const liveQueue = queueProductionEnabled
    ? await readQueueForBnl(authenticated)
    : {
        accessScope: "none" as const,
        queue: disabledQueueProjection(),
        artists: [] as BnlReadModelArtist[],
        operatorQueue: null,
        publication: null,
      };
  const accessScope = liveQueue.accessScope;
  const queueProjections = queueProductionEnabled
    ? await getQueueBnlReadProjections(accessScope === "none" ? null : accessScope)
    : null;
  const artistMemory = queueProjections
    ? queueProjections.artistMemory
    : {
        available: false,
        reason: "queue_production_disabled",
        durableMemoryAuthorized: false,
        records: [],
      };
  const archive = queueProjections?.archive
    ? { available: true, ...queueProjections.archive }
    : {
        available: false,
        reason: queueProductionEnabled
          ? "current_session_does_not_authorize_bnl_queue_access"
          : "queue_production_disabled",
      };
  const dossiers = publicDossiers();
  const privateResponse = accessScope === "private";
  const noStoreResponse = authenticated || privateResponse;

  return NextResponse.json(
    {
      ok: true,
      version: 1,
      schemaRevision: "1.8",
      generatedAt: new Date().toISOString(),
      scope: privateResponse ? "bnl_private_read_model" : "bnl_public_read_model",
      source: "barcode-network-site",
      publicOnly: !privateResponse,
      accessScope,
      mutationAllowed: false,
      capabilities: {
        ...queueProductionCapability(),
        bnlQueueAccess: {
          level: accessScope,
          authenticatedPrivateAccess: privateResponse,
          mutationAllowed: false,
        },
      },
      sections: {
        sourceContext: buildSourceContext(),
        queue: liveQueue.queue,
        archive,
        artists: liveQueue.artists,
        artistMemory,
        dossiers,
        operatorLanes: queueProductionEnabled
          ? buildOperatorLanes(
              liveQueue.operatorQueue,
              dossiers,
              liveQueue.publication,
            )
          : {
              temporaryRuntimeContext: [],
              recapCandidates: [],
              broadcastMemoryCandidates: [],
              dossierSeedCandidates: [],
              publicSafeCopyCandidates: [],
              doNotStore: ["queue production signals are disabled"],
            },
        rules: rulesForAccess(accessScope),
      },
    },
    {
      headers: {
        "Cache-Control": noStoreResponse ? PRIVATE_CACHE_CONTROL : PUBLIC_CACHE_CONTROL,
        Vary: "x-api-key",
        ...(privateResponse ? { "X-Robots-Tag": "noindex, nofollow, noarchive" } : {}),
      },
    },
  );
}
