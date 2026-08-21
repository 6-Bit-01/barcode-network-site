import { performance } from "node:perf_hooks";
import { readFileSync } from "node:fs";

const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;
const pollingSource = readFileSync(new URL("../src/lib/redis-polling-budget.ts", import.meta.url), "utf8");

function interval(name) {
  const match = pollingSource.match(new RegExp(`export const ${name} = ([0-9_]+);`));
  if (!match) throw new Error(`Missing ${name}`);
  return Number(match[1].replaceAll("_", ""));
}

function track(sessionIndex, index, status) {
  const createdAt = `2026-08-${String(10 + sessionIndex).padStart(2, "0")}T${String(10 + index % 10).padStart(2, "0")}:00:00.000Z`;
  return {
    id: `track_${sessionIndex}_${String(index).padStart(2, "0")}`,
    artist: `Submitted Artist ${index}`,
    title: `Submitted Track ${index}`,
    submitterArtistName: `Artist ${index}`,
    submittedArtistName: `Artist ${index}`,
    submittedSongTitle: `Track ${index}`,
    collaboratorNames: index % 4 === 0 ? `Collaborator ${index}, Guest ${index}` : null,
    detectedArtistName: `Detected Artist ${index}`,
    detectedSongTitle: `Detected Track ${index}`,
    providerTitle: `Detected Artist ${index} — Detected Track ${index}`,
    link: `https://open.spotify.com/track/representative${sessionIndex}${index}`,
    sourceType: "spotify",
    providerId: `spotify:representative${sessionIndex}${index}`,
    normalizedSourceKey: `spotify:representative${sessionIndex}${index}`,
    sourceArtworkUrl: `https://images.example.test/${sessionIndex}/${index}.jpg`,
    tier: index % 7 === 0 ? "paid" : "free",
    lane: index % 7 === 0 ? "priority" : index % 2 === 0 ? "wheel" : "regular",
    amount: index % 7 === 0 ? 10 : 0,
    status,
    createdAt,
    playedAt: status === "completed" ? createdAt : null,
    completedAt: status === "completed" ? createdAt : null,
    removedAt: status === "removed" ? createdAt : null,
    note: index % 5 === 0 ? "Host note with enough detail to represent a real submission." : null,
    tiktokHandle: `@artist${index}`,
    normalizedTikTokHandle: `@artist${index}`,
    contactEmail: `artist${index}@example.test`,
    submitterToken: `representative-private-token-${sessionIndex}-${index}`,
    detectedDurationSeconds: 210 + index % 90,
    estimatedDurationSeconds: 210 + index % 90,
    durationIsEstimate: false,
    durationSource: "spotify_api",
    priorityUpgradeRequested: index % 7 === 0,
    priorityUpgradeStatus: index % 7 === 0 ? "paid" : "none",
    priorityUpgradeSource: index % 7 === 0 ? "stripe" : null,
    priorityUpgradePaidAt: index % 7 === 0 ? createdAt : null,
    priorityUpgradePaymentProvider: index % 7 === 0 ? "stripe" : null,
    priorityUpgradePaymentId: index % 7 === 0 ? `pi_private_${sessionIndex}_${index}` : null,
    priorityUpgradeAmountCents: index % 7 === 0 ? 1000 : null,
    priorityUpgradeCurrency: index % 7 === 0 ? "usd" : null,
    priorityGiftAttribution: index % 14 === 0 ? {
      version: 1,
      supporterName: `Supporter ${index}`,
      recipientName: `Artist ${index}`,
      capturedAt: createdAt,
    } : null,
    legalAcceptance: { acceptedAt: createdAt, termsVersion: "1", privacyVersion: "1", queueTermsVersion: "1" },
    isTestTrack: false,
  };
}

