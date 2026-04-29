import Image from "next/image";
import { releasesPage } from "@/content";
import { PageHero, SectionDot } from "@/components/LiveEffects";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Releases — BARCODE Network",
  description:
    "Official transmission catalog. Audio artifacts indexed and released by BARCODE Network entities.",
};

const releases = releasesPage.releases;

export default function ReleasesPage() {
  return (
    <div className="pt-14">
      <section className="border-b border-border noise-bg">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-16 sm:py-24">
          <PageHero
            label={releasesPage.hero.label}
            heading={`${releasesPage.hero.heading1} ${releasesPage.hero.heading2}`}
            description={releasesPage.hero.description}
          />
        </div>
      </section>

      <section className="border-b border-border">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-16">
          <div className="flex items-center gap-3 mb-10">
            <SectionDot />
            <h2 className="text-xs sm:text-sm uppercase tracking-[0.5em] text-muted">Catalog</h2>
          </div>

          <div className="space-y-6">
            {releases.map((release, index) => (
              <div key={index} className="border border-border bg-surface p-6">
                <div className="flex flex-col sm:flex-row gap-4">
                  {release.cover && (
                    <div className="relative w-full sm:w-40 aspect-square shrink-0">
                      <Image src={release.cover} alt={release.title} fill className="object-cover" unoptimized />
                    </div>
                  )}
                  <div>
                    <h3 className="text-lg font-bold text-foreground">{release.title}</h3>
                    <p className="text-xs text-muted uppercase tracking-wider mb-3">{release.type} | {release.date}</p>
                    <p className="text-sm text-muted">{release.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
