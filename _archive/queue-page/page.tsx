import Link from "next/link";
import type { Metadata } from "next";
import { PageHero, SectionDot } from "@/components/LiveEffects";
import { QueueDisplay } from "@/components/QueueDisplay";
import { QueueSubmitForm } from "@/components/QueueSubmitForm";
import { queuePage } from "@/content";

export const metadata: Metadata = {
  title: "AI Stream Queue — Request a Play",
  description:
    "Submit a track to the BARCODE AI stream. Free play or pay to skip the line. The B-show that feeds the A-show.",
  openGraph: {
    title: "AI Stream Queue — BARCODE Network",
    description:
      "Submit a track to the 24/7 AI stream. Free / $3 Featured / $5 Fast Lane / $10 Front Row.",
  },
};

export default function QueuePage() {
  return (
    <div className="pt-14">
      {/* Hero */}
      <section className="border-b border-border noise-bg">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-16 sm:py-24">
          <PageHero
            label={queuePage.hero.label}
            heading={queuePage.hero.heading}
            description={queuePage.hero.description}
          />
        </div>
      </section>

      {/* Live Queue Display */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12">
          <div className="flex items-center gap-3 mb-8">
            <SectionDot />
            <h2 className="text-xs sm:text-sm uppercase tracking-[0.5em] text-muted">
              Live Queue
            </h2>
          </div>
          <QueueDisplay />
        </div>
      </section>

      {/* Request Form */}
      <section className="border-b border-border noise-bg">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12">
          <div className="flex items-center gap-3 mb-8">
            <SectionDot />
            <h2 className="text-xs sm:text-sm uppercase tracking-[0.5em] text-muted">
              Submit a Request
            </h2>
          </div>
          <div className="max-w-2xl">
            <QueueSubmitForm />
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12">
          <div className="flex items-center gap-3 mb-8">
            <SectionDot />
            <h2 className="text-xs sm:text-sm uppercase tracking-[0.5em] text-muted">
              How It Works
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {queuePage.steps.map((step) => (
              <div key={step.number} className="border border-border bg-surface p-6">
                <span className="text-2xl font-bold text-accent/20 mb-2 block">
                  {step.number}
                </span>
                <h3 className="text-base font-bold text-foreground mb-2">
                  {step.title}
                </h3>
                <p className="text-sm text-muted leading-relaxed">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Rules */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12">
          <div className="flex items-center gap-3 mb-6">
            <SectionDot />
            <h2 className="text-xs sm:text-sm uppercase tracking-[0.5em] text-muted">
              Queue Rules
            </h2>
          </div>
          <div className="border border-border bg-surface p-6 max-w-2xl">
            <ul className="space-y-3 text-sm text-muted leading-relaxed">
              {queuePage.rules.map((rule, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-accent mt-0.5">▸</span>
                  {rule}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* CTA → BARCODE Radio (A-show) */}
      <section className="noise-bg">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-16 text-center">
          <p className="text-xs uppercase tracking-[0.5em] text-muted mb-3">
            {queuePage.cta.label}
          </p>
          <h2 className="text-xl sm:text-2xl font-bold text-foreground/80 mb-4">
            {queuePage.cta.heading}
          </h2>
          <p className="text-sm text-muted max-w-md mx-auto mb-6">
            {queuePage.cta.description}
          </p>
          <Link
            href="/radio"
            className="inline-flex items-center justify-center gap-3 px-6 py-4 text-sm uppercase tracking-widest font-bold border border-accent text-accent hover:bg-accent/10 transition-all"
          >
            {queuePage.cta.buttonText}
          </Link>

          {/* Terminal readout */}
          <div className="mt-12 max-w-md mx-auto text-left">
            {queuePage.terminalOutput.map((line, i) => (
              <p
                key={i}
                className="text-xs text-muted/30 font-mono leading-relaxed"
              >
                {line}
              </p>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}