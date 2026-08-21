import type { RadioVisualCue } from "./radio-visuals-cues";
import type { RadioAudioBridgeSignal } from "./radio-audio-bridge";
import { hashRadioVisualToken } from "./radio-visuals-events";
import type { RadioVisualsShowStage, RadioVisualsSnapshot } from "./radio-visuals-resolver";

export const RADIO_VISUALS_CHROMA_KEY = "#ff5a00";
export const RADIO_VISUALS_WHEEL_CENTER_Y_RATIO = 0.375;
export const RADIO_VISUALS_EFFECT_STAGE_ASPECT_RATIO = 3 / 4;

export interface RadioVisualEffectStageBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function radioVisualsEffectStageBounds(sourceWidth: number, sourceHeight: number): RadioVisualEffectStageBounds {
  const safeWidth = Math.max(1, Number.isFinite(sourceWidth) ? sourceWidth : 1);
  const safeHeight = Math.max(1, Number.isFinite(sourceHeight) ? sourceHeight : 1);
  const heightLimitedWidth = safeHeight * RADIO_VISUALS_EFFECT_STAGE_ASPECT_RATIO;
  const width = Math.min(safeWidth, heightLimitedWidth);
  const height = width / RADIO_VISUALS_EFFECT_STAGE_ASPECT_RATIO;
  return {
    x: (safeWidth - width) / 2,
    y: (safeHeight - height) / 2,
    width,
    height,
  };
}

export interface RadioVisualsWheelBand {
  innerCenterRatio: number;
  outerCenterRatio: number;
  edgeOnly: boolean;
  maxRings: number;
}

/**
 * Hard Wheel geometry lives outside the rotating display labels. Small wheels
 * use a thin broken rim because their larger labels leave no reliable full
 * annulus; larger counts keep the dense outer band with no upper cutoff.
 */
export function radioVisualsWheelBand(input: number | null | undefined): RadioVisualsWheelBand {
  if (typeof input !== "number" || !Number.isFinite(input)) {
    return { innerCenterRatio: 0.49, outerCenterRatio: 0.493, edgeOnly: true, maxRings: 1 };
  }
  const count = Math.max(0, Math.floor(input));
  if (count === 0) return { innerCenterRatio: 0.43, outerCenterRatio: 0.478, edgeOnly: false, maxRings: 7 };
  if (count <= 8) return { innerCenterRatio: 0.49, outerCenterRatio: 0.493, edgeOnly: true, maxRings: 1 };
  if (count <= 12) return { innerCenterRatio: 0.47, outerCenterRatio: 0.478, edgeOnly: false, maxRings: 2 };
  if (count <= 24) return { innerCenterRatio: 0.456, outerCenterRatio: 0.478, edgeOnly: false, maxRings: 4 };
  return { innerCenterRatio: 0.45, outerCenterRatio: 0.478, edgeOnly: false, maxRings: 7 };
}

export interface RadioVisualMusicSignal {
  source: "analyser" | "timeline" | "windows_loopback";
  bpm: number;
  energy: number;
  bass: number;
  mid: number;
  treble: number;
  beat: number;
  accent: number;
  peak: number;
  /** Zero-to-one position through the current track, or a deterministic long-form fallback cycle. */
  progress: number;
  /** Zero-to-one position through the current four-bar phrase. */
  phrase: number;
}

export interface RadioVisualsPalette {
  primary: string;
  secondary: string;
  highlight: string;
  shadow: string;
}

const BRAND_PALETTES: RadioVisualsPalette[] = [
  { primary: "#00ff88", secondary: "#7c3aed", highlight: "#e0e0e0", shadow: "#050505" },
  { primary: "#7c3aed", secondary: "#00ff88", highlight: "#ffffff", shadow: "#050505" },
  { primary: "#00ff88", secondary: "#22d3ee", highlight: "#a78bfa", shadow: "#030303" },
  { primary: "#a78bfa", secondary: "#00ff88", highlight: "#e0e0e0", shadow: "#050505" },
  { primary: "#7c3aed", secondary: "#00ff88", highlight: "#a78bfa", shadow: "#020202" },
];

