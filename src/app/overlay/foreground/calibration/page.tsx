import type { Metadata } from "next";
import type { CSSProperties } from "react";

export const metadata: Metadata = {
  title: "Foreground Overlay Calibration — BARCODE Radio",
  description: "Nonfunctional browser-source size and readability calibration for BARCODE Radio.",
  robots: { index: false, follow: false },
};

type SampleName = "long" | "single" | "commercial" | "closed";

type CalibrationPreset = {
  height: number;
  primarySize: number;
  secondarySize: number;
  wheelSize: number;
  wheelCountSize: number;
  inset: number;
};

const CALIBRATION_PRESET: CalibrationPreset = {
  height: 100,
  primarySize: 31,
  secondarySize: 20,
  wheelSize: 92,
  wheelCountSize: 50,
  inset: 18,
};

const CALIBRATION_SAMPLES: Record<SampleName, { eyebrow: string; primary: string; secondary?: string }> = {
  long: {
    eyebrow: "Now Playing",
    primary: "Artist Name Test // Deliberately Long Track Title for Readability",
    secondary: "Submissions Open  •  Watch the broadcast live on TikTok",
  },
  single: {
    eyebrow: "Now Playing",
    primary: "Artist Name // Track Title",
  },
  commercial: {
    eyebrow: "Sponsor Signal",
    primary: "A Word From Our Sponsor",
    secondary: "Submissions stay open  •  Watch the broadcast live on TikTok",
  },
  closed: {
    eyebrow: "Queue Status",
    primary: "Submissions Closed // Broadcast Still Live",
    secondary: "Watch the remaining transmissions live on TikTok",
  },
};

const CHROMA_BLUE = "#0000ff";
const STRIP_ANCHOR_Y = 1222;
const STRIP_SIDE_MARGIN = 24;

function firstQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function resolveSample(value: string | string[] | undefined): SampleName {
  const candidate = firstQueryValue(value);
  return candidate === "single" || candidate === "commercial" || candidate === "closed" ? candidate : "long";
}

function resolveWheelCount(value: string | string[] | undefined) {
  const parsed = Number.parseInt(firstQueryValue(value) ?? "3", 10);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(99, parsed)) : 3;
}

export default async function ForegroundOverlayCalibrationPage({
  searchParams,
}: Readonly<{
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const query = (await searchParams) ?? {};
  const sampleName = resolveSample(query.sample);
  const wheelCount = resolveWheelCount(query.count);
  const sample = CALIBRATION_SAMPLES[sampleName];
  const style = {
    "--fg-height": `${CALIBRATION_PRESET.height}px`,
    "--fg-primary-size": `${CALIBRATION_PRESET.primarySize}px`,
    "--fg-secondary-size": `${CALIBRATION_PRESET.secondarySize}px`,
    "--fg-wheel-size": `${CALIBRATION_PRESET.wheelSize}px`,
    "--fg-wheel-count-size": `${CALIBRATION_PRESET.wheelCountSize}px`,
    "--fg-inset": `${CALIBRATION_PRESET.inset}px`,
    "--fg-anchor-y": `${STRIP_ANCHOR_Y}px`,
    "--fg-side-margin": `${STRIP_SIDE_MARGIN}px`,
    "--fg-key-color": CHROMA_BLUE,
  } as CSSProperties;

  return (
    <div
      className="fg-calibration-canvas"
      data-calibration-only="true"
      data-preset="locked-100"
      data-sample={sampleName}
      data-source-resolution="1080x1920"
      style={style}
    >
      <section className={`fg-calibration-strip ${sample.secondary ? "fg-calibration-strip--two-line" : "fg-calibration-strip--one-line"}`} aria-label="BARCODE Radio foreground overlay calibration">
        <div className="fg-calibration-rail" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>

        <div className="fg-calibration-copy">
          <div className="fg-calibration-primary-row">
            <span className="fg-calibration-eyebrow">{sample.eyebrow}</span>
            <span className="fg-calibration-primary">{sample.primary}</span>
          </div>
          {sample.secondary && <p className="fg-calibration-secondary">{sample.secondary}</p>}
        </div>

        <div className="fg-calibration-wheel-endcap" aria-label={`${wheelCount} Wheel spins unlocked`}>
          <span className="fg-calibration-wheel-pointer" aria-hidden="true" />
          <span className="fg-calibration-wheel" aria-hidden="true" />
          <span className="fg-calibration-wheel-count">{wheelCount}</span>
          <span className="fg-calibration-wheel-label">Spins</span>
        </div>
      </section>
    </div>
  );
}
