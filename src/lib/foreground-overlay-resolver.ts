import type { QueueEntry, QueueState } from "./queue-types";
import type { ResolvedLiveOverlayScene } from "./live-overlay-resolver";

export const FOREGROUND_ARTIST_HOLD_MS = 12_000;
export const FOREGROUND_TRACK_HOLD_MS = 6_000;
export const FOREGROUND_IDENTITY_CYCLE_MS = FOREGROUND_ARTIST_HOLD_MS + FOREGROUND_TRACK_HOLD_MS;
export const FOREGROUND_CONFIRMED_SKIP_VISIBLE_MS = 3 * 60_000;

export type ForegroundIdentityPhase = "artist" | "track";
export type ForegroundOverlayActionTone = "neutral" | "skip" | "bnl" | "sponsor" | "wheel";
export type ForegroundOverlayActionSource = "wheel" | "sponsor" | "system" | "priority" | "bnl" | "queue";

export interface ForegroundOverlayAction {
  id: string;
  label: string;
  message: string;
  tone: ForegroundOverlayActionTone;
  source: ForegroundOverlayActionSource;
  occurredAt: string | null;
}

export interface ForegroundOverlaySnapshot {
  schemaVersion: "foreground_overlay_v1";
  revision: number;
  serverNow: string;
  submissionsOpen: boolean;
  wheelSpinsOwed: number;
  track: {
    id: string;
    artistName: string;
    trackTitle: string;
    cycleStartedAt: string;
  } | null;
  action: ForegroundOverlayAction;
  sponsorEndsAt: string | null;
}

export interface ResolveForegroundOverlaySnapshotInput {
  queueState: QueueState;
  scene: ResolvedLiveOverlayScene;
  bnl?: {
    message?: string | null;
    publishedAt?: string | null;
  } | null;
}

type PhaseAtTime = {
  phase: ForegroundIdentityPhase;
  remainingMs: number;
};

function cleanText(value: unknown, fallback: string, maxLength = 180): string {
  if (typeof value !== "string") return fallback;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
  return cleaned || fallback;
}

function timeMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function displayArtist(entry: QueueEntry): string {
  return cleanText(entry.detectedArtistName ?? entry.submittedArtistName ?? entry.artist, "UNKNOWN ARTIST", 120);
}

function displayTitle(entry: QueueEntry): string {
  return cleanText(entry.detectedSongTitle ?? entry.submittedSongTitle ?? entry.title, "UNTITLED TRANSMISSION", 160);
}

function actionTrackMessage(entry: QueueEntry): string {
  const handle = cleanText(entry.tiktokHandle, "", 70).replace(/^([^@])/, "@$1");
  const forWhom = handle ? ` // FOR ${handle}` : "";
  return `${displayArtist(entry)} — ${displayTitle(entry)}${forWhom}`;
}

function uniqueEntries(entries: Array<QueueEntry | null | undefined>): QueueEntry[] {
  const seen = new Set<string>();
  return entries.filter((entry): entry is QueueEntry => {
    if (!entry || seen.has(entry.id)) return false;
    seen.add(entry.id);
    return true;
  });
}

function activeQueueEntries(state: QueueState): QueueEntry[] {
  return uniqueEntries([state.nowPlaying, state.loadedTrack, state.nextInLine, ...state.queue]).filter((entry) => !entry.isTestTrack);
}

function allQueueEntries(state: QueueState): QueueEntry[] {
  return uniqueEntries([
    state.nowPlaying,
    state.loadedTrack,
    state.nextInLine,
    ...state.queue,
    ...state.history,
    ...(state.removed ?? []),
  ]).filter((entry) => !entry.isTestTrack);
}

function priorityEventAt(entry: QueueEntry): string | null {
  if (entry.priorityUpgradeStatus === "paid" || entry.priorityUpgradeStatus === "paid_needs_attention") {
    return entry.priorityUpgradePaidAt ?? entry.priorityUpgradeAt ?? entry.priorityUpgradeRequestedAt ?? null;
  }
  if (entry.priorityUpgradeStatus === "manual") return entry.priorityUpgradeAt ?? entry.priorityUpgradeRequestedAt ?? null;
  return entry.priorityUpgradeCheckoutCreatedAt ?? entry.priorityUpgradeRequestedAt ?? entry.priorityUpgradeAt ?? null;
}

