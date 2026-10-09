import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { PublicIcon, type PublicIconName } from "@/components/PublicIcon";
import { homePage, siteConfig, externalLinks } from "@/content";
import { BNLRelayModule } from "@/components/BNLRelay";
import { RadioBroadcastFeature } from "@/components/RadioBroadcastFeature";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
  openGraph: {
    title: "BARCODE Network",
    description:
      "BARCODE is a living hip-hop broadcast universe connecting music, BARCODE Radio, community, technology, and interdimensional story.",
    siteName: "BARCODE Network",
    url: "/",
    images: [
      {
        url: "/barcode-radio.png",
        width: 1200,
        height: 630,
        alt: "BARCODE Network signal card",
      },
    ],
    type: "website",
  },
};

function resolveHref(href: string): string {
  if (href.startsWith("EXTERNAL:")) {
    const key = href.replace("EXTERNAL:", "") as keyof typeof externalLinks;
    return externalLinks[key];
  }
  return href;
}

function RouteLink({
  href,
  className,
  children,
}: {
  href: string;
  className: string;
  children: ReactNode;
}) {
  const resolved = resolveHref(href);
  const isExternal = href.startsWith("EXTERNAL:");

  return isExternal ? (
    <a
      href={resolved}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
    >
      {children}
    </a>
  ) : (
    <Link href={resolved} className={className}>
      {children}
    </Link>
  );
}