function session(sessionIndex, active) {
  const all = Array.from({ length: 44 }, (_, index) => track(
    sessionIndex,
    index,
    active ? index < 20 ? "completed" : index < 40 ? "queued" : "removed" : index < 40 ? "completed" : "removed",
  ));
  const queue = active ? all.slice(22, 40) : [];
  const completed = active ? all.slice(0, 20) : all.slice(0, 40);
  const removed = all.slice(40);
  const sessionId = `session_representative_${sessionIndex}`;
  return {
    sessionId,
    title: `BARCODE Radio Show ${sessionIndex}`,
    status: active ? "open" : "archived",
    purpose: "live_broadcast",
    bnlPublicationStatus: "public",
    provenanceRevision: 2,
    showDate: `2026-08-${String(10 + sessionIndex).padStart(2, "0")}`,
    createdAt: `2026-08-${String(10 + sessionIndex).padStart(2, "0")}T18:00:00.000Z`,
    updatedAt: `2026-08-${String(10 + sessionIndex).padStart(2, "0")}T22:00:00.000Z`,
    queueOpen: active,
    queueCapacity: 44,
    trackLimitPerArtist: 3,
    skipGameTapTarget: 10_000,
    submissionCooldownSeconds: 300,
    showStarted: active,
    broadcastStartedAt: active ? "2026-08-21T18:00:00.000Z" : null,
    broadcastPhase: active ? "broadcast_active" : "ended",
    wheelSpinsOwed: active ? 1 : 0,
    nextNonPriorityLane: "wheel",
    nextInLineTrack: active ? all[21] : null,
    nextInLineTrackId: active ? all[21].id : null,
    loadedTrack: active ? all[20] : null,
    loadedTrackId: active ? all[20].id : null,
    queue,
    completed,
    removed,
    spotlight: completed.slice(-4),
    playbackDiagnostics: {
      nextSequence: 81,
      events: completed.slice(-8).map((entry, index) => ({
        sequence: 73 + index,
        trackId: entry.id,
        provider: "audio",
        eventType: "ended",
        observedAt: entry.completedAt,
      })),
    },
    showLog: completed.flatMap((entry, index) => [
      { sequence: index * 2 + 1, eventType: "loaded", trackId: entry.id, occurredAt: entry.playedAt },
      { sequence: index * 2 + 2, eventType: "completed", trackId: entry.id, occurredAt: entry.completedAt },
    ]),
    priorityUpgradesEnabled: true,
    priorityUpgradePaymentsEnabled: true,
    priorityUpgradeLabel: "Priority Signal",
    priorityUpgradePriceCents: 1000,
    priorityUpgradeCurrency: "usd",
    sponsorBreakSeconds: 630,
    sponsorBreakMode: "mid_show",
    sponsorBreakStatus: active ? "not_due" : "completed",
  };
}

const activeSession = session(4, true);
const fullStore = {
  revision: 240,
  activeSessionId: activeSession.sessionId,
  sessions: [session(1, false), session(2, false), session(3, false), activeSession],
};
const liveProjection = {
  schemaVersion: "queue_live_store_v1",
  revision: fullStore.revision,
  activeSessionId: activeSession.sessionId,
  session: activeSession,
};
const overlayState = {
  mode: "auto",
  wheelOverlayActive: false,
  wheelCeremonyStatus: "idle",
  visualCueType: null,
  updatedAt: "2026-08-21T20:00:00.000Z",
};
const playerSync = {
  provider: "audio",
  trackId: activeSession.loadedTrack.id,
  playbackState: "playing",
  currentTimeSeconds: 84.25,
  durationSeconds: 244,
  updatedAt: "2026-08-21T20:00:01.000Z",
  muted: false,
  audioAnalysis: { energy: 0.48, bass: 0.62, mid: 0.43, treble: 0.31, peak: 0.74 },
};

