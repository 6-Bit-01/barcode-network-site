import { PublicIcon } from "@/components/PublicIcon";
import { merchPage, externalLinks } from "@/content";
import { PageHero } from "@/components/LiveEffects";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Merch — BARCODE Network",
  description:
    "Archive of BARCODE Network's 1st Wave merch, currently out of stock, plus Observer Not Found.",
  openGraph: {
    title: "Merch — BARCODE Network",
    description:
      "Archive of BARCODE Network's 1st Wave merch, currently out of stock, plus Observer Not Found.",
  },
  alternates: { canonical: "/merch" },
};

export default function MerchPage() {
  return (
    <div className="public-page">
      {/* Hero */}
      <section className="public-section">
        <div className="public-container">
          <PageHero
            label={merchPage.hero.label}
            heading={merchPage.hero.heading}
            description={merchPage.hero.description}
          />
        </div>
      </section>

      {/* Products — 1st Wave */}
      <section className="public-section">
        <div className="public-container">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <PublicIcon name="merch" className="public-icon" />
              <h2 className="public-section-heading">
                1st Wave — Archived Drop
              </h2>
            </div>
            <span className="text-xs text-muted uppercase tracking-widest">
              Storefront retired
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {merchPage.products.map((product) => (
              <article
                key={product.name}
                className="public-card"
              >
                <span className="text-xs text-accent/50 uppercase tracking-[0.3em]">
                  {product.tag}
                </span>
                <h3 className="text-sm font-bold text-foreground mt-2 mb-4 leading-snug">
                  {product.name}
                </h3>
                <span className="inline-flex border border-muted/30 px-2 py-1 text-xs font-bold uppercase tracking-wider text-muted">
                  {product.status}
                </span>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Book — OBSERVER NOT FOUND */}
      <section className="public-section">
        <div className="public-container">
          <div className="flex items-center gap-3 mb-8">
            <PublicIcon name="merch" className="public-icon" />
            <h2 className="public-section-heading">
              Publication
            </h2>
          </div>

          <a
            href={merchPage.book.href}
            target="_blank"
            rel="noopener noreferrer"
            className="public-card group block max-w-3xl"
          >
            <span className="text-xs text-accent/50 uppercase tracking-[0.3em]">
              {merchPage.book.tag}
            </span>
            <h3 className="text-2xl sm:text-3xl font-bold text-foreground mt-3 mb-2 group-hover:text-accent transition-colors tracking-wider">
              {merchPage.book.title}
            </h3>
            <p className="text-xs text-muted uppercase tracking-widest mb-4">
              by {merchPage.book.author} — {merchPage.book.format}
            </p>
            <p className="public-intro mb-6 max-w-xl">
              {merchPage.book.description}
            </p>
            <div className="flex flex-wrap gap-4 mb-4">
              <span className="text-xs text-muted border border-border px-3 py-1.5">
                Kindle <span className="text-foreground font-bold">{merchPage.book.prices.kindle}</span>
              </span>
              <span className="text-xs text-muted border border-border px-3 py-1.5">
                Paperback <span className="text-foreground font-bold">{merchPage.book.prices.paperback}</span>
              </span>
              <span className="text-xs text-accent border border-accent/30 px-3 py-1.5">
                Hardcover <span className="text-accent font-bold">{merchPage.book.prices.hardcover}</span>
              </span>
            </div>
            <span className="block text-xs text-muted/40 uppercase tracking-wider group-hover:text-accent/60 transition-colors">
              Available on Amazon →
            </span>
          </a>
        </div>
      </section>

      {/* Discord CTA */}
      <section className="public-section">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 py-12 text-center">
          <p className="text-sm text-muted mb-4">
            Future drops announced through official channels.
          </p>
          <a
            href={externalLinks.discord}
            target="_blank"
            rel="noopener noreferrer"
            className="public-button public-button--primary"
          >
            Join Discord for drop alerts →
          </a>
        </div>
      </section>

      {/* Terminal Output */}
      <section className="public-section">
        <div className="public-container">
          <details className="public-disclosure"><summary>Supply system archive</summary><div className="public-disclosure-content font-mono">
            <p className="text-xs text-muted mb-4">
              &gt; BARCODE_NETWORK // SUPPLY_SYSTEM
            </p>
            <div className="space-y-1 text-sm text-foreground/60">
              {merchPage.terminalOutput.map((line, i) => (
                <p key={i}>&gt; {line}</p>
              ))}
              <p className="text-accent mt-4">
                &gt; FIRST WAVE ARCHIVED<span className="cursor-blink">_</span>
              </p>
            </div>
          </div></details>
        </div>
      </section>
    </div>
  );
}