export default function Home() {
  const discoveryRoutes: Record<
    string,
    { icon: PublicIconName; title: string; action: string }
  > = {
    "/releases": {
      icon: "music",
      title: "The music",
      action: "Explore the releases",
    },
    "/radio": {
      icon: "radio",
      title: "BARCODE Radio",
      action: "Watch & participate",
    },
    "EXTERNAL:discord": {
      icon: "community",
      title: "Your people",
      action: "Join the community",
    },
  };
  const discoveryPrograms = homePage.programs.filter(
    (program) => program.href in discoveryRoutes,
  );
  const deeperPrograms = homePage.programs.filter(
    (program) => !(program.href in discoveryRoutes),
  );
  return (
    <div className="public-page">
      <section className="public-hero border-b border-border">
        <div className="public-container public-hero-grid">
          <div>
            <p className="public-kicker">{homePage.hero.label}</p>
            <h1 className="public-home-title">
              <span>PRESS PLAY.</span>
              <span className="text-accent">FIND YOUR</span>
              <span className="text-accent">PEOPLE.</span>
            </h1>
            <p className="public-intro">
              Hip-hop, original music and a live public square. This is BARCODE.
            </p>
            <div className="public-actions mt-7">
              <Link
                href={homePage.hero.ctaPrimary.href}
                className="public-button public-button--primary"
              >
                <PublicIcon name="play" />
                Hear the music
              </Link>
              <Link
                href={homePage.hero.ctaSecondary.href}
                className="public-button"
              >
                <PublicIcon name="radio" />
                Enter BARCODE Radio
              </Link>
            </div>
            <div className="public-hero-note">
              <span>
                <PublicIcon name="check" />
                Traditional
              </span>
              <span>
                <PublicIcon name="check" />
                AI-assisted
              </span>
              <span>
                <PublicIcon name="check" />
                Hybrid
              </span>
            </div>
          </div>
          <SignalArtwork />
        </div>
      </section>

      <section className="public-section">
        <div className="public-container">
          <div className="public-section-top">
            <div>
              <p className="public-kicker">{homePage.routeSection.label}</p>
              <h2 className="public-section-heading">
                Three ways into the signal.
              </h2>
            </div>
            <p className="text-xs text-muted">Listen. Watch. Connect.</p>
          </div>
          <div className="public-route-grid">
            {discoveryPrograms.map((program, index) => (
              <RouteLink
                key={program.href}
                href={program.href}
                className="public-route-card"
              >
                <span className="route-index">0{index + 1}</span>
                <PublicIcon
                  name={discoveryRoutes[program.href].icon}
                  className="public-icon"
                />
                <h3>{discoveryRoutes[program.href].title}</h3>
                <p>{program.description}</p>
                <span className="route-action">
                  {discoveryRoutes[program.href].action}
                  <PublicIcon name="arrow" />
                </span>
              </RouteLink>
            ))}
          </div>
          <details className="public-disclosure mt-5">
            <summary>
              About BARCODE{" "}
              <span className="hidden sm:inline text-xs font-normal text-muted">
                The crew, the craft, the bigger story
              </span>
            </summary>
            <div className="public-disclosure-content grid gap-8 md:grid-cols-2">
              <div>
                <p className="public-kicker">
                  {homePage.hero.heading1} {homePage.hero.heading2}
                </p>
                <p>{homePage.hero.description}</p>
                <h3 className="mt-5 mb-3 text-lg text-foreground">
                  {homePage.orientation.heading}
                </h3>
                {homePage.orientation.paragraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
              <div>
                <h3 className="mb-3 text-lg text-foreground">
                  {homePage.mission.heading}
                </h3>
                <blockquote className="mb-4 border-l-2 border-accent pl-4 text-foreground">
                  {homePage.mission.statement}
                </blockquote>
                <p>{homePage.mission.body}</p>
                <h3 className="mt-5 mb-3 text-lg text-foreground">
                  {homePage.routeSection.heading}
                </h3>
                <p>{homePage.routeSection.introduction}</p>
              </div>
            </div>
          </details>
        </div>
      </section>

      <section className="public-section public-section--muted">
        <div className="public-container grid gap-6 lg:grid-cols-[1.1fr_.9fr]">
          <div className="min-w-0">
            <RadioBroadcastFeature compact />
          </div>
          <div className="min-w-0 flex flex-col justify-center">
            <p className="public-kicker">
              Broadcast everywhere. Participate through BARCODE.
            </p>
            <h2 className="public-section-heading mb-4">
              Make something.
              <br />
              Bring it here.
            </h2>
            <p className="public-intro mb-6">
              Original music, real reactions, returning faces. Meet the artists
              and listeners around the show.
            </p>
            <div className="public-actions">
              <a
                href={externalLinks.discord}
                target="_blank"
                rel="noopener noreferrer"
                className="public-button public-button--primary"
              >
                <PublicIcon name="community" />
                Join Discord
              </a>
              <a
                href={externalLinks.tiktok}
                target="_blank"
                rel="noopener noreferrer"
                className="public-button"
              >
                Follow on TikTok <PublicIcon name="arrow" />
              </a>
            </div>
          </div>
        </div>
      </section>

      <section className="public-section">
        <div className="public-container">
          <div className="public-section-top">
            <div>
              <p className="public-kicker">
                {homePage.deeperTransmission.label}
              </p>
              <h2 className="public-section-heading">
                There’s more beneath the music.
              </h2>
            </div>
            <PublicIcon name="archive" className="public-icon" />
          </div>
          <div className="public-deep-grid">
            <Link href="/database" className="public-deep-link">
              <PublicIcon name="archive" />
              Database
            </Link>
            <Link href="/transmissions" className="public-deep-link">
              <PublicIcon name="send" />
              Transmissions
            </Link>
            <Link href="/bnl" className="public-deep-link">
              <PublicIcon name="bnl" />
              BNL-01 Hub
            </Link>
            <Link href="/terminal" className="public-deep-link">
              <PublicIcon name="terminal" />
              Terminal Archive
            </Link>
          </div>
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <details className="public-disclosure">
              <summary>The story & the archive</summary>
              <div className="public-disclosure-content">
                <h3 className="mb-3 text-lg text-foreground">
                  {homePage.deeperTransmission.heading}
                </h3>
                <p>{homePage.deeperTransmission.body}</p>
                {deeperPrograms.map((program) => (
                  <p key={program.href}>{program.description}</p>
                ))}
                <div className="public-actions mt-5">
                  <Link
                    href={homePage.deeperTransmission.ctaPrimary.href}
                    className="public-button"
                  >
                    {homePage.deeperTransmission.ctaPrimary.text}
                  </Link>
                  <Link
                    href={homePage.deeperTransmission.ctaSecondary.href}
                    className="public-button"
                  >
                    {homePage.deeperTransmission.ctaSecondary.text}
                  </Link>
                </div>
              </div>
            </details>
            <details className="public-disclosure">
              <summary>Latest Network Relay · BNL-01</summary>
              <div className="public-disclosure-content">
                <h3 className="mb-3 text-lg text-foreground">
                  BNL-01 turns public movement into paths you can read.
                </h3>
                <p>
                  BNL-01 notices what the BARCODE community is discussing, what
                  keeps returning, and what changes around the show. The Hub
                  gathers approved relays and Journal entries for deeper
                  reading; Discord is where people speak with BNL-01.
                </p>
                <div className="my-5">
                  <BNLRelayModule title="Latest Network Relay" />
                </div>
                <div className="public-actions">
                  <Link href="/bnl" className="public-button">
                    Open the BNL-01 Hub
                  </Link>
                  <a
                    href={externalLinks.discord}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="public-button"
                  >
                    Talk in Discord
                  </a>
                </div>
              </div>
            </details>
          </div>
        </div>
      </section>
    </div>
  );
}

/** Decorative record/circuit artwork; motion stays CSS-only with a native pause control. */
function SignalArtwork() {
  return (
    <div className="public-signal-display">
      <div className="public-signal-art" aria-hidden="true">
        <span className="public-signal-label top">BC // 01 — Open frequency</span>
        <svg viewBox="0 0 500 500" fill="none" stroke="currentColor" focusable="false">
          <circle cx="250" cy="250" r="190" strokeOpacity=".18" />
          <circle cx="250" cy="250" r="172" strokeOpacity=".3" />
          <circle cx="250" cy="250" r="157" strokeOpacity=".15" />
          <circle cx="250" cy="250" r="135" strokeOpacity=".35" />
          <circle cx="250" cy="250" r="112" strokeOpacity=".15" />
          <g className="signal-orbit signal-orbit--outer">
            <circle
              cx="250" cy="250" r="172" pathLength="100"
              strokeDasharray="11 39" strokeWidth="2" strokeOpacity=".65"
            />
            <circle cx="250" cy="78" r="3" fill="currentColor" stroke="none" />
          </g>
          <g className="signal-orbit signal-orbit--inner">
            <circle
              cx="250" cy="250" r="135" pathLength="100"
              strokeDasharray="7 43" strokeWidth="1.5" strokeOpacity=".5"
            />
          </g>
          <path
            d="M250 35v27M250 438v27M35 250h27M438 250h27M98 98l20 20M382 382l20 20M98 402l20-20M382 118l20-20"
            strokeOpacity=".5"
          />
          <path
            d="M55 345h35l45-45M365 200l45-45h45M180 75v36l35 35M285 354l35 35v36"
            strokeWidth="2"
            strokeOpacity=".7"
          />
          <g className="signal-packets" strokeWidth="3" strokeLinecap="round">
            <path className="signal-packet signal-packet--1" pathLength="100" d="M55 345h35l45-45" />
            <path className="signal-packet signal-packet--2" pathLength="100" d="M365 200l45-45h45" />
            <path className="signal-packet signal-packet--3" pathLength="100" d="M180 75v36l35 35" />
            <path className="signal-packet signal-packet--4" pathLength="100" d="M285 354l35 35v36" />
          </g>
          <circle cx="55" cy="345" r="4" fill="currentColor" />
          <circle cx="455" cy="155" r="4" fill="currentColor" />
          <circle cx="180" cy="75" r="4" fill="currentColor" />
          <circle cx="320" cy="425" r="4" fill="currentColor" />
          <path
            className="signal-wave signal-wave--1"
            d="m48 275 8-26 8 19 8-36 8 56 8-24 8 13"
            strokeWidth="2"
          />
          <path
            className="signal-wave signal-wave--2"
            d="M397 332l8-26 8 19 8-36 8 56 8-24 8 13"
            strokeWidth="2"
          />
          <path d="M125 75h35M340 425h35" strokeWidth="8" strokeOpacity=".6" />
        </svg>
        <div className="public-signal-center">
          <Image
            src={siteConfig.logo}
            alt=""
            width={140}
            height={140}
            unoptimized
            priority
          />
          <span>MUSIC / PEOPLE / SIGNAL</span>
        </div>
        <span className="public-signal-label bottom">
          Every fragment carries a signal.
        </span>
      </div>
      <label className="public-signal-control">
        <input type="checkbox" className="public-signal-toggle" />
        <span>Pause animation</span>
      </label>
    </div>
  );
}
