import Link from "next/link";
import Image from "next/image";
import { LiveBanner } from "@/components/LiveBanner";
import { HeroHeading, StatusBadge, SectionDot } from "@/components/LiveEffects";
import { homePage, siteConfig, externalLinks } from "@/content";

function resolveHref(href: string): string {
  if (href.startsWith("EXTERNAL:")) {
    const key = href.replace("EXTERNAL:", "") as keyof typeof externalLinks;
    return externalLinks[key];
  }
  return href;
}

export default function Home() {
  return (
    <div className="pt-14">
      {/* Live Banner */}
      <LiveBanner />

      {/* Hero Section */}
      <section className="relative noise-bg border-b border-border">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-24 sm:py-32">
          <div className="max-w-3xl">
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
              <HeroHeading
                heading1={homePage.hero.heading1}
                heading2={homePage.hero.heading2}
                label={homePage.hero.label}
              />
            </div>
            <p className="text-base sm:text-lg text-muted leading-relaxed max-w-xl mb-8">
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

      {/* Active Programs */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-16">
          <div className="flex items-center gap-3 mb-10">
            <SectionDot />
            <h2 className="text-xs sm:text-sm uppercase tracking-[0.5em] text-muted">
              Active Programs
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {homePage.programs.map((program) => (
              <Link
                key={program.href}
                href={program.href}
                className="group border border-border hover:border-accent/30 bg-surface p-6 transition-all hover:bg-surface-light"
              >
                <div className="flex items-start justify-between mb-3">
                  <h3 className="text-lg font-bold tracking-wide text-foreground group-hover:text-accent transition-colors">
                    {program.title}
                  </h3>
                  <StatusBadge status={program.status} />
                </div>
                <p className="text-sm text-muted leading-relaxed">
                  {program.description}
                </p>
                <div className="mt-4 text-xs text-muted/50 uppercase tracking-wider group-hover:text-accent/50 transition-colors">
                  Enter →
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Network Statement */}
      <section className="border-b border-border noise-bg">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-16">
          <div className="max-w-2xl mx-auto text-center">
            <p className="text-xs sm:text-sm uppercase tracking-[0.5em] text-muted mb-6 animate-flicker">
              {homePage.mission.label}
            </p>
            <blockquote className="text-xl sm:text-2xl text-foreground/80 leading-relaxed font-light italic">
              &ldquo;{homePage.mission.quote}&rdquo;
            </blockquote>
            <div className="mt-8 w-12 h-px bg-accent mx-auto" />
          </div>
        </div>
      </section>

      {/* Quick Links / Status Grid */}
      <section>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-16">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {homePage.quickLinks.map((link) => {
              const resolved = resolveHref(link.href);
              const isExternal = link.href.startsWith("EXTERNAL:");
              const className = "border border-border p-4 text-center hover:border-accent/30 transition-colors group";
              const inner = (
                <span className="text-sm text-muted group-hover:text-accent transition-colors uppercase tracking-wider">
                  {link.label}
                </span>
              );

              return isExternal ? (
                <a
                  key={link.label}
                  href={resolved}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={className}
                >
                  {inner}
                </a>
              ) : (
                <Link
                  key={link.label}
                  href={resolved}
                  className={className}
                >
                  {inner}
                </Link>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
