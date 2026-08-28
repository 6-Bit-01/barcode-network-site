export const RADIO_AUDIO_BRIDGE_SCHEMA_VERSION = "barcode_audio_signal_v1" as const;
export const RADIO_AUDIO_BRIDGE_FIXED_REFERENCE_CALIBRATION = "fixed_reference_v1" as const;
export const RADIO_AUDIO_BRIDGE_ANALYSIS_CALIBRATION = "adaptive_reference_v2" as const;
export const RADIO_AUDIO_BRIDGE_URL = "http://127.0.0.1:43120/v1/signal";
export const RADIO_AUDIO_BRIDGE_POLL_INTERVAL_MS = 40;
export const RADIO_AUDIO_BRIDGE_RETRY_INTERVAL_MS = 2_000;
export const RADIO_AUDIO_BRIDGE_STALE_AFTER_MS = 1_200;

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
    || tempoConfidence === null) return null;

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
