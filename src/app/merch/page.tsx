import { merchPage, externalLinks } from "@/content";
import { PageHero, SectionDot } from "@/components/LiveEffects";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Merch — BARCODE Network",
  description:
    "Official BARCODE Network supply line. Wearable signal, physical artifacts.",
  openGraph: {
    title: "Merch — BARCODE Network",
    description:
      "Official BARCODE Network supply line. Wearable signal, physical artifacts.",
  },
};

export default function MerchPage() {
  return (
    <div className="pt-14">
      <section className="border-b border-border noise-bg">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-16 sm:py-24">
          <PageHero
            label={merchPage.hero.label}
            heading={`${merchPage.hero.heading1} ${merchPage.hero.heading2}`}
            description={merchPage.hero.description}
          />
        </div>
      </section>

      <section className="border-b border-border">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-16">
          <div className="flex items-center gap-3 mb-6">
            <SectionDot />
            <h2 className="text-xs sm:text-sm uppercase tracking-[0.5em] text-muted">
              Supply Line Status
            </h2>
          </div>
          <p className="text-sm text-muted max-w-2xl">{merchPage.notice}</p>
          <a
            href={externalLinks.discord}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block mt-6 text-xs uppercase tracking-widest border border-accent/30 text-accent px-4 py-2 hover:bg-accent/10 transition-colors"
          >
            Join Discord for Updates →
          </a>
        </div>
      </section>
    </div>
  );
}
