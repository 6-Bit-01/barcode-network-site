import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Hidden Games",
  description: "Play BARCODE: System Override, System Clash Demo and Dead Air in your browser.",
  alternates: { canonical: "/secret-menu" },
};

export default function SecretMenuPage() {
  return (
    <div className="pt-14">
      <section className="border-b border-border noise-bg">
        <div className="mx-auto max-w-7xl px-4 pb-10 pt-12 sm:px-6 sm:pb-12 sm:pt-14">
          <p className="mb-4 text-xs uppercase tracking-[0.5em] text-muted">
            BARCODE NETWORK
          </p>
          <h1 className="max-w-4xl text-3xl font-black uppercase tracking-[0.16em] text-foreground sm:text-5xl">
            Hidden Games
          </h1>
          <p className="mt-5 max-w-3xl text-sm leading-7 text-muted sm:text-base">
            Choose your game and step inside the Network.
          </p>
        </div>
      </section>

      <section aria-label="Choose a game" className="mx-auto grid max-w-7xl gap-6 px-4 py-8 sm:grid-cols-2 sm:px-6 sm:py-10 lg:grid-cols-3">
        <article aria-labelledby="system-override-title" className="flex flex-col border border-accent/40 bg-background p-6 sm:p-8">
          <p className="text-xs uppercase tracking-[0.3em] text-accent">
            BARCODE: SYSTEM OVERRIDE
          </p>
          <h2 id="system-override-title" className="mt-4 text-2xl font-black uppercase tracking-wide text-foreground sm:text-3xl">
            System Override
          </h2>
          <p className="mt-4 text-sm leading-7 text-muted">
            Play System Override in your browser. Choose your controls and start
            playing.
          </p>
          <p className="mt-4 text-sm leading-7 text-muted">
            Saved settings and progress belong to this browser on this site.
            Saves from the Makko version do not transfer automatically.
          </p>
          <div className="mt-auto pt-6">
            <a
              href="/games/system-override/index.html"
              className="inline-flex min-h-12 items-center justify-center border border-accent px-4 py-3 text-xs font-bold uppercase tracking-[0.25em] text-accent transition-colors hover:bg-accent hover:text-background focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
            >
              Play System Override
            </a>
          </div>
        </article>

        <article aria-labelledby="system-clash-title" className="flex flex-col border border-accent/40 bg-background p-6 sm:p-8">
          <p className="text-xs uppercase tracking-[0.3em] text-accent">
            BARCODE: SYSTEM CLASH DEMO
          </p>
          <h2 id="system-clash-title" className="mt-4 text-2xl font-black uppercase tracking-wide text-foreground sm:text-3xl">
            System Clash Demo
          </h2>
          <p className="mt-4 text-sm leading-7 text-muted">
            Choose from 13 BARCODE fighters. Play Solo CPU or Local Two Player
            on the same device, with each fighter&apos;s own moves and Deletions.
          </p>
          <div className="mt-auto pt-6">
            <a
              href="/games/system-clash/play/index.html"
              className="inline-flex min-h-12 items-center justify-center border border-accent px-4 py-3 text-xs font-bold uppercase tracking-[0.25em] text-accent transition-colors hover:bg-accent hover:text-background focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
            >
              Play System Clash Demo
            </a>
          </div>
        </article>
        <article aria-labelledby="dead-air-title" className="flex flex-col border border-accent/40 bg-background p-6 sm:p-8">
          <p className="text-xs uppercase tracking-[0.3em] text-accent">
            BARCODE: DEAD AIR
          </p>
          <h2 id="dead-air-title" className="mt-4 text-2xl font-black uppercase tracking-wide text-foreground sm:text-3xl">
            Dead Air
          </h2>
          <p className="mt-4 text-sm leading-7 text-muted">
            Rescue the BARCODE crew, build your camp and bring the broadcast back.
            Story-led tutorials teach each mechanic as you play.
          </p>
          <p className="mt-4 text-sm leading-7 text-muted">
            Play with keyboard, controller or touch. Progress saves in this
            browser on this site.
          </p>
          <div className="mt-auto pt-6">
            <a
              href="/games/dead-air/index.html"
              className="inline-flex min-h-12 items-center justify-center border border-accent px-4 py-3 text-xs font-bold uppercase tracking-[0.25em] text-accent transition-colors hover:bg-accent hover:text-background focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
            >
              Play Dead Air
            </a>
          </div>
        </article>
      </section>
    </div>
  );
}
