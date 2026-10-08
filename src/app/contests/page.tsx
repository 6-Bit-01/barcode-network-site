import { PublicIcon } from "@/components/PublicIcon";
import type { Metadata } from "next";
import { HellcatLadder } from "@/components/HellcatLadder";
import { HellcatSchedule } from "@/components/HellcatSchedule";

export const metadata: Metadata = {
  title: "Community Contests",
  description: "Tune into HellcatNZ's weekly KOTH contest, follow the official standings and find daily community radio, weekly artist features and creative challenges.",
  alternates: { canonical: "/contests" },
  openGraph: {
    title: "Community Contests — BARCODE Network",
    description: "Weekly KOTH. Daily radio. Real ears on your music. Follow HellcatNZ's standings and tune into his community on Discord.",
    url: "https://www.barcode-network.com/contests",
  },
  twitter: { card: "summary" },
};

const communityActivities = [
  {
    number: "02",
    label: "Daily broadcast",
    title: "Community Radio",
    description: "Tune in and let the outside noise drop away. Hang out, listen together and discover new tracks with other creators. This frequency has room for you.",
  },
  {
    number: "03",
    label: "Weekly signal boost",
    title: "Artist Features",
    description: "Put a creator's signal front and center. Weekly features spotlight the people making the music, with real attention that goes beyond a bot reaction.",
  },
  {
    number: "04",
    label: "Rotating challenges",
    title: "Song Creation Challenges",
    description: "Break the pattern. Rewire your approach. Curated, rotating song creation challenges send your creativity down a new circuit, without pressure. Just make something.",
  },
];

export default function ContestsPage() {
  return (
    <div className="public-page">
      <section className="public-section">
        <div className="public-container">
          <p className="public-kicker">BARCODE Network · Community</p>
          <h1 className="public-title">Contests</h1>
          <p className="public-intro">Fresh tracks. Open frequencies. Music and community on the same wavelength. Tune into HellcatNZ&apos;s KOTH contest and follow the artists in the standings.</p>
        </div>
      </section>
      <section aria-labelledby="hellcat-community-title" className="public-section public-section--muted">
        <div className="public-container">
          <div className="mb-7 flex flex-wrap items-end justify-between gap-5">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.25em] text-accent">Community signal // HellcatNZ</p>
              <h2 id="hellcat-community-title" className="mt-3 text-2xl font-bold text-foreground sm:text-3xl">Tune into HellcatNZ&apos;s frequency</h2>
            </div>
            <a
              href="https://discord.gg/HellcatNZ"
              target="_blank"
              rel="noopener noreferrer"
              className="public-button public-button--primary"
            >
              Join HellcatNZ&apos;s Discord <span aria-hidden="true">↗</span>
            </a>
          </div>

          <ul className="grid gap-3 lg:grid-cols-2">
            <li className="relative overflow-hidden border border-accent/50 bg-accent/5 p-6 sm:p-8 lg:row-span-3">
              <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-accent via-accent/40 to-transparent" />
              <div className="flex items-center justify-between gap-4 font-mono text-xs uppercase tracking-widest text-accent">
                <span>01 // Weekly contest</span>
                <span aria-hidden="true">[ KOTH ]</span>
              </div>
              <h3 className="mt-6 text-3xl font-bold uppercase leading-tight text-foreground sm:text-4xl">King of<br />the Hill <PublicIcon name="trophy" className="public-icon inline-block" /></h3>
              <HellcatSchedule />
              <p className="mt-5 max-w-xl text-sm leading-relaxed text-foreground/80">Send your track into the KOTH channel and put your signal to the test. Songs hit community radio live, get reviewed by <span className="font-mono text-accent">@reviewcrew</span> and face the verdict in real time.</p>
              <ul className="mt-6 space-y-3 text-sm text-foreground/90">
                {["Live listening // Real ears on your music", "Honest feedback // No static", "A unique winner shout-out // Your signal amplified"].map((item) => (
                  <li key={item} className="flex gap-3"><span aria-hidden="true" className="font-mono text-accent">&gt;</span><span>{item}</span></li>
                ))}
              </ul>
              <p className="mt-7 border-t border-accent/20 pt-4 font-mono text-xs uppercase tracking-wider text-accent">Zero toxicity // All vibes</p>
            </li>
            {communityActivities.map((activity) => (
              <li key={activity.number} className="public-card">
                <p className="font-mono text-[11px] uppercase tracking-widest text-accent">{activity.number}{" // "}{activity.label}</p>
                <h3 className="mt-2 text-lg font-bold text-foreground sm:text-xl">{activity.title}</h3>
                <details className="public-disclosure mt-3"><summary>About {activity.title}</summary><div className="public-disclosure-content"><p>{activity.description}</p></div></details>
              </li>
            ))}
          </ul>
        </div>
      </section>
      <HellcatLadder />
    </div>
  );
}
