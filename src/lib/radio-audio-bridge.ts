export const RADIO_AUDIO_BRIDGE_SCHEMA_VERSION = "barcode_audio_signal_v1" as const;
export const RADIO_AUDIO_BRIDGE_FIXED_REFERENCE_CALIBRATION = "fixed_reference_v1" as const;
export const RADIO_AUDIO_BRIDGE_ANALYSIS_CALIBRATION = "adaptive_reference_v2" as const;
export const RADIO_AUDIO_BRIDGE_PERCEPTUAL_FEATURES_VERSION = "perceptual_audio_v1" as const;
export const RADIO_AUDIO_BRIDGE_PERCEPTUAL_BAND_NAMES = [
  "subBass",
  "bass",
  "lowMid",
  "mid",
  "highMid",
  "presence",
  "brilliance",
  "air",
] as const;
export const RADIO_AUDIO_BRIDGE_URL = "http://127.0.0.1:43120/v1/signal";
export const RADIO_AUDIO_BRIDGE_POLL_INTERVAL_MS = 25;
export const RADIO_AUDIO_BRIDGE_RETRY_INTERVAL_MS = 2_000;
export const RADIO_AUDIO_BRIDGE_STALE_AFTER_MS = 1_200;

export type RadioAudioBridgePerceptualBandName = (typeof RADIO_AUDIO_BRIDGE_PERCEPTUAL_BAND_NAMES)[number];

export type RadioAudioBridgePerceptualBands = Record<RadioAudioBridgePerceptualBandName, number>;

export interface RadioAudioBridgePerceptualFeatures {
  version: typeof RADIO_AUDIO_BRIDGE_PERCEPTUAL_FEATURES_VERSION;
  levels: RadioAudioBridgePerceptualBands;
  onsets: RadioAudioBridgePerceptualBands;
  /** Log-frequency centroid, normalized to the analyser's usable spectrum. */
  spectralCentroid: number;
  /** Share of spectral power above 3 kHz. */
  brightness: number;
  /** Crest-based short-window dynamic contrast, independent of loudness. */
  dynamicRange: number;
  /** Bounded recent rate of distinct per-band arrivals. */
  transientDensity: number;
  /** Mid/side spread: zero is mono, one is maximally wide. */
  stereoWidth: number;
  /** Signed left/right balance: -1 left, 0 centered, 1 right. */
  stereoBalance: number;
  /** Sixteen bounded, signed program-shape samples; never raw audio. */
  waveform: number[];
}

