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
      {/* Hero */}
      <section className="border-b border-border noise-bg">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-16 sm:py-24">
          <PageHero
            label={merchPage.hero.label}
            heading={`${merchPage.hero.heading1} ${merchPage.hero.heading2}`}
            description={merchPage.hero.description}
          />
        </div>
      </section>

      <section className="border-b border-border noise-bg">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 py-16">
          <div className="flex items-center gap-3 mb-8">
            <SectionDot />
            <h2 className="text-xs sm:text-sm uppercase tracking-[0.5em] text-muted">
              Supply Status
            </h2>
          </div>
          <div className="border border-border bg-surface p-8">
            <p className="text-sm text-muted leading-relaxed">{merchPage.notice}</p>
          </div>
        </div>
      </section>

      {/* Discord CTA */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 py-12 text-center">
          <p className="text-sm text-muted mb-4">
            Future drops announced through official channels.
          </p>
          <a
            href={externalLinks.discord}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block border border-accent text-accent hover:bg-accent hover:text-background px-6 py-3 text-sm uppercase tracking-widest transition-all"
          >
            Join Discord for drop alerts →
          </a>
        </div>
      </section>

      {/* Terminal Output */}
      <section>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-16">
          <div className="bg-surface border border-border p-6 font-mono">
            <p className="text-xs text-muted mb-4">
              &gt; BARCODE_NETWORK // SUPPLY_SYSTEM
            </p>
            <div className="space-y-1 text-sm text-foreground/60">
              {["SUPPLY ROUTE .............. LIMITED", "NEW ARTIFACTS ............ PENDING"].map((line, i) => (
                <p key={i}>&gt; {line}</p>
              ))}
              <p className="text-accent mt-4">
                &gt; SUPPLY CHAIN ACTIVE<span className="cursor-blink">_</span>
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
