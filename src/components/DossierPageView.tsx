"use client";

import Image from "next/image";
import Link from "next/link";
import { PageHero, SectionDot } from "@/components/LiveEffects";
import type { DossierPageViewModel } from "@/lib/dossier-page-view-model";

type DossierPageViewProps = {
  entry: DossierPageViewModel;
  backHref?: string;
  backLabel?: string;
  preview?: boolean;
};

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

export function DossierPageView({
  entry,
  backHref = "/database",
  backLabel = "← Back to Database",
  preview = false,
}: DossierPageViewProps) {
  return (
    <div className={preview ? "" : "pt-14"}>
      <section>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 pt-6">
          <Link
            href={backHref}
            className="inline-flex items-center text-sm uppercase tracking-widest text-muted hover:text-accent transition-colors"
          >
            {backLabel}
          </Link>
        </div>
      </section>

      <section className="border-b border-border noise-bg">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-16 sm:py-24">
          <div className="mb-10">
            <PageHero label={`// DOSSIER: ${entry.id}`} heading={entry.name} description="" />
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

          <div className="w-full max-w-xs">
            <div className="border border-accent/20 bg-surface p-2 crt-frame">
              <div className="relative aspect-[4/5] overflow-hidden crt-scanlines crt-vignette crt-flicker">
                <Image src={entry.image} alt={entry.name} fill className="object-cover crt-tint" unoptimized />
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

      <section className="border-b border-border">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-16">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
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
                <InfoRow label="Origin" value={entry.origin} colorClass={originColors[entry.origin]} />
              </div>

              {entry.primaryLink && (
                <a
                  href={entry.primaryLink.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-6 inline-flex border border-accent px-4 py-2 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background transition-all"
                >
                  {entry.primaryLink.label}
                </a>
              )}
            </div>

            <div>
              <div className="flex items-center gap-3 mb-6">
                <SectionDot />
                <h2 className="text-xs sm:text-sm uppercase tracking-[0.5em] text-muted">
                  Summary
                </h2>
              </div>
              <p className="text-lg text-foreground/80 leading-relaxed mb-8">
                {entry.summary}
              </p>

              <div className="flex flex-wrap gap-2">
                {entry.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-xs uppercase tracking-widest px-3 py-1 border border-accent/20 text-accent/70"
                  >
                    {tag}
                  </span>
                ))}
              </div>

              {entry.notes && (
                <div className="mt-8 border-l border-accent/30 pl-4">
                  <p className="text-sm text-muted italic">{entry.notes}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

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
              {entry.files.map((file, index) => (
                <div key={`${file.name}-${index}`}>
                  {file.type === "audio" ? (
                    <div className="border border-accent/20 bg-surface p-4">
                      <p className="text-xs uppercase tracking-[0.3em] text-muted mb-3">♫ {file.name}</p>
                      <audio controls preload="metadata" className="w-full [&::-webkit-media-controls-panel]:bg-surface">
                        <source src={file.url} />
                      </audio>
                    </div>
                  ) : file.type === "video" ? (
                    <div className="border border-accent/20 bg-surface p-4">
                      <p className="text-xs uppercase tracking-[0.3em] text-muted mb-3">▶ {file.name}</p>
                      {file.url.includes("drive.google.com") || file.url.includes("youtube.com") || file.url.includes("youtu.be") ? (
                        <div className="relative aspect-video">
                          <iframe src={file.url} className="absolute inset-0 w-full h-full border-0" allow="autoplay; encrypted-media" allowFullScreen />
                        </div>
                      ) : (
                        <video controls preload="metadata" className="w-full">
                          <source src={file.url} />
                        </video>
                      )}
                    </div>
                  ) : file.type === "image" ? (
                    <div className="border border-accent/20 bg-surface p-4">
                      <p className="text-xs uppercase tracking-[0.3em] text-muted mb-3">◻ {file.name}</p>
                      <div className="relative max-w-lg">
                        <Image src={file.url} alt={file.name} width={800} height={600} className="w-full h-auto" unoptimized />
                      </div>
                    </div>
                  ) : (
                    <a href={file.url} target="_blank" rel="noopener noreferrer" download className="flex items-center justify-between border border-border hover:border-accent/40 bg-surface p-4 transition-colors group">
                      <span className="text-sm text-foreground/80 group-hover:text-accent transition-colors">{file.name}</span>
                      <span className="text-xs uppercase tracking-widest text-muted group-hover:text-accent transition-colors">Download →</span>
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="border-b border-border">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-16">
          <div className="bg-surface border border-border p-6 font-mono">
            <p className="text-xs text-muted mb-4">&gt; BARCODE_NETWORK // DOSSIER QUERY</p>
            <div className="space-y-1 text-sm text-foreground/60">
              <p>{entry.terminalLead}</p>
              <p>&gt; RECORD FOUND: {entry.name}</p>
              <p>&gt; STATUS: {entry.status}{" // "}CLEARANCE: {entry.clearance}</p>
              <p>&gt; CATEGORY: {entry.category}{" // "}ORIGIN: {entry.origin}</p>
              <p className="text-accent mt-3">&gt; DOSSIER LOADED<span className="cursor-blink">_</span></p>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12">
          <Link href={backHref} className="inline-flex items-center text-sm uppercase tracking-widest text-muted hover:text-accent transition-colors">
            {backLabel}
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
      <span className="text-xs uppercase tracking-[0.3em] text-muted">{label}</span>
      <span className={`text-sm ${colorClass || (accent ? "text-accent" : "text-foreground/80")}`}>
        {value}
      </span>
    </div>
  );
}