const STAGE_INTENSITY: Record<RadioVisualsShowStage, number> = {
  standby: 0.06,
  intake: 0.18,
  early: 0.24,
  middle: 0.32,
  late: 0.4,
  final: 0.48,
  complete: 0.13,
};

export const RADIO_VISUAL_MUSIC_SCENES = [
  "edge_spectrum",
  "oscilloscope_ribbons",
  "tape_feedback",
  "matrix_rain",
  "ascii_terminal",
  "pixel_sort_storm",
  "lightning_switchyard",
  "laser_lattice",
  "particle_pressure",
  "signal_constellation",
] as const;

export type RadioVisualMusicScene = (typeof RADIO_VISUAL_MUSIC_SCENES)[number];

export interface RadioVisualAudioDrives {
  presence: number;
  /** Broadband mass keeps a loud track visible without pretending every band is loud. */
  body: number;
  bass: number;
  mid: number;
  treble: number;
  impact: number;
  bassPulse: number;
  midPulse: number;
  treblePulse: number;
  build: number;
  progress: number;
  phrase: number;
}

export interface RadioVisualAudioReactionState {
  bassSlow: number;
  midSlow: number;
  trebleSlow: number;
  bassOnset: number;
  midOnset: number;
  trebleOnset: number;
  buildMemory: number;
}

export interface RadioVisualAudioReactionFrame {
  state: RadioVisualAudioReactionState;
  drives: RadioVisualAudioDrives;
}

export const RADIO_VISUAL_FALLBACK_RHYTHMS = [
  "sub_bloom",
  "neon_breaks",
  "ghost_dub",
  "fever_drive",
  "glass_rain",
  "machine_funk",
] as const;

export type RadioVisualFallbackRhythm = (typeof RADIO_VISUAL_FALLBACK_RHYTHMS)[number];

interface RadioVisualFallbackRhythmProfile {
  bpmMin: number;
  bpmSpan: number;
  bassBias: number;
  midBias: number;
  trebleBias: number;
  kick: number;
  snare: number;
  hats: number;
  density: number;
  swing: number;
}

const FALLBACK_RHYTHM_PROFILES: Record<RadioVisualFallbackRhythm, RadioVisualFallbackRhythmProfile> = {
  sub_bloom: { bpmMin: 84, bpmSpan: 14, bassBias: 0.18, midBias: -0.04, trebleBias: -0.08, kick: 0.72, snare: 0.14, hats: 0.08, density: 0.24, swing: 0.08 },
  neon_breaks: { bpmMin: 118, bpmSpan: 20, bassBias: 0.04, midBias: 0.1, trebleBias: 0.16, kick: 0.46, snare: 0.48, hats: 0.66, density: 0.68, swing: 0.2 },
  ghost_dub: { bpmMin: 86, bpmSpan: 18, bassBias: 0.22, midBias: -0.01, trebleBias: -0.12, kick: 0.64, snare: 0.18, hats: 0.1, density: 0.2, swing: 0.14 },
  fever_drive: { bpmMin: 132, bpmSpan: 16, bassBias: 0.1, midBias: 0.14, trebleBias: 0.16, kick: 0.62, snare: 0.44, hats: 0.72, density: 0.8, swing: 0.06 },
  glass_rain: { bpmMin: 104, bpmSpan: 20, bassBias: -0.05, midBias: 0.1, trebleBias: 0.24, kick: 0.28, snare: 0.38, hats: 0.82, density: 0.74, swing: 0.12 },
  machine_funk: { bpmMin: 96, bpmSpan: 22, bassBias: 0.12, midBias: 0.2, trebleBias: 0.05, kick: 0.5, snare: 0.6, hats: 0.4, density: 0.54, swing: 0.32 },
};

export const RADIO_VISUAL_AMBIENT_MOMENT_TYPES = [
  "violet_bloom",
  "signal_ripple",
  "shadow_pass",
  "particle_lift",
  "barcode_shimmer",
  "prism_drift",
  "ribbon_sweep",
] as const;