export interface RadioAudioBridgeSignal {
  schemaVersion: typeof RADIO_AUDIO_BRIDGE_SCHEMA_VERSION;
  source: "windows_loopback";
  /** Absent only on the legacy full-scale 1.0.3 helper. */
  analysisCalibration?:
    | typeof RADIO_AUDIO_BRIDGE_FIXED_REFERENCE_CALIBRATION
    | typeof RADIO_AUDIO_BRIDGE_ANALYSIS_CALIBRATION;
  capturedAtUnixMs: number;
  sequence: number;
  captureActive: boolean;
  warmedUp: boolean;
  silence: boolean;
  energy: number;
  bass: number;
  mid: number;
  treble: number;
  peak: number;
  beat: number;
  bpm: number;
  tempoConfidence: number;
  /** Optional so installed v1 helpers and new browser code remain mutually compatible. */
  features?: RadioAudioBridgePerceptualFeatures;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function unitInterval(value: unknown): number | null {
  const numeric = finiteNumber(value);
  return numeric !== null && numeric >= 0 && numeric <= 1 ? numeric : null;
}

function signedUnitInterval(value: unknown): number | null {
  const numeric = finiteNumber(value);
  return numeric !== null && numeric >= -1 && numeric <= 1 ? numeric : null;
}

function normalizePerceptualBands(value: unknown): RadioAudioBridgePerceptualBands | null {
  const candidate = record(value);
  if (!candidate) return null;
  const entries = RADIO_AUDIO_BRIDGE_PERCEPTUAL_BAND_NAMES.map((name) => [name, unitInterval(candidate[name])] as const);
  if (entries.some(([, level]) => level === null)) return null;
  return Object.fromEntries(entries) as RadioAudioBridgePerceptualBands;
}

function normalizePerceptualFeatures(value: unknown): RadioAudioBridgePerceptualFeatures | null {
  const candidate = record(value);
  if (!candidate || candidate.version !== RADIO_AUDIO_BRIDGE_PERCEPTUAL_FEATURES_VERSION) return null;
  const levels = normalizePerceptualBands(candidate.levels);
  const onsets = normalizePerceptualBands(candidate.onsets);
  const spectralCentroid = unitInterval(candidate.spectralCentroid);
  const brightness = unitInterval(candidate.brightness);
  const dynamicRange = unitInterval(candidate.dynamicRange);
  const transientDensity = unitInterval(candidate.transientDensity);
  const stereoWidth = unitInterval(candidate.stereoWidth);
  const stereoBalance = signedUnitInterval(candidate.stereoBalance);
  const waveform = Array.isArray(candidate.waveform)
    && candidate.waveform.length === 16
    ? candidate.waveform.map(signedUnitInterval)
    : null;
  if (!levels
    || !onsets
    || spectralCentroid === null
    || brightness === null
    || dynamicRange === null
    || transientDensity === null
    || stereoWidth === null
    || stereoBalance === null
    || !waveform
    || waveform.some((sample) => sample === null)) return null;
  return {
    version: RADIO_AUDIO_BRIDGE_PERCEPTUAL_FEATURES_VERSION,
    levels,
    onsets,
    spectralCentroid,
    brightness,
    dynamicRange,
    transientDensity,
    stereoWidth,
    stereoBalance,
    waveform: waveform as number[],
  };
}

export function normalizeRadioAudioBridgeSignal(value: unknown): RadioAudioBridgeSignal | null {
  const candidate = record(value);
  if (!candidate
    || candidate.schemaVersion !== RADIO_AUDIO_BRIDGE_SCHEMA_VERSION
    || candidate.source !== "windows_loopback"
    || typeof candidate.captureActive !== "boolean"
    || typeof candidate.warmedUp !== "boolean"
    || typeof candidate.silence !== "boolean") return null;

  const analysisCalibration = candidate.analysisCalibration;
  if (analysisCalibration !== undefined
    && analysisCalibration !== RADIO_AUDIO_BRIDGE_FIXED_REFERENCE_CALIBRATION
    && analysisCalibration !== RADIO_AUDIO_BRIDGE_ANALYSIS_CALIBRATION) return null;

  const capturedAtUnixMs = finiteNumber(candidate.capturedAtUnixMs);
  const sequence = finiteNumber(candidate.sequence);
  const energy = unitInterval(candidate.energy);
  const bass = unitInterval(candidate.bass);
  const mid = unitInterval(candidate.mid);
  const treble = unitInterval(candidate.treble);
  const peak = unitInterval(candidate.peak);
  const beat = unitInterval(candidate.beat);
  const bpm = finiteNumber(candidate.bpm);
  const tempoConfidence = unitInterval(candidate.tempoConfidence);
  const features = candidate.features === undefined
    ? undefined
    : normalizePerceptualFeatures(candidate.features);
  if (capturedAtUnixMs === null
    || capturedAtUnixMs <= 0
    || sequence === null
    || !Number.isInteger(sequence)
    || sequence < 0
    || energy === null
    || bass === null
    || mid === null
    || treble === null
    || peak === null
    || beat === null
    || bpm === null
    || bpm < 40
    || bpm > 240
    || tempoConfidence === null
    || (candidate.features !== undefined && !features)) return null;

  return {
    schemaVersion: RADIO_AUDIO_BRIDGE_SCHEMA_VERSION,
    source: "windows_loopback",
    ...(analysisCalibration === RADIO_AUDIO_BRIDGE_FIXED_REFERENCE_CALIBRATION
      || analysisCalibration === RADIO_AUDIO_BRIDGE_ANALYSIS_CALIBRATION
      ? { analysisCalibration }
      : {}),
    capturedAtUnixMs,
    sequence,
    captureActive: candidate.captureActive,
    warmedUp: candidate.warmedUp,
    silence: candidate.silence,
    energy,
    bass,
    mid,
    treble,
    peak,
    beat,
    bpm,
    tempoConfidence,
    ...(features ? { features } : {}),
  };
}

export function freshRadioAudioBridgeSignal(
  signal: RadioAudioBridgeSignal | null,
  nowUnixMs = Date.now(),
  staleAfterMs = RADIO_AUDIO_BRIDGE_STALE_AFTER_MS,
): RadioAudioBridgeSignal | null {
  if (!signal || !Number.isFinite(nowUnixMs) || !Number.isFinite(staleAfterMs) || staleAfterMs <= 0) return null;
  const ageMs = nowUnixMs - signal.capturedAtUnixMs;
  return ageMs >= -2_000 && ageMs <= staleAfterMs ? signal : null;
}
