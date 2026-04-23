import { databasePage } from "@/content";
import { PageHero, SectionDot } from "@/components/LiveEffects";
import { getEntryImage } from "@/lib/placeholder";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

function slugify(name: string) {
  return name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

// Generate static paths for all entries
export function generateStaticParams() {
  return databasePage.entries.map((entry) => ({
    slug: slugify(entry.name),
  }));
}

// Dynamic metadata per entity
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const entry = databasePage.entries.find((e) => slugify(e.name) === slug);
  if (!entry) return { title: "Not Found — BARCODE Network" };

  return {
    title: `${entry.name} — BARCODE Network Database`,
    description: entry.summary,
    openGraph: {
      title: `${entry.name} — BARCODE Network Database`,
      description: entry.summary,
    },
  };
}

const statusColors: Record<string, string> = {
  ACTIVE: "text-accent",
  PENDING: "text-yellow-500",
  INACTIVE: "text-muted",
  ARCHIVED: "text-blue-400",
  UNKNOWN: "text-red-400",
};

const clearanceColors: Record<string, string> = {
  PUBLIC: "text-accent/70",
  INTERNAL: "text-yellow-500/70",
  RESTRICTED: "text-red-400/70",
};

const originColors: Record<string, string> = {
  KNOWN: "text-accent/70",
  UNKNOWN: "text-red-400/70",
  UNVERIFIED: "text-yellow-500/70",
  WITHHELD: "text-muted",
};