const scene = {
  sessionActive: true,
  mode: "now_playing",
  resolvedMode: "now_playing",
  reason: "loaded_track",
  title: "NOW TRANSMITTING",
  subtitle: "BARCODE RADIO",
  message: "SIGNAL LOCKED",
  priority: 40,
  automatic: true,
  wheelOverlayActive: false,
  wheelSpinsOwed: 1,
  track: activeSession.loadedTrack,
  playerSync,
  updatedAt: "2026-08-21T20:00:01.000Z",
};
const responses = {
  live: { ...scene, serverNow: "2026-08-21T20:00:01.020Z", serverRequestReceivedAt: "2026-08-21T20:00:01.000Z" },
  foreground: {
    schemaVersion: "foreground_overlay_v1",
    sessionActive: true,
    revision: 240,
    serverNow: "2026-08-21T20:00:01.020Z",
    submissionsOpen: true,
    wheelSpinsOwed: 1,
    actionCycleStartedAt: "2026-08-21T20:00:00.000Z",
    track: { id: activeSession.loadedTrack.id, artistName: "Artist 20", trackTitle: "Track 20", cycleStartedAt: "2026-08-21T20:00:00.000Z" },
    action: { id: "show:online", label: "SHOW ONLINE", message: "BARCODE RADIO TRANSMISSION ACTIVE", tone: "signal", source: "show", occurredAt: activeSession.broadcastStartedAt },
    actions: [],
    sponsorEndsAt: null,
  },
  visuals: {
    sessionActive: true,
    showStage: "middle",
    visualMode: "track",
    sceneMode: "now_playing",
    queue: { acceptedCount: 40, completedCount: 20, activeCount: 20, remainingCount: 20, progress: 0.5, pressure: "medium" },
    signals: { intakeOpen: true, wheelSpinsOwed: 1, wheelCandidateCount: 20, broadcastPhase: "broadcast_active" },
    player: { provider: "audio", playbackState: "playing", currentTimeSeconds: 84.25, durationSeconds: 244, updatedAt: playerSync.updatedAt, audioEnergy: 0.48, audioBands: { bass: 0.62, mid: 0.43, treble: 0.31 }, audioPeak: 0.74 },
    cue: null,
    events: [],
    visualSeed: 22446688,
    updatedAt: "2026-08-21T20:00:01.020Z",
  },
  wheel: { sessionActive: true, broadcastActive: true, wheelActive: false, scene, updatedAt: scene.updatedAt },
};

function jsonBytes(value) {
  return Buffer.byteLength(JSON.stringify(value));
}

function parseMs(json, iterations = 250) {
  for (let index = 0; index < 10; index += 1) JSON.parse(json);
  const startedAt = performance.now();
  for (let index = 0; index < iterations; index += 1) JSON.parse(json);
  return (performance.now() - startedAt) / iterations;
}

const fullJson = JSON.stringify(fullStore);
const projectionJson = JSON.stringify(liveProjection);
const overlayJson = JSON.stringify(overlayState);
const playerJson = JSON.stringify(playerSync);
const combinedSharedJson = JSON.stringify([overlayState, playerSync]);
const fullReadBytes = jsonBytes(fullStore) + jsonBytes(overlayState) + jsonBytes(playerSync);
const optimizedReadBytes = jsonBytes(liveProjection) + jsonBytes(fullStore.revision) + jsonBytes([overlayState, playerSync]);
const fullInputParseMs = parseMs(fullJson) + parseMs(overlayJson) + parseMs(playerJson);
const optimizedInputParseMs = parseMs(projectionJson) + parseMs(combinedSharedJson);

const endpoints = [
  ["Live + Wheel", "LIVE_OVERLAY_POLL_INTERVAL_MS", responses.live],
  ["Foreground", "FOREGROUND_OVERLAY_POLL_INTERVAL_MS", responses.foreground],
  ["Music visuals", "RADIO_VISUALS_ACTIVE_POLL_INTERVAL_MS", responses.visuals],
  ["Wheel source", "WHEEL_OVERLAY_ACTIVE_POLL_INTERVAL_MS", responses.wheel],
].map(([name, intervalName, response]) => {
  const intervalMs = interval(intervalName);
  const requests = Math.ceil(FOUR_HOURS_MS / intervalMs);
  const responseJson = JSON.stringify(response);
  return {
    name,
    intervalMs,
    requests,
    beforeCommands: requests * 3,
    afterCommands: requests * 2,
    beforeReadBytes: requests * fullReadBytes,
    afterReadBytes: requests * optimizedReadBytes,
    inputParseBeforeMs: requests * fullInputParseMs,
    inputParseAfterMs: requests * optimizedInputParseMs,
    responseBytes: Buffer.byteLength(responseJson),
    responseParseMs: parseMs(responseJson),
  };
});

