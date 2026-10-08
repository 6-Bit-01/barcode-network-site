import Link from "next/link";
import { radioPage, externalLinks } from "@/content";
import { PublicIcon } from "@/components/PublicIcon";
import { LocalSchedule } from "@/components/LocalSchedule";
import type { Metadata } from "next";
import { BNLRelayModule } from "@/components/BNLRelay";
import { RadioBroadcastFeature } from "@/components/RadioBroadcastFeature";
import { RadioQueueEntry } from "@/components/RadioQueueEntry";
import { RadioTikTokLink } from "@/components/RadioTikTokLink";
import { getRadioSubmissionRouting } from "@/lib/radio-submission-routing";
import styles from "./page.module.css";

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
    <div className="public-page">
      {/* Current participation and past shows share the first screen. */}
      <section className="public-section">
        <div className="public-container">
          <div className={styles.discovery}>
            <div className={styles.intro}>
              <p className="public-kicker"><PublicIcon name="radio" />{radioPage.hero.label}</p>
              <h1 className="public-title">{radioPage.hero.heading1} <span className="text-accent">{radioPage.hero.heading2}</span></h1>
              <p className="public-intro mb-8">{submission.heroDescription}</p>

              {submission.mode === "native_queue" && (
                <RadioQueueEntry>
                  <LocalSchedule
                    embedded
                    day={radioPage.schedule.day}
                    queueOpens={radioPage.schedule.queueOpens}
                    showBegins={radioPage.schedule.showBegins}
                    firstTrack={radioPage.schedule.firstTrack}
                    notice={radioPage.schedule.notice}
                  />
                </RadioQueueEntry>
              )}
              {submission.external && <a
                href={submission.href}
                target="_blank"
                rel="noopener noreferrer"
                className="public-button public-button--primary"
              >
                <PublicIcon name="send" />
                {submission.heroSubmitLabel}
              </a>}
            </div>

            <div id="broadcast-archive" tabIndex={-1} className={`${styles.feature} scroll-mt-24`}>
              <RadioBroadcastFeature archiveOnly />
            </div>

            <div className={styles.schedule}>
              {submission.external && (
                <LocalSchedule
                  day={radioPage.schedule.day}
                  queueOpens={radioPage.schedule.queueOpens}
                  showBegins={radioPage.schedule.showBegins}
                  firstTrack={radioPage.schedule.firstTrack}
                  notice={radioPage.schedule.notice}
                />
              )}

              {/* Community and broadcast destinations */}
              <div>
                <div className="flex flex-col sm:flex-row gap-4">
                  <a
                    href={externalLinks.discord}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="public-button w-full"
                  >
                    <PublicIcon name="community" />
                    {radioPage.hero.discordButton.text}
                  </a>
                </div>
                <div className="mt-4">
                  <RadioTikTokLink
                    className="public-button w-full"
                    offlineClassName="border-border-light text-foreground/80"
                    liveClassName="border-accent text-accent"
                  />
                </div>
              </div>
            </div>
          </div>

          {submission.mode === "native_queue" && submission.radioPageGuide ? (
            <details
              aria-label="BARCODE Radio queue guide"
              className="public-disclosure mt-8"
            >
              <summary><PublicIcon name="book" /><span>{submission.radioPageGuide.heading}</span><PublicIcon name="chevron" /></summary>
              <div className="public-disclosure-content">
              <p className="public-kicker">{submission.radioPageGuide.label}</p>
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
              </div>
            </details>
          ) : null}

        </div>
      </section>

      {/* How It Works — condensed inline */}
      <section className="public-section">
        <div className="public-container">
          <h2 className="public-section-heading mb-6">How it works</h2>
          <div className="public-grid">
            {steps.map((step) => (
              <StepCard key={step.number} number={step.number} title={step.title} description={step.description} />
            ))}
          </div>
        </div>
      </section>

      {/* Submission Guidelines */}
      <section className="public-section">
        <div className="public-container">
          <details className="public-disclosure">
            <summary><PublicIcon name="check" /><span>Submission Rules</span><PublicIcon name="chevron" /></summary>
            <div className="public-disclosure-content">
            <ul className="space-y-3 text-sm text-muted leading-relaxed">
              {rules.map((rule, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-accent mt-0.5">▸</span>
                  {rule}
                </li>
              ))}
            </ul>
          </div>
          </details>
        </div>
      </section>

      {/* BNL-01 Broadcast Monitor */}
      <section className="public-section">
        <div className="public-container grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <div className="flex items-center gap-3 mb-6">
              <PublicIcon name="bnl" />
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

      {/* Go Deeper — lore hooks to pull them into the network */}
      <section className="public-section public-section--muted">
        <div className="public-container">
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
                className="public-card group"
              >
                <PublicIcon name={card.href === "/terminal" ? "terminal" : card.href === "/releases" ? "music" : "archive"} className="public-icon mb-5" />
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
    <div className="public-card">
      <span className="text-sm font-bold text-accent mb-4 block">
        {number}
      </span>
      <h3 className="text-base font-bold text-foreground mb-2">{title}</h3>
      <p className="text-sm text-muted leading-relaxed">{description}</p>
    </div>
  );
}
