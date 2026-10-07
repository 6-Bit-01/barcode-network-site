import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "System Clash",
  description: "Play the first BARCODE: SYSTEM CLASH browser prototype.",
  alternates: { canonical: "/games/system-clash" },
};

export default function SystemClashPage() {
  return (
    <div className="pt-14">
      <section className="border-b border-border noise-bg">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
          <p className="text-xs uppercase tracking-[0.4em] text-accent">
            BARCODE Network · First playable prototype
          </p>
          <h1 className="mt-4 text-4xl font-black uppercase tracking-tight text-foreground sm:text-6xl">
            System Clash
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-7 text-muted">
            Choose a BARCODE fighter, face the CPU or another player on the same
            device, and practice the moves and Deletions.
          </p>
          <a
            href="/games/system-clash/play/fight.html"
            className="mt-8 inline-flex min-h-12 items-center justify-center border border-accent bg-accent/10 px-6 py-3 text-sm font-bold uppercase tracking-[0.2em] text-accent transition-colors hover:bg-accent hover:text-background focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
          >
            Play System Clash
          </a>
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
        <p className="max-w-2xl text-sm leading-7 text-muted">
          Keyboard and onscreen controls are available inside the game. This
          first version is a place to play, explore the fighters, and try their
          signature finishes as the game develops.
        </p>
        <div className="mt-6 flex flex-wrap gap-x-6 gap-y-3 text-sm text-accent">
          <a className="underline underline-offset-4" href="/releases">
            Explore BARCODE music
          </a>
          <a className="underline underline-offset-4" href="/radio">
            Tune into BARCODE Radio
          </a>
        </div>
      </section>
    </div>
  );
}