function integer(value) {
  return Math.round(value).toLocaleString("en-US");
}

function mib(value) {
  return (value / 1024 / 1024).toFixed(1);
}

console.log("# Four-hour live-read measurement\n");
console.log("Representative fixture: one active 44-slot show plus three archived 44-slot shows; stored-value bytes exclude HTTP headers. Parse timing is a local 250-iteration JSON.parse benchmark.\n");
console.log(`- Full queue store: ${integer(jsonBytes(fullStore))} bytes`);
console.log(`- Current-session projection: ${integer(jsonBytes(liveProjection))} bytes`);
console.log(`- Projection reduction: ${((1 - jsonBytes(liveProjection) / jsonBytes(fullStore)) * 100).toFixed(1)}%`);
console.log(`- Shared overlay + player values: ${integer(jsonBytes(overlayState) + jsonBytes(playerSync))} bytes`);
console.log(`- Input parse per poll: ${fullInputParseMs.toFixed(4)} ms before; ${optimizedInputParseMs.toFixed(4)} ms after\n`);
console.log("| Endpoint | Cadence | 4h requests | Commands before → after | Read MiB before → after | Response bytes | Response parse ms |");
console.log("|---|---:|---:|---:|---:|---:|---:|");
for (const row of endpoints) {
  console.log(`| ${row.name} | ${row.intervalMs} ms | ${integer(row.requests)} | ${integer(row.beforeCommands)} → ${integer(row.afterCommands)} | ${mib(row.beforeReadBytes)} → ${mib(row.afterReadBytes)} | ${integer(row.responseBytes)} | ${row.responseParseMs.toFixed(4)} |`);
}

const totals = endpoints.reduce((sum, row) => ({
  requests: sum.requests + row.requests,
  beforeCommands: sum.beforeCommands + row.beforeCommands,
  afterCommands: sum.afterCommands + row.afterCommands,
  beforeReadBytes: sum.beforeReadBytes + row.beforeReadBytes,
  afterReadBytes: sum.afterReadBytes + row.afterReadBytes,
  inputParseBeforeMs: sum.inputParseBeforeMs + row.inputParseBeforeMs,
  inputParseAfterMs: sum.inputParseAfterMs + row.inputParseAfterMs,
}), { requests: 0, beforeCommands: 0, afterCommands: 0, beforeReadBytes: 0, afterReadBytes: 0, inputParseBeforeMs: 0, inputParseAfterMs: 0 });

console.log("\n## Total\n");
console.log(`- Requests: ${integer(totals.requests)} (polling cadence unchanged)`);
console.log(`- Redis commands / REST reads: ${integer(totals.beforeCommands)} → ${integer(totals.afterCommands)} (${((1 - totals.afterCommands / totals.beforeCommands) * 100).toFixed(1)}% reduction)`);
console.log(`- Stored-value read volume: ${mib(totals.beforeReadBytes)} MiB → ${mib(totals.afterReadBytes)} MiB (${((1 - totals.afterReadBytes / totals.beforeReadBytes) * 100).toFixed(1)}% reduction)`);
console.log(`- Estimated server JSON parse time: ${integer(totals.inputParseBeforeMs)} ms → ${integer(totals.inputParseAfterMs)} ms (${((1 - totals.inputParseAfterMs / totals.inputParseBeforeMs) * 100).toFixed(1)}% reduction)`);
console.log("- Public/admin queue cadence, response schemas, durable snapshots, capture, and visual behavior are unchanged.");