export default async function EntityPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const entry = databasePage.entries.find((e) => slugify(e.name) === slug);

  if (!entry) notFound();

  return (
    <div className="pt-14">
      {/* Back link (top) */}
      <section>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 pt-6">
          <Link
            href="/database"
            className="inline-flex items-center text-sm uppercase tracking-widest text-muted hover:text-accent transition-colors"
          >
            ← Back to Database
          </Link>
        </div>
      </section>

      {/* Hero — Header then Image below */}
      <section className="border-b border-border noise-bg">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-16 sm:py-24">
          {/* Header info */}
          <div className="mb-10">
            <PageHero
              label={`// DOSSIER: ${entry.id}`}
              heading={entry.name}
              description=""
            />
            {/* Quick meta badges */}
            <div className="flex flex-wrap gap-3 mt-6">
              <span className={`text-xs uppercase tracking-widest px-2 py-1 border border-current/20 ${statusColors[entry.status] || "text-muted"}`}>
                {entry.status}
              </span>
              <span className={`text-xs uppercase tracking-widest px-2 py-1 border border-current/20 ${clearanceColors[entry.clearance] || "text-muted"}`}>
                {entry.clearance}
              </span>
              <span className="text-xs uppercase tracking-widest px-2 py-1 border border-border text-muted">
                {entry.category}
              </span>
            </div>
            <p className="text-sm text-muted/60 mt-4">{entry.role}</p>
          </div>

          {/* Portrait / Placeholder */}
          <div className="w-full max-w-xs">
            <div className="border border-accent/20 bg-surface p-2 crt-frame">
              <div className="relative aspect-[4/5] overflow-hidden crt-scanlines crt-vignette crt-flicker">
                <Image
                  src={getEntryImage(entry)}
                  alt={entry.name}
                  fill
                  className="object-cover crt-tint"
                  unoptimized
                />
              </div>
              <div className="mt-2 flex items-center justify-between px-1">
                <span className="text-xs font-mono text-muted/50">{entry.id}</span>
                <span className={`text-xs font-mono ${clearanceColors[entry.clearance] || "text-muted/50"}`}>
                  {entry.clearance}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Dossier Card */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-16">

          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
            {/* Left: Info Grid */}
            <div>
              <div className="flex items-center gap-3 mb-6">
                <SectionDot />
                <h2 className="text-xs sm:text-sm uppercase tracking-[0.5em] text-muted">
                  Dossier Record
                </h2>
              </div>

              <div className="space-y-4">
                <InfoRow label="Designation" value={entry.id} />
                <InfoRow label="Name" value={entry.name} accent />
                <InfoRow label="Category" value={entry.category} />
                <InfoRow label="Status" value={entry.status} colorClass={statusColors[entry.status]} />
                <InfoRow label="Clearance" value={entry.clearance} colorClass={clearanceColors[entry.clearance]} />
                <InfoRow label="Role" value={entry.role} />
                <InfoRow label="Origin" value={entry.origin} colorClass={originColors[entry.origin]} />
                <div className="flex items-center justify-between border-b border-border/50 pb-2">
                  <span className="text-xs uppercase tracking-[0.3em] text-muted">
                    Tags
                  </span>
                  <div className="flex flex-wrap gap-1 justify-end">
                    {entry.tags.map((tag) => (
                      <span
                        key={tag}
                        className="text-xs text-muted/60 border border-border px-1.5 py-0.5"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
                {entry.link && (
                  <div className="flex items-center justify-between border-b border-border/50 pb-2">
                    <span className="text-xs uppercase tracking-[0.3em] text-muted">
                      Link
                    </span>
                    <a
                      href={entry.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-accent hover:text-accent-dim transition-colors truncate max-w-[60%] text-right"
                    >
                      {entry.link.replace(/^https?:\/\/(www\.)?/, "").split("/")[0]} →
                    </a>
                  </div>
                )}
              </div>
            </div>

            {/* Right: Summary + Notes */}
            <div>
              <div className="flex items-center gap-3 mb-6">
                <SectionDot />
                <h2 className="text-xs sm:text-sm uppercase tracking-[0.5em] text-muted">
                  Intelligence Brief
                </h2>
              </div>

              <div className="text-base text-foreground/70 leading-relaxed space-y-6">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-muted mb-2">Summary</p>
                  <p>{entry.summary}</p>
                </div>

                {entry.notes && (
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-muted mb-2">Notes</p>
                    <p className="text-sm text-foreground/50 border-l-2 border-accent/20 pl-4">
                      {entry.notes}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Attached Files */}
      {entry.files.length > 0 && (
        <section className="border-b border-border">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 py-16">
            <div className="flex items-center gap-3 mb-8">
              <SectionDot />
              <h2 className="text-xs sm:text-sm uppercase tracking-[0.5em] text-muted">
                Attached Files
              </h2>
            </div>

            <div className="space-y-6">
              {entry.files.map((file, i) => (
                <div key={i}>
                  {file.type === "audio" ? (
                    <div className="border border-accent/20 bg-surface p-4">
                      <p className="text-xs uppercase tracking-[0.3em] text-muted mb-3">
                        ♫ {file.name}
                      </p>
                      <audio
                        controls
                        preload="metadata"
                        className="w-full [&::-webkit-media-controls-panel]:bg-surface"
                      >
                        <source src={file.url} />
                      </audio>
                    </div>
                  ) : file.type === "video" ? (
                    <div className="border border-accent/20 bg-surface p-4">
                      <p className="text-xs uppercase tracking-[0.3em] text-muted mb-3">
                        ▶ {file.name}
                      </p>
                      {file.url.includes("drive.google.com") || file.url.includes("youtube.com") || file.url.includes("youtu.be") ? (
                        <div className="relative aspect-video">
                          <iframe
                            src={file.url}
                            className="absolute inset-0 w-full h-full border-0"
                            allow="autoplay; encrypted-media"
                            allowFullScreen
                          />
                        </div>
                      ) : (
                        <video
                          controls
                          preload="metadata"
                          className="w-full"
                        >
                          <source src={file.url} />
                        </video>
                      )}
                    </div>
                  ) : file.type === "image" ? (
                    <div className="border border-accent/20 bg-surface p-4">
                      <p className="text-xs uppercase tracking-[0.3em] text-muted mb-3">
                        ◻ {file.name}
                      </p>
                      <div className="relative max-w-lg">
                        <Image
                          src={file.url}
                          alt={file.name}
                          width={800}
                          height={600}
                          className="w-full h-auto"
                          unoptimized
                        />
                      </div>
                    </div>
                  ) : (
                    <a
                      href={file.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      download
                      className="flex items-center justify-between border border-border hover:border-accent/40 bg-surface p-4 transition-colors group"
                    >
                      <span className="text-sm text-foreground/80 group-hover:text-accent transition-colors">
                        {file.name}
                      </span>
                      <span className="text-xs uppercase tracking-widest text-muted group-hover:text-accent transition-colors">
                        Download →
                      </span>
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Terminal Readout */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-16">
          <div className="bg-surface border border-border p-6 font-mono">
            <p className="text-xs text-muted mb-4">
              &gt; BARCODE_NETWORK // DOSSIER QUERY
            </p>
            <div className="space-y-1 text-sm text-foreground/60">
              <p>&gt; SELECT * FROM network_dossiers WHERE id = &apos;{entry.id}&apos;</p>
              <p>&gt; RECORD FOUND: {entry.name}</p>
              <p>&gt; STATUS: {entry.status} // CLEARANCE: {entry.clearance}</p>
              <p>&gt; CATEGORY: {entry.category} // ORIGIN: {entry.origin}</p>
              <p className="text-accent mt-3">
                &gt; DOSSIER LOADED<span className="cursor-blink">_</span>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Back link */}
      <section>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12">
          <Link
            href="/database"
            className="inline-flex items-center text-sm uppercase tracking-widest text-muted hover:text-accent transition-colors"
          >
            ← Back to Database
          </Link>
        </div>
      </section>
    </div>
  );
}

function InfoRow({
  label,
  value,
  accent = false,
  colorClass,
}: {
  label: string;
  value: string;
  accent?: boolean;
  colorClass?: string;
}) {
  return (
    <div className="flex items-center justify-between border-b border-border/50 pb-2">
      <span className="text-xs uppercase tracking-[0.3em] text-muted">
        {label}
      </span>
      <span
        className={`text-sm ${colorClass || (accent ? "text-accent" : "text-foreground/80")}`}
      >
        {value}
      </span>
    </div>
  );
}