import type { RadioVisualMusicScene } from "./radio-visuals-engine";
import { radioVisualSeedForMusicFamily } from "./radio-visuals-selection";

export const RADIO_VISUAL_PREVIEW_DURATION_MS = 2_000;

// The Studio source polls once per second during a show. Keep the command
// available across several polls, then let the receiver own the exact two-second
// presentation window from the moment it first observes a new nonce.
export const RADIO_VISUAL_PREVIEW_DELIVERY_TTL_MS = 5_000;

export const RADIO_VISUAL_PREVIEW_CONTROLS = [
  { scene: "edge_spectrum", label: "Edge Spectrum", description: "Frequency bars and charged edge teeth." },
  { scene: "oscilloscope_ribbons", label: "Oscilloscope Ribbons", description: "Braided waveforms and ribbon rails." },
  { scene: "tape_feedback", label: "Tape Feedback", description: "Spliced feedback frames and tracking echoes." },
  { scene: "matrix_rain", label: "Matrix Rain", description: "Chroma-safe code banks and crossfeed." },
  { scene: "ascii_terminal", label: "ASCII Terminal", description: "Terminal rows, breach packets and glyph structure." },
  { scene: "pixel_sort_storm", label: "Pixel Sort Storm", description: "Scrambled signal slices and fragment motion." },
  { scene: "lightning_switchyard", label: "Lightning Switchyard", description: "Charged rails, routing arcs and discharges." },
  { scene: "laser_lattice", label: "Laser Lattice", description: "Prismatic grids, beams and edge chevrons." },
  { scene: "particle_pressure", label: "Particle Pressure", description: "Pressure fields, streaks and a particle vortex." },
  { scene: "signal_constellation", label: "Signal Constellation", description: "Facets, network links, nodes and packets." },
  { scene: "crt_signal_breach", label: "CRT Signal Breach", description: "Sync bands, dropouts and a tearing CRT breach." },
  { scene: "voxel_megacity", label: "Voxel Megacity", description: "Reactive towers, windows and signal bridges." },
  { scene: "liquid_chrome", label: "Liquid Chrome", description: "Metallic membranes, seams and refracted highlights." },
  { scene: "cellular_takeover", label: "Cellular Takeover", description: "Expanding colonies and connective cell fronts." },
  { scene: "shattered_broadcast", label: "Shattered Broadcast", description: "Fractured panels, shards and reassembly." },
  { scene: "barcode_foundry", label: "Barcode Foundry", description: "Industrial bars, scanner passes and signal presses." },
  { scene: "recursive_portal", label: "Recursive Portal", description: "Nested frames, packet depth and portal notches." },
  { scene: "holographic_terrain", label: "Holographic Terrain", description: "Signal ridges, beacons and a terrain horizon." },
  { scene: "kinetic_glyph_engine", label: "Kinetic Glyph Engine", description: "Moving glyph plates and a coded signal engine." },
  { scene: "mechanical_iris", label: "Mechanical Iris", description: "Reactive blades, actuators and a reactor aperture." },
  { scene: "spectral_cathedral", label: "Spectral Cathedral", description: "Signal pillars, vaulted arches and a resonant rose window." },
  { scene: "ferrofluid_field", label: "Ferrofluid Field", description: "Magnetic wells, liquid spikes and charged droplets." },
  { scene: "orbital_relay", label: "Orbital Relay", description: "Elliptical relays, satellites and synchronized packet paths." },
  { scene: "data_loom", label: "Data Loom", description: "Warp rails, woven circuits and accelerating signal shuttles." },
  { scene: "monolith_array", label: "Monolith Array", description: "Brutalist slabs, indexing seams and a broadcast citadel." },
  { scene: "plasma_tendrils", label: "Plasma Tendrils", description: "Smooth charged filaments that branch, braid and flare." },
  { scene: "signal_bloom", label: "Signal Bloom", description: "Radial petals, filament stamens and a full-spectrum rosette." },
  { scene: "vector_swarm", label: "Vector Swarm", description: "Triangular agents gather into lanes, flocks and a signal sigil." },
  { scene: "moire_engine", label: "Moiré Engine", description: "Interference rings, phase ticks and a diffraction reactor." },
  { scene: "eclipse_corona", label: "Eclipse Corona", description: "A black signal sun, crescents, corona arcs and solar flares." },
] as const satisfies ReadonlyArray<{
  scene: RadioVisualMusicScene;
  label: string;
  description: string;
}>;

export interface RadioVisualPreview {
  scene: RadioVisualMusicScene;
  requestedAt: string;
  deliveryExpiresAt: string;
  nonce: string;
  visualSeed: number;
}

export function normalizeRadioVisualPreviewScene(value: unknown): RadioVisualMusicScene | null {
  if (typeof value !== "string") return null;
  return RADIO_VISUAL_PREVIEW_CONTROLS.some((control) => control.scene === value)
    ? value as RadioVisualMusicScene
    : null;
}

export function radioVisualPreviewSeed(scene: RadioVisualMusicScene, nonce: string): number {
  const familyIndex = RADIO_VISUAL_PREVIEW_CONTROLS.findIndex((control) => control.scene === scene);
  return radioVisualSeedForMusicFamily(`radio-visual-preview:${scene}:${nonce}`, Math.max(0, familyIndex));
}

export function activeRadioVisualPreview(input: {
  scene?: unknown;
  requestedAt?: unknown;
  deliveryExpiresAt?: unknown;
  nonce?: unknown;
}, now = new Date()): RadioVisualPreview | null {
  const scene = normalizeRadioVisualPreviewScene(input.scene);
  const requestedAtMs = typeof input.requestedAt === "string" ? Date.parse(input.requestedAt) : Number.NaN;
  const deliveryExpiresAtMs = typeof input.deliveryExpiresAt === "string" ? Date.parse(input.deliveryExpiresAt) : Number.NaN;
  if (!scene || !Number.isFinite(requestedAtMs) || !Number.isFinite(deliveryExpiresAtMs) || deliveryExpiresAtMs <= now.getTime()) return null;
  const requestedAt = new Date(requestedAtMs).toISOString();
  const deliveryExpiresAt = new Date(deliveryExpiresAtMs).toISOString();
  const nonce = typeof input.nonce === "string" && input.nonce.trim()
    ? input.nonce.trim().slice(0, 80)
    : `${scene}:${requestedAtMs}`;
  return {
    scene,
    requestedAt,
    deliveryExpiresAt,
    nonce,
    visualSeed: radioVisualPreviewSeed(scene, nonce),
  };
}

export function radioVisualPreviewProgress(startedAtMs: number, nowMs: number): number | null {
  if (!Number.isFinite(startedAtMs) || !Number.isFinite(nowMs)) return null;
  const elapsedMs = nowMs - startedAtMs;
  if (elapsedMs < 0 || elapsedMs >= RADIO_VISUAL_PREVIEW_DURATION_MS) return null;
  return Math.min(1, Math.max(0, elapsedMs / RADIO_VISUAL_PREVIEW_DURATION_MS));
}

export function radioVisualPreviewEnvelope(progress: number | null): number {
  if (progress === null) return 0;
  const smoothstep = (value: number) => {
    const bounded = Math.min(1, Math.max(0, value));
    return bounded * bounded * (3 - 2 * bounded);
  };
  if (progress < 0.06) return smoothstep(progress / 0.06);
  if (progress > 0.9) return smoothstep((1 - progress) / 0.1);
  return 1;
}
