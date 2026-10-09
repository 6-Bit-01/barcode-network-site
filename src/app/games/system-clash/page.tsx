import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "System Clash Demo",
  description: "Play BARCODE: SYSTEM CLASH Demo with 19 fighters, seven interactive stages, Solo CPU, Local Two Player, Tournament and Online sessions.",
  alternates: { canonical: "/games/system-clash" },
};

export default function SystemClashPage() {
  return (
    <div className="pt-14">
      <section className="border-b border-border noise-bg">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
          <p className="text-xs uppercase tracking-[0.4em] text-accent">
            BARCODE Network · Playable demo
          </p>
          <h1 className="mt-4 text-4xl font-black uppercase tracking-tight text-foreground sm:text-6xl">
            System Clash Demo
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-7 text-muted">
            Choose from 19 BARCODE fighters across seven interactive stages. Play
            Solo CPU, Local Two Player, Tournament or an Online session,
            and learn their moves and signature Deletions.
          </p>
          <a
            href="/games/system-clash/play/index.html"
            className="mt-8 inline-flex min-h-12 items-center justify-center border border-accent bg-accent/10 px-6 py-3 text-sm font-bold uppercase tracking-[0.2em] text-accent transition-colors hover:bg-accent hover:text-background focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
          >
            Play System Clash Demo
          </a>
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
        <p className="max-w-2xl text-sm leading-7 text-muted">
          Keyboard, onscreen and PS5-style controller controls are available inside the game. This
          demo is a place to play, explore the fighters, and try their signature
          finishes as the game develops.
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
