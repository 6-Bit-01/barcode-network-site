import type { QueueEntry, QueueState } from "./queue-types";
import type { ResolvedLiveOverlayScene } from "./live-overlay-resolver";

export const FOREGROUND_ARTIST_HOLD_MS = 12_000;
export const FOREGROUND_TRACK_HOLD_MS = 6_000;
export const FOREGROUND_IDENTITY_CYCLE_MS = FOREGROUND_ARTIST_HOLD_MS + FOREGROUND_TRACK_HOLD_MS;
export const FOREGROUND_ACTION_HOLD_MS = 7_000;
export const FOREGROUND_CONFIRMED_SKIP_VISIBLE_MS = 3 * 60_000;
export const FOREGROUND_SHOW_START_VISIBLE_MS = 4 * 60_000;

export type ForegroundIdentityPhase = "artist" | "track";
export type ForegroundOverlayActionTone = "neutral" | "signal" | "closed" | "skip" | "bnl" | "sponsor" | "wheel";
export type ForegroundOverlayActionSource = "wheel" | "sponsor" | "system" | "priority" | "show" | "intake" | "queue";

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
  actionCycleStartedAt: string;
  track: {
    id: string;
    artistName: string;
    trackTitle: string;
    cycleStartedAt: string;
  } | null;
  action: ForegroundOverlayAction;
  actions: ForegroundOverlayAction[];
  sponsorEndsAt: string | null;
}

