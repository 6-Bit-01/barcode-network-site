import Link from "next/link";
import Image from "next/image";
import { releasesPage } from "@/content";
import { PublicIcon } from "@/components/PublicIcon";
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
    <div className="public-page">
      <section className="public-section">
        <div className="public-container">
          <p className="public-kicker">
            <PublicIcon name="music" />
            {releasesPage.hero.label}
          </p>
          <h1 className="public-title">{releasesPage.hero.heading}</h1>
          <p className="public-intro">{releasesPage.hero.description}</p>
        </div>
      </section>

      {featuredRelease ? (
        <section className="public-section">
          <div className="public-container">
            <div className="mb-8 flex items-center gap-3">
              <PublicIcon name="music" />
              <h2 className="text-xs uppercase tracking-[0.5em] text-muted sm:text-sm">
                Start Here
              </h2>
            </div>
            <ReleaseCard release={featuredRelease} featured />
          </div>
        </section>
      ) : null}

      <section className="public-section">
        <div className="public-container">
          <div className="mb-10 flex items-center gap-3">
            <PublicIcon name="music" />
            <h2 className="text-xs uppercase tracking-[0.5em] text-muted sm:text-sm">
              Catalog
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {catalogReleases.map((release) => (
              <ReleaseCard
                key={`${release.title}-${release.date}`}
                release={release}
              />
            ))}
          </div>

          <p className="mt-8 text-xs uppercase tracking-wider text-muted/50">
            Showing {releases.length} catalog{" "}
            {releases.length === 1 ? "entry" : "entries"} from the existing
            release data.
          </p>
        </div>
      </section>

      <section>
        <div className="mx-auto max-w-7xl px-4 py-16 text-center sm:px-6">
          <p className="mb-6 text-base text-muted">
            {releasesPage.bottomCta.text}
          </p>
          <Link
            href={releasesPage.bottomCta.buttonHref}
            className="public-button"
          >
            {releasesPage.bottomCta.buttonText}
          </Link>
        </div>
      </section>
    </div>
  );
}

function ReleaseCard({
  release,
  featured = false,
}: {
  release: (typeof releases)[number];
  featured?: boolean;
}) {
  const links = Object.entries(release.links).filter(([, href]) =>
    Boolean(href),
  );

  return (
    <article
      className={`public-card overflow-hidden !p-0 ${featured ? "lg:grid lg:grid-cols-[minmax(260px,0.46fr)_1fr]" : "sm:grid sm:grid-cols-[minmax(0,.45fr)_minmax(0,.55fr)]"}`}
    >
      {release.cover ? (
        <div className="relative aspect-square">
          <Image
            src={release.cover}
            alt={`${release.title} cover artwork`}
            fill
            className="object-cover"
            unoptimized
          />
        </div>
      ) : null}
      <div className="flex min-w-0 flex-col justify-center p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <span className="border border-accent/30 px-2 py-0.5 text-xs uppercase tracking-widest text-accent">
            {release.status}
          </span>
          <span className="text-xs uppercase tracking-wider text-muted">
            {release.type}
          </span>
          <span className="text-xs uppercase tracking-wider text-muted">
            {release.date}
          </span>
        </div>
        <h3
          className={`${featured ? "text-3xl sm:text-5xl" : "text-2xl"} mb-4 font-black uppercase tracking-tight text-foreground`}
        >
          {release.title}
        </h3>
        <details className="public-disclosure mb-6">
          <summary>
            <span>About this release</span>
            <PublicIcon name="chevron" />
          </summary>
          <div className="public-disclosure-content">
            <p className="text-sm leading-relaxed text-muted sm:text-base">
              {release.description}
            </p>
          </div>
        </details>
        <div
          className="mt-auto flex flex-wrap gap-2"
          aria-label={`Listen to ${release.title}`}
        >
          {links.length > 0 ? (
            links.map(([platform, href]) => (
              <a
                key={platform}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="public-button !px-3 !py-2 !text-xs"
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