function priorityAction(state: QueueState, nowMs: number): ForegroundOverlayAction | null {
  const activeIds = new Set(activeQueueEntries(state).map((entry) => entry.id));
  const candidates = allQueueEntries(state).flatMap((entry) => {
    const status = entry.priorityUpgradeStatus;
    const occurredAt = priorityEventAt(entry);
    const occurredAtMs = timeMs(occurredAt);
    const isActive = activeIds.has(entry.id);

    if (status === "paid_needs_attention" && isActive) {
      return [{
        id: `priority-received:${entry.id}:${occurredAt ?? "active"}`,
        label: "SKIP RECEIVED",
        message: actionTrackMessage(entry),
        tone: "skip" as const,
        source: "priority" as const,
        occurredAt,
        sortTime: occurredAtMs ?? 0,
      }];
    }

    if (status === "checkout_pending" && isActive) {
      return [{
        id: `priority-sent:${entry.id}:${occurredAt ?? "active"}`,
        label: "SKIP SENT",
        message: actionTrackMessage(entry),
        tone: "skip" as const,
        source: "priority" as const,
        occurredAt,
        sortTime: occurredAtMs ?? 0,
      }];
    }

    const eventAgeMs = occurredAtMs === null ? null : nowMs - occurredAtMs;
    if ((status === "paid" || status === "manual") && eventAgeMs !== null && eventAgeMs >= 0 && eventAgeMs <= FOREGROUND_CONFIRMED_SKIP_VISIBLE_MS) {
      return [{
        id: `priority-confirmed:${entry.id}:${occurredAt}`,
        label: "SKIP CONFIRMED",
        message: actionTrackMessage(entry),
        tone: "skip" as const,
        source: "priority" as const,
        occurredAt,
        sortTime: occurredAtMs ?? 0,
      }];
    }

    return [];
  });

  const latest = candidates.sort((left, right) => right.sortTime - left.sortTime)[0];
  if (!latest) return null;
  return {
    id: latest.id,
    label: latest.label,
    message: latest.message,
    tone: latest.tone,
    source: latest.source,
    occurredAt: latest.occurredAt,
  };
}

function sceneAction(scene: ResolvedLiveOverlayScene): ForegroundOverlayAction | null {
  if (scene.mode.startsWith("wheel_")) {
    const labels: Partial<Record<ResolvedLiveOverlayScene["mode"], string>> = {
      wheel_ready: "WHEEL READY",
      wheel_reencrypting: "RE-ENCRYPTING",
      wheel_spinning: "WHEEL SPINNING",
      wheel_result: "WHEEL RESULT",
      wheel_confirmed: "WHEEL CONFIRMED",
    };
    return {
      id: `wheel:${scene.mode}:${scene.updatedAt}`,
      label: labels[scene.mode] ?? "WHEEL",
      message: cleanText(scene.message, "WHEEL SIGNAL ACTIVE"),
      tone: "wheel",
      source: "wheel",
      occurredAt: scene.updatedAt,
    };
  }

  if (scene.mode === "sponsor") {
    return {
      id: `sponsor:${scene.updatedAt}`,
      label: "SPONSOR BREAK",
      message: "A WORD FROM OUR SPONSOR",
      tone: "sponsor",
      source: "sponsor",
      occurredAt: scene.updatedAt,
    };
  }

  if (scene.mode === "system_message" || scene.mode === "video_placeholder") {
    const bnlMessage = /\bBNL(?:-01)?\b/i.test(scene.title ?? "");
    return {
      id: `system:${scene.updatedAt}`,
      label: bnlMessage ? "BNL" : cleanText(scene.title, scene.mode === "video_placeholder" ? "VIDEO" : "SYSTEM", 24).toUpperCase(),
      message: cleanText(scene.message, "STAND BY"),
      tone: bnlMessage ? "bnl" : "neutral",
      source: "system",
      occurredAt: scene.updatedAt,
    };
  }

  return null;
}