export type RadioVisualAmbientMomentType = (typeof RADIO_VISUAL_AMBIENT_MOMENT_TYPES)[number];

export interface RadioVisualAmbientMoment {
  type: RadioVisualAmbientMomentType;
  progress: number;
  envelope: number;
  intensity: number;
  seed: number;
}

export function clampVisualValue(value: number, minimum = 0, maximum = 1): number {
  return Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : minimum));
}

export function radioVisualMusicScene(seed: number): RadioVisualMusicScene {
  const safeSeed = Number.isFinite(seed) ? Math.trunc(seed) : 0;
  return RADIO_VISUAL_MUSIC_SCENES[hashRadioVisualToken(`music-scene:${safeSeed}`) % RADIO_VISUAL_MUSIC_SCENES.length];
}

export function radioVisualAudioDrives(signal: RadioVisualMusicSignal): RadioVisualAudioDrives {
  const presence = clampVisualValue(Math.max(signal.energy, signal.bass, signal.mid, signal.treble, signal.peak));
  const body = clampVisualValue(Math.pow(clampVisualValue(signal.energy), 0.78) * 1.04);
  const bass = clampVisualValue(Math.pow(clampVisualValue(signal.bass), 0.76) * 0.92 + body * 0.08);
  const mid = clampVisualValue(Math.pow(clampVisualValue(signal.mid), 0.8) * 0.92 + body * 0.07);
  const treble = clampVisualValue(Math.pow(clampVisualValue(signal.treble), 0.82) * 0.94 + body * 0.05);
  const progress = clampVisualValue(signal.progress);
  const phrase = clampVisualValue(signal.phrase);
  const phraseBuild = phrase * phrase * (3 - 2 * phrase);
  return {
    presence,
    body,
    bass,
    mid,
    treble,
    impact: clampVisualValue(Math.max(signal.peak, signal.beat * 0.86, signal.accent * 0.72)),
    bassPulse: clampVisualValue(bass * 0.32 + signal.beat * (0.46 + bass * 0.34)),
    midPulse: clampVisualValue(mid * 0.3 + signal.accent * (0.42 + mid * 0.32)),
    treblePulse: clampVisualValue(treble * 0.28 + Math.max(signal.accent, signal.peak * 0.76) * (0.4 + treble * 0.3)),
    build: clampVisualValue(0.12 + body * 0.28 + progress * 0.32 + phraseBuild * 0.28),
    progress,
    phrase,
  };
}

export function radioVisualAudioReactionInitialState(): RadioVisualAudioReactionState {
  return {
    bassSlow: 0.1,
    midSlow: 0.1,
    trebleSlow: 0.08,
    bassOnset: 0,
    midOnset: 0,
    trebleOnset: 0,
    buildMemory: 0.12,
  };
}

