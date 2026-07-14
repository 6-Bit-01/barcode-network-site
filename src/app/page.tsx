import type { ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { LiveBanner } from "@/components/LiveBanner";
import { StatusBadge, SectionDot } from "@/components/LiveEffects";
import { homePage, siteConfig, externalLinks } from "@/content";
import { BNLRelayModule } from "@/components/BNLRelay";

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
  return (
    <div className="pt-14">
      {/* Live Banner */}
      <LiveBanner />

      {/* Public-access Hero */}
      <section className="relative noise-bg border-b border-border">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-24 sm:py-32">
          <div className="max-w-4xl">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6 mb-6">
              <Image
                src={siteConfig.logo}
                alt={siteConfig.name}
                width={512}
                height={512}
                className="rounded-sm flex-shrink-0 w-[60px] sm:w-[80px]"
                unoptimized
                priority
              />
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-[0.45em] text-muted mb-3 animate-flicker">
                  {homePage.hero.label}
                </p>
                <h1 className="text-[clamp(1.9rem,9vw,4.5rem)] sm:text-[clamp(2.75rem,6vw,4.75rem)] font-black uppercase leading-[0.9] tracking-[-0.08em] text-foreground">
                  <span className="block whitespace-nowrap">{homePage.hero.heading1}</span>
                  <span className="block whitespace-nowrap text-accent">{homePage.hero.heading2}</span>
                </h1>
              </div>
            </div>
            <p className="text-base sm:text-lg text-muted leading-relaxed max-w-2xl mb-8">
              {homePage.hero.description}
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href={homePage.hero.ctaPrimary.href}
                className="inline-flex items-center px-6 py-3 text-sm uppercase tracking-widest border border-accent text-accent hover:bg-accent hover:text-background transition-all"
              >
                {homePage.hero.ctaPrimary.text}
              </Link>
              <Link
                href={homePage.hero.ctaSecondary.href}
                className="inline-flex items-center px-6 py-3 text-sm uppercase tracking-widest border border-border-light text-muted hover:border-foreground hover:text-foreground transition-all"
              >
                {homePage.hero.ctaSecondary.text}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Plain-language orientation */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-16">
          <div className="max-w-3xl">
            <p className="text-xs sm:text-sm uppercase tracking-[0.5em] text-muted mb-4 animate-flicker">
              {homePage.orientation.label}
            </p>
            <h2 className="text-2xl sm:text-4xl font-black tracking-tight text-foreground mb-6">
              {homePage.orientation.heading}
            </h2>
            <div className="space-y-5 text-base sm:text-lg text-muted leading-relaxed">
              {homePage.orientation.paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Listen / Watch / Enter / Investigate routes */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-16">
          <div className="flex items-center gap-3 mb-4">
            <SectionDot />
            <p className="text-xs sm:text-sm uppercase tracking-[0.5em] text-muted">
              {homePage.routeSection.label}
            </p>
          </div>
          <h2 className="text-2xl sm:text-4xl font-black tracking-tight text-foreground mb-4">
            {homePage.routeSection.heading}
          </h2>
          <p className="text-base text-muted leading-relaxed max-w-2xl mb-10">
            {homePage.routeSection.introduction}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {homePage.programs.map((program) => (
              <RouteLink
                key={program.href}
                href={program.href}
                className="group border border-border hover:border-accent/30 bg-surface p-6 transition-all hover:bg-surface-light"
              >
                <div className="flex items-start justify-between gap-4 mb-3">
                  <h3 className="text-lg font-bold tracking-wide text-foreground group-hover:text-accent transition-colors">
                    {program.title}
                  </h3>
                  <StatusBadge status={program.status} />
                </div>
                <p className="text-sm text-muted leading-relaxed">
                  {program.description}
                </p>
                <div className="mt-4 text-xs text-muted/50 uppercase tracking-wider group-hover:text-accent/50 transition-colors">
                  {program.status} →
                </div>
              </RouteLink>
            ))}
          </div>
        </div>
      </section>

      {/* Why BARCODE exists */}
      <section className="border-b border-border noise-bg">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-16">
          <div className="max-w-2xl mx-auto text-center">
            <p className="text-xs sm:text-sm uppercase tracking-[0.5em] text-muted mb-6 animate-flicker">
              {homePage.mission.label}
            </p>
            <h2 className="text-2xl sm:text-4xl font-black tracking-tight text-foreground mb-6">
              {homePage.mission.heading}
            </h2>
            <blockquote className="text-xl sm:text-2xl text-foreground/80 leading-relaxed font-light italic">
              &ldquo;{homePage.mission.statement}&rdquo;
            </blockquote>
            <p className="mt-6 text-base text-muted leading-relaxed">
              {homePage.mission.body}
            </p>
            <div className="mt-8 w-12 h-px bg-accent mx-auto" />
          </div>
        </div>
      </section>

      {/* Latest Network Relay */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-10">
          <BNLRelayModule title="Latest Network Relay" />
        </div>
      </section>

      {/* Deeper transmission and return actions */}
      <section>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-16">
          <div className="max-w-3xl mb-12">
            <p className="text-xs sm:text-sm uppercase tracking-[0.5em] text-muted mb-4 animate-flicker">
              {homePage.deeperTransmission.label}
            </p>
            <h2 className="text-2xl sm:text-4xl font-black tracking-tight text-foreground mb-6">
              {homePage.deeperTransmission.heading}
            </h2>
            <p className="text-base sm:text-lg text-muted leading-relaxed mb-8">
              {homePage.deeperTransmission.body}
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href={homePage.deeperTransmission.ctaPrimary.href}
                className="inline-flex items-center px-6 py-3 text-sm uppercase tracking-widest border border-accent text-accent hover:bg-accent hover:text-background transition-all"
              >
                {homePage.deeperTransmission.ctaPrimary.text}
              </Link>
              <Link
                href={homePage.deeperTransmission.ctaSecondary.href}
                className="inline-flex items-center px-6 py-3 text-sm uppercase tracking-widest border border-border-light text-muted hover:border-foreground hover:text-foreground transition-all"
              >
                {homePage.deeperTransmission.ctaSecondary.text}
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {homePage.quickLinks.map((link) => (
              <RouteLink
                key={link.label}
                href={link.href}
                className="border border-border p-4 text-center hover:border-accent/30 transition-colors group"
              >
                <span className="text-sm text-muted group-hover:text-accent transition-colors uppercase tracking-wider">
                  {link.label}
                </span>
              </RouteLink>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
