"use client";

import { GlitchText } from "./GlitchText";
import { ScrambleText } from "./ScrambleText";

/** Client island for homepage hero — adds living text effects */
export function HeroHeading({
  heading1,
  heading2,
  label,
}: {
  heading1: string;
  heading2: string;
  label: string;
}) {
  return (
    <>
      <p className="text-xs sm:text-sm uppercase tracking-[0.5em] text-muted mb-6">
        <ScrambleText text={label} speed={25} />
      </p>
      <h1 className="text-3xl sm:text-5xl md:text-7xl font-bold tracking-tight text-foreground">
        <GlitchText
          text={heading1}
          className="text-accent text-glow"
          intensity="medium"
        />
        <br />
        <span className="text-foreground/80">{heading2}</span>
      </h1>
    </>
  );
}

/** Generic page hero with glitch heading + scramble label — for sub-pages */
export function PageHero({
  label,
  heading,
  description,
}: {
  label: string;
  heading: string;
  description: string;
}) {
  return (
    <>
      <p className="text-xs sm:text-sm uppercase tracking-[0.5em] text-muted mb-4">
        <ScrambleText text={label} speed={25} />
      </p>
      <h1 className="text-3xl sm:text-4xl md:text-6xl font-bold tracking-tight text-foreground mb-4">
        <GlitchText
          text={heading}
          className="text-accent text-glow"
          intensity="medium"
        />
      </h1>
      <p className="text-base text-muted leading-relaxed max-w-xl">
        {description}
      </p>
    </>
  );
}

/** Radio page hero — two-word heading variant */
export function RadioHero({
  label,
  heading1,
  heading2,
  description,
}: {
  label: string;
  heading1: string;
  heading2: string;
  description: string;
}) {
  return (
    <>
      <p className="text-xs sm:text-sm uppercase tracking-[0.5em] text-muted mb-4">
        <ScrambleText text={label} speed={25} />
      </p>
      <h1 className="text-3xl sm:text-4xl md:text-6xl font-bold tracking-tight text-foreground mb-3">
        <GlitchText
          text={heading1}
          className="text-accent text-glow"
          intensity="medium"
        />{" "}
        <span className="text-foreground/80">{heading2}</span>
      </h1>
      <p className="text-base text-muted leading-relaxed max-w-xl mb-6">
        {description}
      </p>
    </>
  );
}

/** Active status badge with flicker effect */
export function StatusBadge({ status }: { status: string }) {
  return (
    <span className="text-xs uppercase tracking-widest px-2 py-0.5 border border-accent/30 text-accent animate-flicker">
      {status}
    </span>
  );
}

/** Section dot indicator with blink */
export function SectionDot() {
  return (
    <span className="w-1.5 h-1.5 rounded-full bg-accent animate-status-blink" />
  );
}