/** Advance the fast band-onset and slow structural-build envelopes by one frame. */
export function advanceRadioVisualAudioReaction(
  state: RadioVisualAudioReactionState,
  signal: RadioVisualMusicSignal,
  elapsedMs: number,
): RadioVisualAudioReactionFrame {
  const base = radioVisualAudioDrives(signal);
  const safeElapsedMs = clampVisualValue(elapsedMs, 0, 1_000);
  const slowLerp = 1 - Math.exp(-safeElapsedMs / 720);
  const onsetDecay = Math.exp(-safeElapsedMs / 260);
  const bassSlow = state.bassSlow + (signal.bass - state.bassSlow) * slowLerp;
  const midSlow = state.midSlow + (signal.mid - state.midSlow) * slowLerp;
  const trebleSlow = state.trebleSlow + (signal.treble - state.trebleSlow) * slowLerp;
  const bassOnset = Math.max(
    state.bassOnset * onsetDecay,
    clampVisualValue((signal.bass - state.bassSlow) * 3.8 + signal.beat * 0.34),
  );
  const midOnset = Math.max(
    state.midOnset * onsetDecay,
    clampVisualValue((signal.mid - state.midSlow) * 3.5 + signal.accent * 0.28),
  );
  const trebleOnset = Math.max(
    state.trebleOnset * onsetDecay,
    clampVisualValue((signal.treble - state.trebleSlow) * 3.2 + signal.accent * 0.22 + signal.peak * 0.16),
  );
  const buildTarget = clampVisualValue(
    base.build * 0.62
    + (bassSlow + midSlow + trebleSlow) / 3 * 0.25
    + Math.max(bassOnset, midOnset, trebleOnset) * 0.13,
  );
  const buildResponseMs = buildTarget > state.buildMemory ? 340 : 1_650;
  const buildMemory = state.buildMemory
    + (buildTarget - state.buildMemory) * (1 - Math.exp(-safeElapsedMs / buildResponseMs));
  return {
    state: { bassSlow, midSlow, trebleSlow, bassOnset, midOnset, trebleOnset, buildMemory },
    drives: {
      ...base,
      bassPulse: Math.max(base.bassPulse, bassOnset),
      midPulse: Math.max(base.midPulse, midOnset),
      treblePulse: Math.max(base.treblePulse, trebleOnset),
      build: clampVisualValue(Math.max(base.build * 0.72, buildMemory)),
    },
  };
}

export function radioVisualsPalette(snapshot: RadioVisualsSnapshot): RadioVisualsPalette {
  if (snapshot.visualMode === "wheel") return { primary: "#00ff88", secondary: "#e0e0e0", highlight: "#a78bfa", shadow: "#030303" };
  if (snapshot.visualMode === "system") return { primary: "#ff00aa", secondary: "#00ff88", highlight: "#ffffff", shadow: "#020202" };
  if (snapshot.visualMode === "sponsor") return { primary: "#7c3aed", secondary: "#00ff88", highlight: "#ffffff", shadow: "#050505" };
  return BRAND_PALETTES[Math.abs(snapshot.visualSeed) % BRAND_PALETTES.length];
}

export function radioVisualsIntensity(snapshot: RadioVisualsSnapshot): number {
  let intensity = STAGE_INTENSITY[snapshot.showStage];
  if (snapshot.visualMode === "wheel") intensity = 0.58;
  if (snapshot.visualMode === "system") intensity = 0.44;
  if (snapshot.visualMode === "sponsor") intensity = 0.3;
  if (snapshot.player?.playbackState === "playing") intensity += 0.075;
  if (snapshot.player?.playbackState === "paused") intensity -= 0.045;
  if (snapshot.queue.pressure === "medium") intensity += 0.018;
  if (snapshot.queue.pressure === "high") intensity += 0.05;
  if (snapshot.queue.pressure === "max") intensity += 0.085;
  if (snapshot.cue?.type === "party") intensity = Math.max(intensity, 0.58);
  if (snapshot.cue?.type === "shadow") intensity = Math.max(intensity, 0.52);
  if (snapshot.cue?.type === "signal_breach") intensity = Math.max(intensity, 0.7);
  if (snapshot.cue?.type === "blackout") intensity = Math.max(intensity, 0.84);
  if (snapshot.cue?.type === "lightning") intensity = Math.max(intensity, 0.78);
  return clampVisualValue(intensity, 0.025, 0.92);
}

export function radioVisualsMotionRate(snapshot: RadioVisualsSnapshot): number {
  if (snapshot.player?.playbackState === "playing") return 1;
  if (snapshot.player?.playbackState === "paused") return 0.14;
  if (snapshot.showStage === "standby" || snapshot.showStage === "complete") return 0.16;
  if (snapshot.showStage === "final") return 0.48;
  return 0.38;
}

function seededUnit(seed: number, salt: number): number {
  return (hashRadioVisualToken(`${seed}:${salt}`) % 10_000) / 10_000;
}

