import type { Metadata } from "next";
import { HellcatLadder } from "@/components/HellcatLadder";

export const metadata: Metadata = {
  title: "Community Contests — BARCODE Network",
  description: "Follow HellcatNZ's KOTH contest ladder, with official rankings and scores supplied by HellcatNZ.",
  alternates: { canonical: "/contests" },
  openGraph: {
    title: "Community Contests — BARCODE Network",
    description: "HellcatNZ's KOTH ladder: the tracks, the artists and the official standings.",
    url: "https://www.barcode-network.com/contests",
  },
  twitter: { card: "summary" },
};

export default function ContestsPage() {
  return (
    <div className="pt-14">
      <section className="border-b border-border noise-bg">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20">
          <p className="text-xs uppercase tracking-[0.4em] text-accent">BARCODE Network · Community</p>
          <h1 className="mt-4 text-4xl font-bold tracking-tight text-foreground sm:text-6xl">Contests</h1>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-muted">Music, competition and community. Follow HellcatNZ&apos;s KOTH ladder and discover the artists in the standings.</p>
        </div>
      </section>
      <HellcatLadder />
    </div>
  );
}
