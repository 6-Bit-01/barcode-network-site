import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "System Override",
  description: "Play BARCODE: System Override in your browser.",
  alternates: { canonical: "/system-override" },
};

export default function SystemOverridePage() {
  return (
    <div className="pt-14">
      <section className="border-b border-border noise-bg">
        <div className="mx-auto max-w-7xl px-4 pb-10 pt-12 sm:px-6 sm:pb-12 sm:pt-14">
          <p className="mb-4 text-xs uppercase tracking-[0.5em] text-muted">
            BARCODE NETWORK
          </p>
          <h1 className="max-w-4xl text-3xl font-black uppercase tracking-[0.16em] text-foreground sm:text-5xl">
            System Override
          </h1>
          <p className="mt-5 max-w-3xl text-sm leading-7 text-muted sm:text-base">
            Play BARCODE: System Override in your browser. Launch the game to
            choose your controls and start playing.
          </p>
          <a
            href="/games/system-override/index.html"
            className="mt-6 inline-flex border border-accent px-4 py-3 text-xs font-bold uppercase tracking-[0.25em] text-accent transition-colors hover:bg-accent hover:text-background focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
          >
            Play System Override
          </a>
        </div>
      </section>

      <section>
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
          <p className="max-w-3xl text-sm leading-7 text-muted">
            Saved settings and progress belong to this browser on this site.
            Saves from the Makko version do not transfer automatically.
          </p>
        </div>
      </section>
    </div>
  );
}