export function radioVisualFallbackRhythm(seed: number): RadioVisualFallbackRhythm {
  const safeSeed = Number.isFinite(seed) ? Math.trunc(seed) : 0;
  return RADIO_VISUAL_FALLBACK_RHYTHMS[hashRadioVisualToken(`rhythm:${safeSeed}`) % RADIO_VISUAL_FALLBACK_RHYTHMS.length];
}

function rhythmPulse(phase: number, power: number): number {
  const cycle = ((phase % 1) + 1) % 1;
  return Math.pow((Math.cos(cycle * Math.PI * 2) + 1) / 2, power);
}

function shapeLoopbackLevel(value: number): number {
  const bounded = clampVisualValue(value);
  // Preserve quiet-speaker visibility without flattening every loud passage at
  // the top of the range. The former 1.3x power curve saturated near 0.68.
  return clampVisualValue((1 - Math.exp(-bounded * 2.1)) * 0.72 + Math.sqrt(bounded) * 0.28);
}

export function radioVisualsMusicSignal(
  snapshot: RadioVisualsSnapshot,
  playbackSeconds: number,
  transportSeconds: number,
  bridgeSignal: RadioAudioBridgeSignal | null = null,
  trackElapsedSeconds?: number,
): RadioVisualMusicSignal {
  const seed = snapshot.visualSeed;
  const fallbackRhythm = radioVisualFallbackRhythm(seed);
  const rhythmProfile = FALLBACK_RHYTHM_PROFILES[fallbackRhythm];
  const bpm = rhythmProfile.bpmMin + Math.round(seededUnit(seed, 30_001) * rhythmProfile.bpmSpan);
  const playing = snapshot.player?.playbackState === "playing";
  const paused = snapshot.player?.playbackState === "paused";
  const automaticTrack = snapshot.visualMode === "track" && !snapshot.player;
  const anchoredTrackSeconds = typeof trackElapsedSeconds === "number" && Number.isFinite(trackElapsedSeconds)
    ? Math.max(0, trackElapsedSeconds)
    : Math.max(0, transportSeconds);
  const clockSeconds = playing && Number.isFinite(playbackSeconds)
    ? Math.max(0, playbackSeconds)
    : automaticTrack
      ? anchoredTrackSeconds * (0.9 + rhythmProfile.swing * 0.22)
      : Math.max(0, transportSeconds) * (paused ? 0.12 : snapshot.sessionActive ? 0.46 : 0.18);
  const beatPosition = clockSeconds * bpm / 60;
  const beat = rhythmPulse(beatPosition, 4.1 + rhythmProfile.kick * 2.2);
  const eighth = rhythmPulse(beatPosition * 2 + seededUnit(seed, 30_002) * 0.16 + rhythmProfile.swing * 0.18, 6.2 + rhythmProfile.snare * 2.4);
  const sixteenthPosition = beatPosition * 4;
  const sixteenthStep = Math.floor(sixteenthPosition) % 16;
  const bar = Math.floor(beatPosition / 4);
  const strongStep = sixteenthStep % 4 === 0;
  const patternThreshold = strongStep ? 0.22 : 0.92 - rhythmProfile.density * 0.55;
  const patternHit = seededUnit(seed + bar, 30_100 + sixteenthStep) > patternThreshold;
  const sixteenth = patternHit ? rhythmPulse(sixteenthPosition + rhythmProfile.swing * (sixteenthStep % 2 ? 0.2 : 0), 7.4 + rhythmProfile.hats * 2.2) : 0;
  const barBreath = 0.5 + 0.5 * Math.sin(beatPosition / 4 * Math.PI * 2 + seededUnit(seed, 30_003) * Math.PI * 2);
  const knownDuration = snapshot.player?.durationSeconds;
  const fallbackProgressBeats = 384 + Math.floor(seededUnit(seed, 30_004) * 256);
  const fallbackProgressSeconds = snapshot.player && Number.isFinite(playbackSeconds)
    ? Math.max(0, playbackSeconds)
    : automaticTrack ? anchoredTrackSeconds : clockSeconds;
  const fallbackProgressPosition = fallbackProgressSeconds * bpm / 60;
  const progress = typeof knownDuration === "number" && Number.isFinite(knownDuration) && knownDuration > 0
    ? clampVisualValue(playbackSeconds / knownDuration)
    : clampVisualValue(fallbackProgressPosition / fallbackProgressBeats);
  const phrase = ((beatPosition % 16) + 16) % 16 / 16;
  const activity = playing ? 1 : paused ? 0.3 : automaticTrack ? 0.84 : snapshot.sessionActive ? 0.46 : 0.2;
  const timelineBass = clampVisualValue((0.22 + rhythmProfile.bassBias + beat * (0.32 + rhythmProfile.kick * 0.38) + barBreath * 0.12) * activity, 0.04, 0.96);
  const timelineMid = clampVisualValue((0.24 + rhythmProfile.midBias + beat * 0.12 + eighth * (0.14 + rhythmProfile.snare * 0.34) + barBreath * 0.13) * activity, 0.04, 0.94);
  const timelineTreble = clampVisualValue((0.18 + rhythmProfile.trebleBias + eighth * 0.12 + sixteenth * (0.14 + rhythmProfile.hats * 0.42)) * activity, 0.03, 0.96);
  const timelineEnergy = clampVisualValue(timelineBass * 0.44 + timelineMid * 0.34 + timelineTreble * 0.22, 0.05, 0.88);
  const hasAnalyser = typeof snapshot.player?.audioEnergy === "number"
    && typeof snapshot.player.audioBands?.bass === "number"
    && typeof snapshot.player.audioBands.mid === "number"
    && typeof snapshot.player.audioBands.treble === "number";
  const analyserWeight = hasAnalyser && playing ? 0.78 : 0;
  const bass = hasAnalyser
    ? clampVisualValue(timelineBass * (1 - analyserWeight) + snapshot.player!.audioBands!.bass * analyserWeight)
    : timelineBass;
  const mid = hasAnalyser
    ? clampVisualValue(timelineMid * (1 - analyserWeight) + snapshot.player!.audioBands!.mid * analyserWeight)
    : timelineMid;
  const treble = hasAnalyser
    ? clampVisualValue(timelineTreble * (1 - analyserWeight) + snapshot.player!.audioBands!.treble * analyserWeight)
    : timelineTreble;
  const energy = hasAnalyser
    ? clampVisualValue(timelineEnergy * (1 - analyserWeight) + snapshot.player!.audioEnergy! * analyserWeight, 0.04, 0.96)
    : timelineEnergy;
  const peak = hasAnalyser
    ? clampVisualValue(snapshot.player?.audioPeak ?? 0)
    : Math.max(beat * (0.42 + rhythmProfile.kick * 0.4), eighth * rhythmProfile.snare * 0.52, sixteenth * rhythmProfile.hats * 0.58) * activity;
  const loopbackLevel = bridgeSignal
    ? Math.max(bridgeSignal.energy, bridgeSignal.bass, bridgeSignal.mid, bridgeSignal.treble, bridgeSignal.peak)
    : 0;
  const hasLoopback = Boolean(
    bridgeSignal?.captureActive
    && bridgeSignal.warmedUp
    && (!bridgeSignal.silence || loopbackLevel >= 0.006),
  );
  if (hasLoopback && bridgeSignal) {
    const confidence = clampVisualValue(bridgeSignal.tempoConfidence);
    const liveWeight = 0.96;
    const liveEnergy = shapeLoopbackLevel(bridgeSignal.energy);
    const liveBass = shapeLoopbackLevel(bridgeSignal.bass);
    const liveMid = shapeLoopbackLevel(bridgeSignal.mid);
    const liveTreble = shapeLoopbackLevel(bridgeSignal.treble);
    const livePeak = shapeLoopbackLevel(bridgeSignal.peak);
    const liveBeat = shapeLoopbackLevel(bridgeSignal.beat);
    return {
      source: "windows_loopback",
      bpm: confidence >= 0.28 ? bridgeSignal.bpm : bpm,
      energy: clampVisualValue(liveEnergy * liveWeight + timelineEnergy * (1 - liveWeight), 0.025, 0.98),
      bass: clampVisualValue(liveBass * liveWeight + timelineBass * (1 - liveWeight)),
      mid: clampVisualValue(liveMid * liveWeight + timelineMid * (1 - liveWeight)),
      treble: clampVisualValue(liveTreble * liveWeight + timelineTreble * (1 - liveWeight)),
      beat: clampVisualValue(Math.max(liveBeat, beat * 0.08) * (0.72 + liveBass * 0.28)),
      accent: clampVisualValue(Math.max(liveBeat * 0.78, livePeak * 0.62, liveTreble * 0.24)),
      peak: livePeak,
      progress,
      phrase,
    };
  }
  return {
    source: hasAnalyser ? "analyser" : "timeline",
    bpm,
    energy,
    bass,
    mid,
    treble,
    beat: clampVisualValue(beat * (0.58 + bass * 0.42) * activity),
    accent: clampVisualValue(Math.max(beat * 0.68, eighth * 0.32, sixteenth * 0.46, peak * 0.42) * activity),
    peak,
    progress,
    phrase,
  };
}

