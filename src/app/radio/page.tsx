import Link from "next/link";
import { radioPage, externalLinks } from "@/content";
import { RadioHero, SectionDot } from "@/components/LiveEffects";
import { LocalSchedule } from "@/components/LocalSchedule";
import type { Metadata } from "next";
import { BNLRelayModule } from "@/components/BNLRelay";
import { getRadioSubmissionRouting } from "@/lib/radio-submission-routing";

export const metadata: Metadata = {
  title: "BARCODE Radio — Submit Music & Listen Live",
  description:
    "A live intake frequency. Submissions open at 6:40 PM PT, show starts at 7:00 PM PT, music starts at 7:05 PM PT.",
  openGraph: {
    title: "BARCODE Radio — Submit Music & Listen Live",
    description:
      "A live intake frequency. Submissions open at 6:40 PM PT, show starts at 7:00 PM PT, music starts at 7:05 PM PT.",
    url: "https://www.barcode-network.com/radio",
  },
  twitter: { card: "summary" },
  alternates: { canonical: "/radio" },
};

export default function RadioPage() {
  const submission = getRadioSubmissionRouting();
  const steps = radioPage.steps.map((step) => {
    if (step.number === "01") {
      return { ...step, description: submission.submitStepDescription };
    }
    if (step.number === "02") {
      return { ...step, description: submission.queueStepDescription };
    }
    return step;
  });
  const rules = radioPage.rules.map((rule, index) =>
    index === 2 ? submission.acceptedSourcesRule : rule,
  );

  return (
    <div className="pt-14">
      {/* Hero — Submit buttons FIRST, zero friction */}
      <section className="border-b border-border noise-bg">
        <div className="mx-auto max-w-7xl px-4 pb-14 pt-12 sm:px-6 sm:pb-16 sm:pt-14">
          <RadioHero
            label={radioPage.hero.label}
            heading1={radioPage.hero.heading1}
            heading2={radioPage.hero.heading2}
            description={submission.heroDescription}
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
          <div className="max-w-lg">
            <div className="flex flex-col sm:flex-row gap-4">
              {submission.external ? (
                <a
                  href={submission.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 inline-flex items-center justify-center gap-3 px-6 py-4 text-sm sm:text-base uppercase tracking-widest font-bold bg-accent text-background hover:bg-accent-dim transition-all text-center"
                >
                  <span className="text-lg">{radioPage.hero.submitButton.emoji}</span>
                  {submission.heroSubmitLabel}
                </a>
              ) : (
                <Link
                  href={submission.href}
                  className="flex-1 inline-flex items-center justify-center gap-3 px-6 py-4 text-sm sm:text-base uppercase tracking-widest font-bold bg-accent text-background hover:bg-accent-dim transition-all text-center"
                >
                  <span className="text-lg">{radioPage.hero.submitButton.emoji}</span>
                  {submission.heroSubmitLabel}
                </Link>
              )}
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

          {submission.mode === "native_queue" && submission.radioPageGuide ? (
            <section
              aria-label="BARCODE Radio queue guide"
              className="mt-6 max-w-3xl border border-accent/35 bg-surface/80 p-5 sm:p-6"
            >
              <p className="text-xs font-bold uppercase tracking-[0.35em] text-accent">
                {submission.radioPageGuide.label}
              </p>
              <h2 className="mt-3 text-xl font-bold text-foreground sm:text-2xl">
                {submission.radioPageGuide.heading}
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
                {submission.radioPageGuide.description}
              </p>
              <ul className="mt-5 grid gap-3 text-sm text-muted sm:grid-cols-2">
                {submission.radioPageGuide.items.map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-3 border border-border bg-background/45 px-4 py-3 leading-relaxed"
                  >
                    <span className="mt-0.5 text-accent">▸</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section aria-label="BARCODE Radio companion tools" className="mt-6 grid max-w-3xl gap-3 sm:grid-cols-2">
            <Link href="/radio/deck" className="group border border-[#ffaa00]/45 bg-[#ffaa00]/5 p-5 transition-colors hover:border-[#ffaa00]"><p className="text-xs font-bold uppercase tracking-[0.3em] text-[#ffaa00]">During the show</p><h2 className="mt-2 text-xl font-black text-foreground group-hover:text-[#ffaa00]">The Broadcast Deck</h2><p className="mt-2 text-sm leading-relaxed text-muted">A live companion for the queue feed, Now Playing, show progress, Wheel movement, and this browser’s submissions.</p><span className="mt-4 inline-flex text-xs font-bold uppercase tracking-widest text-[#ffaa00]">Open Deck →</span></Link>
            <Link href="/radio/archive" className="group border border-cyan-200/40 bg-cyan-200/5 p-5 transition-colors hover:border-cyan-200"><p className="text-xs font-bold uppercase tracking-[0.3em] text-cyan-200">After the show</p><h2 className="mt-2 text-xl font-black text-foreground group-hover:text-cyan-200">The Broadcast Archive</h2><p className="mt-2 text-sm leading-relaxed text-muted">Search shows and artists, then trace tracks, submitting TikTok handles, public links, outcomes, and Wheel selections.</p><span className="mt-4 inline-flex text-xs font-bold uppercase tracking-widest text-cyan-200">Browse Archive →</span></Link>
          </section>
        </div>
      </section>

      {/* BNL-01 Broadcast Monitor */}
      <section className="border-b border-border">
        <div className="mx-auto grid max-w-7xl gap-6 px-4 py-12 sm:px-6 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <div className="flex items-center gap-3 mb-6">
              <SectionDot />
              <h2 className="text-xs sm:text-sm uppercase tracking-[0.5em] text-muted">
                BNL-01 Relay
              </h2>
            </div>
            <p className="text-sm leading-relaxed text-muted">
              BNL-01 watches public movement around BARCODE Radio—what the community is discussing, what keeps returning, and what changes around the show—then reflects approved readings on the site. Music, submissions, and the host remain primary.
            </p>
            <Link href="/bnl" className="mt-4 inline-flex font-mono text-xs uppercase tracking-widest text-accent hover:text-foreground">Open BNL-01 Hub →</Link>
          </div>
          <BNLRelayModule title="BNL-01 Broadcast Monitor" />
        </div>
      </section>

      {/* How It Works — condensed inline */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {steps.map((step) => (
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
              {rules.map((rule, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-accent mt-0.5">▸</span>
                  {rule}
                </li>
              ))}
            </ul>
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
