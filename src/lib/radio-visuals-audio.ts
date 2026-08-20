export interface RadioVisualAudioAnalysis {
  energy: number;
  bass: number;
  mid: number;
  treble: number;
  peak: number;
}

function frequencyBandRms(
  bins: ArrayLike<number>,
  sampleRate: number,
  fftSize: number,
  startHz: number,
  endHz: number,
): number {
  const binWidth = sampleRate / fftSize;
  const startIndex = Math.max(0, Math.floor(startHz / binWidth));
  const endIndex = Math.min(bins.length, Math.max(startIndex + 1, Math.ceil(endHz / binWidth)));
  let squared = 0;
  let count = 0;
  for (let index = startIndex; index < endIndex; index += 1) {
    const normalized = Math.min(255, Math.max(0, Number(bins[index]) || 0)) / 255;
    squared += normalized * normalized;
    count += 1;
  }
  return count > 0 ? Math.sqrt(squared / count) : 0;
}

export function analyzeRadioVisualFrequencyData(
  bins: ArrayLike<number>,
  sampleRate: number,
  fftSize: number,
): RadioVisualAudioAnalysis | null {
  if (!bins.length || !Number.isFinite(sampleRate) || sampleRate <= 0 || !Number.isFinite(fftSize) || fftSize <= 0) return null;
  const bass = frequencyBandRms(bins, sampleRate, fftSize, 30, 250);
  const mid = frequencyBandRms(bins, sampleRate, fftSize, 250, 2_400);
  const treble = frequencyBandRms(bins, sampleRate, fftSize, 2_400, Math.min(14_000, sampleRate / 2));
  let peak = 0;
  for (let index = 0; index < bins.length; index += 1) peak = Math.max(peak, Math.min(255, Math.max(0, Number(bins[index]) || 0)) / 255);
  const energy = Math.min(1, bass * 0.46 + mid * 0.34 + treble * 0.2);
  return { energy, bass, mid, treble, peak };
}

export function smoothRadioVisualAudioAnalysis(
  previous: RadioVisualAudioAnalysis | null,
  next: RadioVisualAudioAnalysis,
  amount = 0.34,
): RadioVisualAudioAnalysis {
  if (!previous) return next;
  const mix = Math.min(1, Math.max(0, Number.isFinite(amount) ? amount : 0.34));
  return {
    energy: previous.energy + (next.energy - previous.energy) * mix,
    bass: previous.bass + (next.bass - previous.bass) * mix,
    mid: previous.mid + (next.mid - previous.mid) * mix,
    treble: previous.treble + (next.treble - previous.treble) * mix,
    peak: Math.max(next.peak, previous.peak * (1 - mix * 0.72)),
  };
}
