import Link from "next/link";
import { radioPage, externalLinks } from "@/content";
import { RadioHero, SectionDot } from "@/components/LiveEffects";
import { LocalSchedule } from "@/components/LocalSchedule";
import type { Metadata } from "next";
import { BNLRelayModule } from "@/components/BNLRelay";

export const metadata: Metadata = {
  title: "BARCODE Radio — Submit Music & Listen Live",
  description:
    "A live intake frequency. Submissions open at 6:40 PM PT, show starts at 7:00 PM PT, music starts at 7:05 PM PT.",
  openGraph: {
    title: "BARCODE Radio — Submit Music & Listen Live",
    description:
      "A live intake frequency. Submissions open at 6:40 PM PT, show starts at 7:00 PM PT, music starts at 7:05 PM PT.",
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

          {/* Schedule notice + Discord signal note — operational info */}
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,32rem)_minmax(18rem,24rem)] gap-4 lg:gap-6 max-w-5xl items-stretch">
            <LocalSchedule
              day={radioPage.schedule.day}
              queueOpens={radioPage.schedule.queueOpens}
              showBegins={radioPage.schedule.showBegins}
              firstTrack={radioPage.schedule.firstTrack}
              notice={radioPage.schedule.notice}
            />

            <div className="relative overflow-hidden border border-accent/30 bg-background/70 p-4 sm:p-5 shadow-[0_0_30px_rgba(255,0,0,0.08)]">
              <div className="absolute inset-x-0 top-0 h-px bg-accent/50" aria-hidden="true" />
              <div className="flex items-start gap-3">
                <span className="mt-1 h-2 w-2 shrink-0 bg-accent shadow-[0_0_12px_rgba(255,0,0,0.75)]" aria-hidden="true" />
                <div>
                  <p className="text-[10px] sm:text-xs uppercase tracking-[0.35em] text-accent mb-2">
                    Discord Signal Link
                  </p>
                  <p className="text-sm text-muted leading-relaxed">
                    BNL-01 relay updates can echo public activity from the BARCODE Network Discord. Talk to BNL, ask questions, drop music, or start a strange enough signal — your name may surface here as a relay fragment, observation, or unexpected shoutout.
                  </p>
                  <p className="mt-3 text-[10px] uppercase tracking-[0.28em] text-muted/50">
                    No warning. No guarantee. The outer channel decides what echoes.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Primary CTAs — above the fold */}
          <div className="mt-6 max-w-lg">
            <div className="flex flex-col sm:flex-row gap-4">
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
            <div className="mt-4">
              <a
                href={externalLinks.tiktokLive}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full inline-flex items-center justify-center gap-3 px-6 py-4 text-sm sm:text-base uppercase tracking-widest font-bold border border-border-light text-foreground/80 hover:border-accent hover:text-accent transition-all text-center"
              >
                <span className="text-lg">{radioPage.hero.tiktokButton.emoji}</span>
                {radioPage.hero.tiktokButton.text}
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* BNL-01 Broadcast Monitor */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12">
          <BNLRelayModule title="BNL-01 Broadcast Monitor" />
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
      <section className="noise-bg">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-16">
          <div className="text-center mb-10">
            <p className="text-xs sm:text-sm uppercase tracking-[0.5em] text-muted mb-3">
              {radioPage.goDeeper.label}
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-foreground/80">
              {radioPage.goDeeper.heading}
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {radioPage.goDeeper.cards.map((card) => (
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
            {radioPage.goDeeper.footnote}
          </p>
        </div>
      </section>
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
