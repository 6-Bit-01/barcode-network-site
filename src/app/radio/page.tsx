import Link from "next/link";
import { radioPage, externalLinks } from "@/content";
import { RadioHero, SectionDot } from "@/components/LiveEffects";
import { LocalSchedule } from "@/components/LocalSchedule";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "BARCODE Radio — Submit Music & Listen Live",
  description:
    "A live intake frequency. Submit a track via Auxchord. Every Friday at 6:30 PM PST.",
  openGraph: {
    title: "BARCODE Radio — Submit Music & Listen Live",
    description:
      "A live intake frequency. Submit a track via Auxchord. Every Friday at 6:30 PM PST.",
    images: [{ url: "/radio-cover.png", width: 1400, height: 1400 }],
  },
};

export default function RadioPage() {
  return (
    <div className="pt-14">
      {/* Hero — Submit buttons FIRST, zero friction */}
      <section className="border-b border-border noise-bg">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-16 sm:py-24">
          <RadioHero
            label={radioPage.hero.label}
            heading1={radioPage.hero.heading1}
            heading2={radioPage.hero.heading2}
            description={radioPage.hero.description}
          />

          {/* Schedule notice — auto-converts to visitor's timezone */}
          <LocalSchedule
            day={radioPage.schedule.day}
            queueOpens={radioPage.schedule.queueOpens}
            showBegins={radioPage.schedule.showBegins}
            firstTrack={radioPage.schedule.firstTrack}
            notice={radioPage.schedule.notice}
          />

          {/* Primary CTAs — above the fold */}
          <div className="flex flex-col sm:flex-row gap-4 max-w-lg">
            <a
              href={externalLinks.auxchord}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 inline-flex items-center justify-center gap-3 px-6 py-4 text-sm sm:text-base uppercase tracking-widest font-bold bg-accent text-background hover:bg-accent-dim transition-all text-center"
            >
              <span className="text-lg">{radioPage.hero.submitButton.emoji}</span>
              {radioPage.hero.submitButton.text}
            </a>
            <a
              href={externalLinks.discord}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 inline-flex items-center justify-center gap-3 px-6 py-4 text-sm sm:text-base uppercase tracking-widest font-bold border border-border-light text-foreground/80 hover:border-accent hover:text-accent transition-all text-center"
            >
              <span className="text-lg">{radioPage.hero.discordButton.emoji}</span>
              {radioPage.hero.discordButton.text}
            </a>
          </div>
        </div>
      </section>

      {/* How It Works — condensed inline */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {radioPage.steps.map((step) => (
              <StepCard key={step.number} number={step.number} title={step.title} description={step.description} />
            ))}
          </div>
        </div>
      </section>

      {/* Submission Guidelines */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12">
          <div className="flex items-center gap-3 mb-6">
            <SectionDot />
            <h2 className="text-xs sm:text-sm uppercase tracking-[0.5em] text-muted">
              Submission Rules
            </h2>
          </div>

          <div className="border border-border bg-surface p-6 max-w-2xl">
            <ul className="space-y-3 text-sm text-muted leading-relaxed">
              {radioPage.rules.map((rule, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-accent mt-0.5">▸</span>
                  {rule}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Recent Broadcasts / Receipts */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12">
          <div className="flex items-center gap-3 mb-8">
            <SectionDot />
            <h2 className="text-xs sm:text-sm uppercase tracking-[0.5em] text-muted">
              Broadcast Receipts
            </h2>
          </div>

          <div className="space-y-3">
            {radioPage.receipts.map((receipt, i) => (
              <ReceiptRow key={i} {...receipt} />
            ))}
          </div>
        </div>
      </section>

      {/* Go Deeper — lore hooks to pull them into the network */}
      {(radioPage as { goDeeper?: {
        label: string;
        heading: string;
        cards: { href: string; tag: string; title: string; description: string; cta: string }[];
        footnote: string;
      } }).goDeeper && (
      <section className="noise-bg">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-16">
          <div className="text-center mb-10">
            <p className="text-xs sm:text-sm uppercase tracking-[0.5em] text-muted mb-3">
              {(radioPage as { goDeeper: { label: string } }).goDeeper.label}
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-foreground/80">
              {(radioPage as { goDeeper: { heading: string } }).goDeeper.heading}
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {(radioPage as { goDeeper: { cards: { href: string; tag: string; title: string; description: string; cta: string }[] } }).goDeeper.cards.map((card) => (
              <Link
                key={card.href}
                href={card.href}
                className="group border border-border bg-surface hover:border-accent/40 p-6 transition-all"
              >
                <span className="text-xs uppercase tracking-[0.3em] text-accent/60 group-hover:text-accent transition-colors">
                  {card.tag}
                </span>
                <h3 className="text-lg font-bold text-foreground mt-1 mb-2 group-hover:text-accent transition-colors">
                  {card.title}
                </h3>
                <p className="text-sm text-muted leading-relaxed">
                  {card.description}
                </p>
                <span className="block mt-4 text-xs text-muted/40 uppercase tracking-wider group-hover:text-accent/60 transition-colors">
                  {card.cta}
                </span>
              </Link>
            ))}
          </div>

          <p className="text-center text-xs text-muted/30 mt-10 uppercase tracking-widest">
            {(radioPage as { goDeeper: { footnote: string } }).goDeeper.footnote}
          </p>
        </div>
      </section>
      )}
    </div>
  );
}

function StepCard({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <div className="border border-border bg-surface p-6">
      <span className="text-2xl font-bold text-accent/20 mb-2 block">
        {number}
      </span>
      <h3 className="text-base font-bold text-foreground mb-2">{title}</h3>
      <p className="text-sm text-muted leading-relaxed">{description}</p>
    </div>
  );
}

function ReceiptRow({
  date,
  songs,
  views,
  taps,
}: {
  date: string;
  songs: number;
  views: string;
  taps: string;
}) {
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border border-border bg-surface px-5 py-3 hover:border-accent/20 transition-colors">
      <span className="text-xs text-muted font-mono">{date}</span>
      <div className="flex items-center gap-6 mt-2 sm:mt-0">
        <span className="text-xs text-muted uppercase">
          <span className="text-foreground/60">{songs}</span> songs
        </span>
        <span className="text-xs text-muted uppercase">
          <span className="text-foreground/60">{views}</span> views
        </span>
        <span className="text-xs text-accent uppercase">
          <span className="text-accent">{taps}</span> taps
        </span>
      </div>
    </div>
  );
}