export function radioVisualAmbientMoment(seed: number, nowMs: number, sessionActive: boolean): RadioVisualAmbientMoment | null {
  if (!Number.isFinite(nowMs)) return null;
  const cycleMs = sessionActive ? 17_000 : 25_000;
  const cycle = Math.floor(nowMs / cycleMs);
  const momentSeed = hashRadioVisualToken(`${seed}:ambient:${cycle}`);
  const delayMs = (sessionActive ? 1_000 : 2_500) + seededUnit(momentSeed, 1) * (sessionActive ? 4_500 : 7_500);
  const durationMs = (sessionActive ? 5_500 : 4_200) + seededUnit(momentSeed, 2) * (sessionActive ? 5_000 : 4_800);
  const elapsedMs = nowMs - cycle * cycleMs - delayMs;
  if (elapsedMs < 0 || elapsedMs >= durationMs) return null;
  const progress = clampVisualValue(elapsedMs / durationMs);
  const envelope = Math.pow(Math.sin(progress * Math.PI), 1.35);
  const type = RADIO_VISUAL_AMBIENT_MOMENT_TYPES[momentSeed % RADIO_VISUAL_AMBIENT_MOMENT_TYPES.length];
  return {
    type,
    progress,
    envelope,
    intensity: (sessionActive ? 0.16 : 0.075) + seededUnit(momentSeed, 3) * (sessionActive ? 0.15 : 0.065),
    seed: momentSeed,
  };
}

