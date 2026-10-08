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
      <p className="public-kicker">{label}</p>
      <h1 className="public-title">{heading}</h1>
      <p className="public-intro">{description}</p>
    </>
  );
}

/** The broadcast title stays separate from live status and intake truth. */
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
      <p className="public-kicker">{label}</p>
      <h1 className="public-title">
        {heading1} <span className="text-accent">{heading2}</span>
      </h1>
      <p className="public-intro mb-6">{description}</p>
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