function sponsorEndsAt(state: QueueState): string | null {
  const session = state.session;
  if (!session || session.sponsorBreakStatus !== "running") return null;
  const startedAt = timeMs(session.sponsorBreakStartedAt);
  if (startedAt === null) return null;
  const seconds = typeof session.sponsorBreakSeconds === "number" && Number.isFinite(session.sponsorBreakSeconds)
    ? Math.max(0, session.sponsorBreakSeconds)
    : 630;
  return new Date(startedAt + seconds * 1000).toISOString();
}

export function foregroundIdentityPhaseAt(cycleStartedAt: string | number | Date | null | undefined, nowMs = Date.now()): PhaseAtTime {
  const startMs = cycleStartedAt instanceof Date
    ? cycleStartedAt.getTime()
    : typeof cycleStartedAt === "number"
      ? cycleStartedAt
      : timeMs(cycleStartedAt) ?? nowMs;
  const safeNowMs = Number.isFinite(nowMs) ? nowMs : Date.now();
  const safeStartMs = Number.isFinite(startMs) ? startMs : safeNowMs;
  const elapsedMs = Math.max(0, safeNowMs - safeStartMs);
  const cycleOffsetMs = elapsedMs % FOREGROUND_IDENTITY_CYCLE_MS;
  if (cycleOffsetMs < FOREGROUND_ARTIST_HOLD_MS) {
    return { phase: "artist", remainingMs: Math.max(1, FOREGROUND_ARTIST_HOLD_MS - cycleOffsetMs) };
  }
  return { phase: "track", remainingMs: Math.max(1, FOREGROUND_IDENTITY_CYCLE_MS - cycleOffsetMs) };
}

export function resolveForegroundOverlaySnapshot(input: ResolveForegroundOverlaySnapshotInput, now = new Date()): ForegroundOverlaySnapshot {
  const { queueState, scene } = input;
  const nowMs = now.getTime();
  const session = queueState.session ?? null;
  const currentTrack = queueState.nowPlaying ?? queueState.loadedTrack ?? null;
  const sceneOverride = sceneAction(scene);
  const skipAction = priorityAction(queueState, nowMs);
  const bnlMessage = cleanText(input.bnl?.message, "", 180);
  const fallbackAction: ForegroundOverlayAction = bnlMessage
    ? {
        id: `bnl:${input.bnl?.publishedAt ?? bnlMessage}`,
        label: "BNL",
        message: bnlMessage,
        tone: "bnl",
        source: "bnl",
        occurredAt: input.bnl?.publishedAt ?? null,
      }
    : session
      ? {
          id: `queue:${queueState.revision ?? 0}`,
          label: "QUEUE",
          message: `${queueState.publicStatus?.activeCount ?? session.activeCount ?? 0} ACTIVE // ${session.completedCount ?? queueState.totalPlayed ?? 0} PLAYED`,
          tone: "neutral",
          source: "queue",
          occurredAt: session.updatedAt ?? null,
        }
      : {
          id: "queue:standby",
          label: "SYSTEM",
          message: "AWAITING BROADCAST SIGNAL",
          tone: "neutral",
          source: "queue",
          occurredAt: null,
        };

  return {
    schemaVersion: "foreground_overlay_v1",
    revision: Math.max(0, Math.floor(queueState.revision ?? 0)),
    serverNow: now.toISOString(),
    submissionsOpen: queueState.publicStatus?.isOpen ?? session?.queueOpen ?? false,
    wheelSpinsOwed: Math.max(0, Math.floor(session?.wheelSpinsOwed ?? scene.wheelSpinsOwed ?? 0)),
    track: currentTrack ? {
      id: currentTrack.id,
      artistName: displayArtist(currentTrack),
      trackTitle: displayTitle(currentTrack),
      cycleStartedAt: currentTrack.playedAt ?? scene.updatedAt ?? now.toISOString(),
    } : null,
    action: sceneOverride ?? skipAction ?? fallbackAction,
    sponsorEndsAt: sponsorEndsAt(queueState),
  };
}