export interface ResolveForegroundOverlaySnapshotInput {
  queueState: QueueState;
  scene: ResolvedLiveOverlayScene;
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

function countedStatus(state: QueueState) {
  const session = state.session ?? null;
  const accepted = Math.max(0, Math.floor(state.publicStatus?.acceptedCount ?? session?.acceptedCount ?? 0));
  const active = Math.max(0, Math.floor(state.publicStatus?.activeCount ?? session?.activeCount ?? 0));
  const completed = Math.max(0, Math.floor(session?.completedCount ?? state.totalPlayed ?? 0));
  const capacity = Math.max(1, Math.floor(state.publicStatus?.capacity ?? session?.queueCapacity ?? 44));
  return { accepted, active, completed, capacity };
}

function wheelStatusAction(state: QueueState, scene: ResolvedLiveOverlayScene): ForegroundOverlayAction | null {
  const session = state.session ?? null;
  const owed = Math.max(0, Math.floor(session?.wheelSpinsOwed ?? scene.wheelSpinsOwed ?? 0));
  if (owed <= 0) return null;
  return {
    id: `wheel-unlocked:${owed}`,
    label: "WHEEL UNLOCKED",
    message: `${owed} ${owed === 1 ? "SPIN" : "SPINS"} ARMED // TAP TARGET CLEARED`,
    tone: "wheel",
    source: "wheel",
    occurredAt: session?.updatedAt ?? scene.updatedAt,
  };
}

function sponsorStatusAction(state: QueueState): ForegroundOverlayAction | null {
  const session = state.session ?? null;
  if (session?.sponsorBreakStatus !== "due") return null;
  return {
    id: "sponsor:due",
    label: "SPONSOR WINDOW",
    message: "WORD FROM OUR SPONSOR READY // RUN AFTER CURRENT TRACK",
    tone: "sponsor",
    source: "sponsor",
    occurredAt: session.updatedAt ?? null,
  };
}

function showStatusAction(state: QueueState, nowMs: number): ForegroundOverlayAction {
  const session = state.session ?? null;
  if (!session) {
    return {
      id: "show:standby",
      label: "NETWORK IDLE",
      message: "BARCODE RADIO RECEIVER STANDING BY",
      tone: "neutral",
      source: "show",
      occurredAt: null,
    };
  }

  if (session.broadcastPhase === "ended" || session.status === "archived" || session.submissionClosureReason === "ended") {
    return {
      id: "show:complete",
      label: "SHOW COMPLETE",
      message: "BROADCAST CLOSED // ARCHIVE ROUTING ACTIVE",
      tone: "closed",
      source: "show",
      occurredAt: session.updatedAt ?? null,
    };
  }

  if (session.showStarted === true || session.broadcastPhase === "broadcast_active") {
    const startedAtMs = timeMs(session.broadcastStartedAt);
    const recentlyStarted = startedAtMs !== null && nowMs >= startedAtMs && nowMs - startedAtMs <= FOREGROUND_SHOW_START_VISIBLE_MS;
    return {
      id: recentlyStarted ? "show:signal-locked" : "show:online",
      label: recentlyStarted ? "SIGNAL LOCKED" : "SHOW ONLINE",
      message: recentlyStarted ? "BARCODE RADIO IS LIVE // BROADCAST LINK ESTABLISHED" : "BARCODE RADIO TRANSMISSION ACTIVE",
      tone: "signal",
      source: "show",
      occurredAt: session.broadcastStartedAt ?? session.updatedAt ?? null,
    };
  }

  if (state.publicStatus?.isOpen ?? session.queueOpen) {
    return {
      id: "show:pre-show",
      label: "PRE-SHOW LINK",
      message: "BUILDING TONIGHT'S SIGNAL STACK",
      tone: "signal",
      source: "show",
      occurredAt: session.createdAt ?? null,
    };
  }

  return {
    id: "show:session-standby",
    label: "SESSION STANDBY",
    message: "NEXT BROADCAST SIGNAL PENDING",
    tone: "neutral",
    source: "show",
    occurredAt: session.updatedAt ?? null,
  };
}

function intakeStatusAction(state: QueueState): ForegroundOverlayAction | null {
  const session = state.session ?? null;
  if (!session) return null;
  const counts = countedStatus(state);
  const isOpen = state.publicStatus?.isOpen ?? session.queueOpen ?? false;
  if (isOpen) {
    const remaining = Math.max(0, counts.capacity - counts.accepted);
    return {
      id: "intake:open",
      label: "INTAKE OPEN",
      message: `SUBMISSIONS LIVE // ${remaining} ${remaining === 1 ? "SLOT" : "SLOTS"} REMAIN`,
      tone: "signal",
      source: "intake",
      occurredAt: session.updatedAt ?? null,
    };
  }

  const reason = state.publicStatus?.closureReason ?? session.submissionClosureReason ?? null;
  if (reason === "capacity") {
    return {
      id: "intake:capacity",
      label: "INTAKE MAXED",
      message: `${counts.accepted}/${counts.capacity} SIGNALS LOCKED // LINE SEALED`,
      tone: "closed",
      source: "intake",
      occurredAt: session.updatedAt ?? null,
    };
  }

  if (reason === "ended" || reason === "archived") {
    return {
      id: `intake:${reason}`,
      label: "INTAKE CLOSED",
      message: "BROADCAST COMPLETE // NO NEW SIGNALS",
      tone: "closed",
      source: "intake",
      occurredAt: session.updatedAt ?? null,
    };
  }

  return {
    id: "intake:closed",
    label: "INTAKE CLOSED",
    message: session.showStarted ? "CURRENT LINE LOCKED // TRANSMISSION CONTINUES" : "SIGNAL WINDOW OFFLINE // STAND BY",
    tone: "closed",
    source: "intake",
    occurredAt: session.updatedAt ?? null,
  };
}

function nextSignalAction(state: QueueState): ForegroundOverlayAction | null {
  const next = state.nextInLine;
  if (!next || next.isTestTrack) return null;
  return {
    id: `queue:next:${next.id}`,
    label: "NEXT SIGNAL",
    message: `${displayArtist(next)} // ${displayTitle(next)}`,
    tone: "signal",
    source: "queue",
    occurredAt: next.createdAt ?? null,
  };
}

function queueStatusActions(state: QueueState): ForegroundOverlayAction[] {
  const session = state.session ?? null;
  if (!session) return [];
  const counts = countedStatus(state);
  const actions: ForegroundOverlayAction[] = [{
    id: "queue:stack",
    label: "SIGNAL STACK",
    message: `${counts.accepted}/${counts.capacity} LOCKED // ${counts.active} STILL IN LINE`,
    tone: "neutral",
    source: "queue",
    occurredAt: session.updatedAt ?? null,
  }];
  if (counts.completed > 0) {
    actions.push({
      id: "queue:archive-sync",
      label: "ARCHIVE SYNC",
      message: `${counts.completed} ${counts.completed === 1 ? "TRANSMISSION" : "TRANSMISSIONS"} CLEARED // HISTORY UPDATED`,
      tone: "neutral",
      source: "queue",
      occurredAt: session.updatedAt ?? null,
    });
  }
  return actions;
}

function operationalActions(state: QueueState, scene: ResolvedLiveOverlayScene, nowMs: number): ForegroundOverlayAction[] {
  const show = showStatusAction(state, nowMs);
  const intake = intakeStatusAction(state);
  const showJustStarted = show.id === "show:signal-locked";
  return [
    wheelStatusAction(state, scene),
    sponsorStatusAction(state),
    ...(showJustStarted ? [show, intake] : [intake, show]),
    nextSignalAction(state),
    ...queueStatusActions(state),
  ].filter((action): action is ForegroundOverlayAction => Boolean(action));
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

export function foregroundActionAt(actions: ForegroundOverlayAction[], cycleStartedAt: string | number | Date | null | undefined, nowMs = Date.now()): ForegroundOverlayAction {
  const available = actions.length > 0 ? actions : [showStatusAction({ nowPlaying: null, queue: [], history: [], totalPlayed: 0, streamStatus: "offline" }, nowMs)];
  const startMs = cycleStartedAt instanceof Date
    ? cycleStartedAt.getTime()
    : typeof cycleStartedAt === "number"
      ? cycleStartedAt
      : timeMs(cycleStartedAt) ?? nowMs;
  const safeNowMs = Number.isFinite(nowMs) ? nowMs : Date.now();
  const safeStartMs = Number.isFinite(startMs) ? startMs : safeNowMs;
  const elapsedMs = Math.max(0, safeNowMs - safeStartMs);
  const index = Math.floor(elapsedMs / FOREGROUND_ACTION_HOLD_MS) % available.length;
  return available[index] ?? available[0];
}

export function resolveForegroundOverlaySnapshot(input: ResolveForegroundOverlaySnapshotInput, now = new Date()): ForegroundOverlaySnapshot {
  const { queueState, scene } = input;
  const nowMs = now.getTime();
  const session = queueState.session ?? null;
  const currentTrack = queueState.nowPlaying ?? queueState.loadedTrack ?? null;
  const sceneOverride = sceneAction(scene);
  const skipAction = priorityAction(queueState, nowMs);
  const actions = sceneOverride ? [sceneOverride] : skipAction ? [skipAction] : operationalActions(queueState, scene, nowMs);
  const actionCycleStartedAt = sceneOverride?.occurredAt ?? skipAction?.occurredAt ?? session?.updatedAt ?? scene.updatedAt ?? now.toISOString();

  return {
    schemaVersion: "foreground_overlay_v1",
    revision: Math.max(0, Math.floor(queueState.revision ?? 0)),
    serverNow: now.toISOString(),
    submissionsOpen: queueState.publicStatus?.isOpen ?? session?.queueOpen ?? false,
    wheelSpinsOwed: Math.max(0, Math.floor(session?.wheelSpinsOwed ?? scene.wheelSpinsOwed ?? 0)),
    actionCycleStartedAt,
    track: currentTrack ? {
      id: currentTrack.id,
      artistName: displayArtist(currentTrack),
      trackTitle: displayTitle(currentTrack),
      cycleStartedAt: currentTrack.playedAt ?? scene.updatedAt ?? now.toISOString(),
    } : null,
    action: actions[0],
    actions,
    sponsorEndsAt: sponsorEndsAt(queueState),
  };
}
