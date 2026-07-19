import Link from "next/link";
import Image from "next/image";
import { releasesPage } from "@/content";
import { PageHero, SectionDot } from "@/components/LiveEffects";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Releases — BARCODE Network",
  description:
    "Official BARCODE Network release catalog with available artwork, descriptions, and verified streaming links.",
  openGraph: {
    title: "Releases — BARCODE Network",
    description:
      "Official BARCODE Network release catalog with available artwork, descriptions, and verified streaming links.",
  },
  alternates: { canonical: "/releases" },
};

const releases = releasesPage.catalog;
const platformLabels: Record<string, string> = {
  spotify: "Spotify",
  apple: "Apple Music",
  youtube: "YouTube Music",
  soundcloud: "SoundCloud",
};

export default function ReleasesPage() {
  const [featuredRelease, ...catalogReleases] = releases;

  return (
    <div className="pt-14">
      <section className="border-b border-border noise-bg">
        <div className="mx-auto max-w-7xl px-4 pb-14 pt-12 sm:px-6 sm:pb-16 sm:pt-14">
          <PageHero
            label={releasesPage.hero.label}
            heading={releasesPage.hero.heading}
            description={releasesPage.hero.description}
          />
        </div>
      </section>

      {featuredRelease ? (
        <section className="border-b border-border">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
            <div className="mb-8 flex items-center gap-3">
              <SectionDot />
              <h2 className="text-xs uppercase tracking-[0.5em] text-muted sm:text-sm">Start Here</h2>
            </div>
            <ReleaseCard release={featuredRelease} featured />
          </div>
        </section>
      ) : null}

      <section className="border-b border-border">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
          <div className="mb-10 flex items-center gap-3">
            <SectionDot />
            <h2 className="text-xs uppercase tracking-[0.5em] text-muted sm:text-sm">Catalog</h2>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {catalogReleases.map((release) => (
              <ReleaseCard key={`${release.title}-${release.date}`} release={release} />
            ))}
          </div>

          <p className="mt-8 text-xs uppercase tracking-wider text-muted/50">
            Showing {releases.length} catalog {releases.length === 1 ? "entry" : "entries"} from the existing release data.
          </p>
        </div>
      </section>

      <section>
        <div className="mx-auto max-w-7xl px-4 py-16 text-center sm:px-6">
          <p className="mb-6 text-base text-muted">{releasesPage.bottomCta.text}</p>
          <Link
            href={releasesPage.bottomCta.buttonHref}
            className="inline-flex items-center px-6 py-3 text-sm uppercase tracking-widest border border-accent text-accent hover:bg-accent hover:text-background transition-all"
          >
            {releasesPage.bottomCta.buttonText}
          </Link>
        </div>
      </section>
    </div>
  );
}

function ReleaseCard({ release, featured = false }: { release: (typeof releases)[number]; featured?: boolean }) {
  const links = Object.entries(release.links).filter(([, href]) => Boolean(href));

  return (
    <article className={`border border-border bg-surface transition-colors hover:border-accent/20 ${featured ? "lg:grid lg:grid-cols-[minmax(260px,0.42fr)_1fr]" : ""}`}>
      {release.cover ? (
        <div className={`relative aspect-square ${featured ? "lg:aspect-auto" : ""} crt-scanlines crt-vignette`}>
          <Image src={release.cover} alt={`${release.title} cover artwork`} fill className="object-cover" unoptimized />
        </div>
      ) : null}
      <div className="flex flex-col p-6 sm:p-8">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <span className="border border-accent/30 px-2 py-0.5 text-xs uppercase tracking-widest text-accent">{release.status}</span>
          <span className="text-xs uppercase tracking-wider text-muted">{release.type}</span>
          <span className="text-xs uppercase tracking-wider text-muted">{release.date}</span>
        </div>
        <h3 className={`${featured ? "text-3xl sm:text-5xl" : "text-2xl"} mb-4 font-black uppercase tracking-tight text-foreground`}>
          {release.title}
        </h3>
        <p className="mb-6 text-sm leading-relaxed text-muted sm:text-base">{release.description}</p>
        <div className="mt-auto flex flex-wrap gap-2" aria-label={`Listen to ${release.title}`}>
          {links.length > 0 ? (
            links.map(([platform, href]) => (
              <a
                key={platform}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-2 text-xs uppercase tracking-wider border border-border-light text-foreground/80 hover:border-accent hover:text-accent transition-all"
              >
                Listen on {platformLabels[platform] ?? platform}
              </a>
            ))
          ) : (
            <span className="px-3 py-2 text-xs uppercase tracking-wider border border-border-light text-muted">
              No streaming links listed
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