export function radioVisualCueProgress(cue: RadioVisualCue | null, nowMs: number): number | null {
  if (!cue) return null;
  const startedAtMs = Date.parse(cue.startedAt);
  const expiresAtMs = Date.parse(cue.expiresAt);
  if (!Number.isFinite(startedAtMs) || !Number.isFinite(expiresAtMs) || expiresAtMs <= startedAtMs || nowMs >= expiresAtMs) return null;
  return clampVisualValue((nowMs - startedAtMs) / (expiresAtMs - startedAtMs));
}

function smoothstep(value: number): number {
  const bounded = clampVisualValue(value);
  return bounded * bounded * (3 - 2 * bounded);
}

export function radioVisualCueEnvelope(cue: RadioVisualCue | null, nowMs: number): number {
  const progress = radioVisualCueProgress(cue, nowMs);
  if (progress === null) return 0;
  const attackEnd = cue?.type === "lightning" ? 0.08 : cue?.type === "blackout" ? 0.2 : 0.14;
  const releaseStart = cue?.type === "lightning" ? 0.72 : cue?.type === "blackout" ? 0.68 : 0.78;
  if (progress < attackEnd) return smoothstep(progress / attackEnd);
  if (progress > releaseStart) return smoothstep((1 - progress) / (1 - releaseStart));
  return 1;
}
