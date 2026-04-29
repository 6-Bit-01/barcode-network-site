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
            heading={merchPage.hero.heading}
            description={merchPage.hero.description}
          />
        </div>
      </section>

      {/* Products — 1st Wave */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-16">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <SectionDot />
              <h2 className="text-xs sm:text-sm uppercase tracking-[0.5em] text-muted">
                1st Wave — Supply Drop
              </h2>
            </div>
            <a
              href={merchPage.storeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-accent/60 hover:text-accent uppercase tracking-widest transition-colors"
            >
              View Store →
            </a>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {merchPage.products.map((product) => (
              <a
                key={product.name}
                href={product.href}
                target="_blank"
                rel="noopener noreferrer"
                className="group border border-border bg-surface hover:border-accent/40 p-6 transition-all"
              >
                <span className="text-xs text-accent/50 uppercase tracking-[0.3em]">
                  {product.tag}
                </span>
                <h3 className="text-sm font-bold text-foreground mt-2 mb-3 group-hover:text-accent transition-colors leading-snug">
                  {product.name}
                </h3>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold text-accent">
                    {product.price}
                  </span>
                  <span className="text-xs text-muted line-through">
                    {product.originalPrice}
                  </span>
                </div>
                <span className="block mt-3 text-xs text-muted/40 uppercase tracking-wider group-hover:text-accent/60 transition-colors">
                  Get it →
                </span>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* Book — OBSERVER NOT FOUND */}
      <section className="border-b border-border noise-bg">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-16">
          <div className="flex items-center gap-3 mb-8">
            <SectionDot />
            <h2 className="text-xs sm:text-sm uppercase tracking-[0.5em] text-muted">
              Publication
            </h2>
          </div>

          <a
            href={merchPage.book.href}
            target="_blank"
            rel="noopener noreferrer"
            className="group block border border-border bg-surface hover:border-accent/40 p-8 transition-all max-w-3xl"
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
            <p className="text-sm text-muted leading-relaxed mb-6 max-w-xl">
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
              {merchPage.terminalOutput.map((line, i) => (
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