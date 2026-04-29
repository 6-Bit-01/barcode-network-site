import Link from "next/link";
import Image from "next/image";
import { releasesPage } from "@/content";
import { PageHero, SectionDot } from "@/components/LiveEffects";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Releases — BARCODE Network",
  description:
    "Official transmission catalog. Audio artifacts indexed and released by BARCODE Network entities.",
  openGraph: {
    title: "Releases — BARCODE Network",
    description:
      "Official transmission catalog. Audio artifacts indexed and released by BARCODE Network entities.",
  },
};

const releases = releasesPage.releases;

export default function ReleasesPage() {
  return (
    <div className="pt-14">
      {/* Header */}
      <section className="border-b border-border noise-bg">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-16 sm:py-24">
          <PageHero
            label={releasesPage.hero.label}
            heading={`${releasesPage.hero.heading1} ${releasesPage.hero.heading2}`}
            description={releasesPage.hero.description}
          />
        </div>
      </section>

      {/* Releases List */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-16">
          <div className="flex items-center gap-3 mb-10">
            <SectionDot />
            <h2 className="text-xs sm:text-sm uppercase tracking-[0.5em] text-muted">
              Catalog
            </h2>
          </div>

          <div className="space-y-6">
            {releases.map((release, index) => (
              <div
                key={index}
                className="border border-border bg-surface hover:border-accent/20 transition-colors"
              >
                <div className="flex flex-col sm:flex-row">
                  {/* Album Art */}
                  {release.cover && (
                    <div className="relative w-full sm:w-48 sm:min-w-48 aspect-square sm:aspect-auto shrink-0 crt-scanlines crt-vignette">
                      <Image
                        src={release.cover}
                        alt={release.title}
                        fill
                        className="object-cover"
                        unoptimized
                      />
                    </div>
                  )}

                  <div className="p-6 flex-1">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-4">
                    <div>
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-bold text-foreground">
                          {release.title}
                        </h3>
                        <span
                          className={`text-xs uppercase tracking-widest px-2 py-0.5 border ${
                            release.status === "LATEST"
                              ? "border-accent/30 text-accent"
                              : release.status === "INCOMING"
                              ? "border-red-500/30 text-red-400 animate-pulse"
                              : "border-border-light text-muted"
                          }`}
                        >
                          {release.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted uppercase tracking-wider">
                        <span>{release.type}</span>
                        <span className="text-border-light">|</span>
                        <span>{release.date}</span>
                      </div>
                    </div>
                  </div>

                  <p className="text-sm text-muted leading-relaxed mb-4">
                    {release.description}
                  </p>

                  <div className="text-xs uppercase tracking-wider px-3 py-1.5 border border-border text-muted inline-block">
                    ARCHIVE ENTRY
                  </div>
                </div>
                </div>
              </div>
            ))}
          </div>

          <p className="text-xs text-muted/50 mt-8 uppercase tracking-wider font-mono">
            {"//"} {releases.length} TRANSMISSIONS INDEXED
          </p>
        </div>
      </section>

      <section>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-16 text-center">
          <Link
            href="/transmissions"
            className="inline-flex items-center px-6 py-3 text-sm uppercase tracking-widest border border-accent text-accent hover:bg-accent hover:text-background transition-all"
          >
            View Transmissions →
          </Link>
        </div>
      </section>
    </div>
  );
}
