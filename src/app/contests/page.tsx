import type { Metadata } from "next";
import { HellcatLadder } from "@/components/HellcatLadder";

export const metadata: Metadata = {
  title: "Community Contests",
  description: "Follow HellcatNZ's KOTH standings and join his community for daily radio, weekly artist features and song creation challenges.",
  alternates: { canonical: "/contests" },
  openGraph: {
    title: "Community Contests — BARCODE Network",
    description: "HellcatNZ's KOTH ladder, community radio, artist features and creative challenges. Find the standings and join his Discord.",
    url: "https://www.barcode-network.com/contests",
  },
  twitter: { card: "summary" },
};

const communityActivities = [
  {
    number: "02",
    label: "Daily broadcast",
    title: "Community Radio",
    description: "Hang out, listen together, discover new tracks and just exist peacefully with other creators.",
  },
  {
    number: "03",
    label: "Weekly spotlight",
    title: "Artist Features",
    description: "Spotlighting creators from the community and giving them real attention, not just a bot reaction.",
  },
  {
    number: "04",
    label: "Rotating challenges",
    title: "Song Creation Challenges",
    description: "Curated challenges designed to push creativity without pressure. Try something new and have fun making it.",
  },
];

export default function ContestsPage() {
  return (
    <div className="pt-14">
      <section className="border-b border-border noise-bg">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
          <p className="text-xs uppercase tracking-[0.4em] text-accent">BARCODE Network · Community</p>
          <h1 className="mt-4 text-4xl font-bold tracking-tight text-foreground sm:text-6xl">Contests</h1>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-muted">Music, competition and community. Follow HellcatNZ&apos;s KOTH ladder and discover the artists in the standings.</p>
        </div>
      </section>
      <section aria-labelledby="hellcat-community-title" className="border-b border-border bg-surface/30">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-12">
          <div className="mb-7 flex flex-wrap items-end justify-between gap-5">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.25em] text-accent">Community signal // HellcatNZ</p>
              <h2 id="hellcat-community-title" className="mt-3 text-2xl font-bold text-foreground sm:text-3xl">Inside HellcatNZ&apos;s community</h2>
            </div>
            <a
              href="https://discord.gg/HellcatNZ"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 w-full items-center justify-center gap-3 border border-accent bg-accent/10 px-5 py-3 text-center font-mono text-xs font-bold uppercase tracking-wider text-accent transition-colors hover:bg-accent hover:text-background focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent sm:w-auto"
            >
              Join HellcatNZ&apos;s Discord <span aria-hidden="true">↗</span>
            </a>
          </div>

          <ul className="grid gap-3 lg:grid-cols-2">
            <li className="relative overflow-hidden border border-accent/50 bg-accent/5 p-6 sm:p-8 lg:row-span-3">
              <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-accent via-accent/40 to-transparent" />
              <div className="flex items-center justify-between gap-4 font-mono text-xs uppercase tracking-widest text-accent">
                <span>01 // Daily contest</span>
                <span aria-hidden="true">[ KOTH ]</span>
              </div>
              <h3 className="mt-6 text-3xl font-bold uppercase leading-tight text-foreground sm:text-4xl">King of<br />the Hill <span aria-hidden="true" className="text-accent">👑</span></h3>
              <p className="mt-5 max-w-xl text-sm leading-relaxed text-foreground/80">Every day, songs submitted in the KOTH channel get played live on community radio, reviewed by <span className="font-mono text-accent">@reviewcrew</span> and judged in real time.</p>
              <ul className="mt-6 space-y-3 text-sm text-foreground/90">
                {["Live listening", "Honest feedback", "A unique shout-out for the winner"].map((item) => (
                  <li key={item} className="flex gap-3"><span aria-hidden="true" className="font-mono text-accent">&gt;</span><span>{item}</span></li>
                ))}
              </ul>
              <p className="mt-7 border-t border-accent/20 pt-4 font-mono text-xs uppercase tracking-wider text-accent">Zero toxicity // All vibes</p>
            </li>
            {communityActivities.map((activity) => (
              <li key={activity.number} className="border border-border border-l-2 border-l-accent/50 bg-background/70 p-5 sm:p-6">
                <p className="font-mono text-[11px] uppercase tracking-widest text-accent">{activity.number} // {activity.label}</p>
                <h3 className="mt-2 text-lg font-bold text-foreground sm:text-xl">{activity.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-foreground/75">{activity.description}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>
      <HellcatLadder />
    </div>
  );
}
