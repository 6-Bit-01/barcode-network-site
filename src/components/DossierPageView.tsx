import { PublicIcon } from "@/components/PublicIcon";
import Image from "next/image";
import Link from "next/link";

export type DossierPageViewLink = {
  label: string;
  url: string;
  type: string;
};

export type DossierPageViewFile = {
  name: string;
  url: string;
  type: "download" | "audio" | "video" | "image";
};

export type DossierPageViewModel = {
  id: string;
  name: string;
  image: string;
  category: string;
  status: string;
  clearance: string;
  role: string;
  origin: string;
  summary: string;
  notes: string;
  tags: string[];
  primaryLink?: DossierPageViewLink | null;
  links?: DossierPageViewLink[];
  files: DossierPageViewFile[];
  backHref?: string;
  backLabel?: string;
  previewMode?: boolean;
  unpublishedLabel?: string;
  showTerminalReadout?: boolean;
  terminalLead?: string;
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

function buildTerminalLead(dossier: DossierPageViewModel) {
  const commands = [
    "TRACE DOSSIER ROUTE",
    "PULL ENTITY RECORD",
    "DECODE NETWORK SIGNATURE",
    "OPEN ARCHIVE NODE",
  ];

  const commandIndex =
    dossier.id.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0) %
    commands.length;

  return `> ${commands[commandIndex]} // TARGET: ${dossier.id} // ${dossier.category.toUpperCase()}`;
}

export function DossierPageView({ dossier }: { dossier: DossierPageViewModel }) {
  const backHref = dossier.backHref ?? "/database";
  const backLabel = dossier.backLabel ?? "Back to Database";
  const showTerminalReadout = dossier.showTerminalReadout ?? true;
  const terminalLead = dossier.terminalLead ?? buildTerminalLead(dossier);

  return (
    <div className={dossier.previewMode ? "public-site" : "public-page"}>
      {/* Back link (top) */}
      <section>
        <div className="public-container pt-6">
          <Link
            href={backHref}
            className="public-button"
          >
            <PublicIcon name="arrow" className="rotate-180" /> {backLabel}
          </Link>
        </div>
      </section>

      {/* Hero — Header then Image below */}
      <section className="public-section">
        <div className="public-container grid gap-8 md:grid-cols-[1fr_16rem] items-start">
          {/* Header info */}
          <div className="min-w-0">
            <p className="public-kicker"><PublicIcon name="archive" /> { `// DOSSIER: ${dossier.id}` }</p>
            <h1 className="public-title">{dossier.name}</h1>
            {/* Quick meta badges */}
            <div className="flex flex-wrap gap-3 mt-6">
              {dossier.previewMode && (
                <span className="text-xs uppercase tracking-widest px-2 py-1 border border-accent/40 text-accent">
                  {dossier.unpublishedLabel ?? "UNPUBLISHED PREVIEW"}
                </span>
              )}
              <span
                className={`text-xs uppercase tracking-widest px-2 py-1 border border-current/20 ${statusColors[dossier.status] || "text-muted"}`}
              >
                {dossier.status}
              </span>
              <span
                className={`text-xs uppercase tracking-widest px-2 py-1 border border-current/20 ${clearanceColors[dossier.clearance] || "text-muted"}`}
              >
                {dossier.clearance}
              </span>
              <span className="text-xs uppercase tracking-widest px-2 py-1 border border-border text-muted">
                {dossier.category}
              </span>
            </div>
            <p className="public-intro mt-4">{dossier.role}</p>
          </div>

          {/* Portrait / Placeholder */}
          <div className="w-full max-w-xs">
            <div className="public-card p-2">
              <div className="relative aspect-[4/5] overflow-hidden rounded-xl">
                <Image
                  src={dossier.image}
                  alt={dossier.name}
                  fill
                  className="object-cover"
                  unoptimized
                />
              </div>
              <div className="mt-2 flex items-center justify-between px-1">
                <span className="text-xs font-mono text-muted/50">
                  {dossier.id}
                </span>
                <span
                  className={`text-xs font-mono ${clearanceColors[dossier.clearance] || "text-muted/50"}`}
                >
                  {dossier.clearance}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Dossier Card */}
      <section className="public-section">
        <div className="public-container">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
            {/* Left: Info Grid */}
            <div>
              <div className="flex items-center gap-3 mb-6">
                <PublicIcon name="archive" />
                <h2 className="public-section-heading">
                  Dossier Record
                </h2>
              </div>

              <div className="space-y-4">
                <InfoRow label="Designation" value={dossier.id} />
                <InfoRow label="Name" value={dossier.name} accent />
                <InfoRow label="Category" value={dossier.category} />
                <InfoRow
                  label="Status"
                  value={dossier.status}
                  colorClass={statusColors[dossier.status]}
                />
                <InfoRow
                  label="Clearance"
                  value={dossier.clearance}
                  colorClass={clearanceColors[dossier.clearance]}
                />
                <InfoRow label="Role" value={dossier.role} />
                <InfoRow
                  label="Origin"
                  value={dossier.origin}
                  colorClass={originColors[dossier.origin]}
                />
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/50 pb-3">
                  <span className="text-sm text-muted">
                    Tags
                  </span>
                  <div className="flex flex-wrap gap-1 justify-end">
                    {dossier.tags.map((tag) => (
                      <span
                        key={tag}
                        className="text-xs text-muted/60 border border-border px-1.5 py-0.5"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
                {dossier.primaryLink && (
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/50 pb-3">
                    <span className="text-sm text-muted">
                      Link
                    </span>
                    <a
                      href={dossier.primaryLink.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-accent hover:text-accent-dim transition-colors break-words text-right"
                    >
                      {dossier.primaryLink.label}
                      <span className="text-muted/50">
                        {" "}
                        · {dossier.primaryLink.type}
                      </span>{" "}
                      →
                    </a>
                  </div>
                )}
              </div>
            </div>

            {/* Right: Summary + Notes */}
            <div>
              <div className="flex items-center gap-3 mb-6">
                <PublicIcon name="archive" />
                <h2 className="public-section-heading">
                  Intelligence Brief
                </h2>
              </div>

              <div className="text-base text-foreground/70 leading-relaxed space-y-6">
                <div>
                  <p className="text-sm text-muted mb-2">
                    Summary
                  </p>
                  <p>{dossier.summary}</p>
                </div>

                {dossier.notes && (
                  <div>
                    <p className="text-sm text-muted mb-2">
                      Notes
                    </p>
                    <p className="text-base text-foreground/75 leading-relaxed">
                      {dossier.notes}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Attached Files */}
      {dossier.files.length > 0 && (
        <section className="public-section">
          <div className="public-container">
            <div className="flex items-center gap-3 mb-8">
              <PublicIcon name="archive" />
              <h2 className="public-section-heading">
                Attached Files
              </h2>
            </div>

            <div className="space-y-6">
              {dossier.files.map((file, i) => (
                <div key={i}>
                  {file.type === "audio" ? (
                    <div className="public-card">
                      <p className="flex items-center gap-2 text-sm text-muted mb-3">
                        <PublicIcon name="music" /> {file.name}
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
                    <div className="public-card">
                      <p className="flex items-center gap-2 text-sm text-muted mb-3">
                        <PublicIcon name="play" /> {file.name}
                      </p>
                      {file.url.includes("drive.google.com") ||
                      file.url.includes("youtube.com") ||
                      file.url.includes("youtu.be") ? (
                        <div className="relative aspect-video">
                          <iframe
                            src={file.url}
                            className="absolute inset-0 w-full h-full border-0"
                            title={file.name}
                            allow="autoplay; encrypted-media"
                            allowFullScreen
                          />
                        </div>
                      ) : (
                        <video controls preload="metadata" className="w-full">
                          <source src={file.url} />
                        </video>
                      )}
                    </div>
                  ) : file.type === "image" ? (
                    <div className="public-card">
                      <p className="flex items-center gap-2 text-sm text-muted mb-3">
                        <PublicIcon name="archive" /> {file.name}
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
                      className="public-card flex items-center justify-between gap-4 hover:border-accent/40 transition-colors group"
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
      {showTerminalReadout && (
        <section className="public-section">
          <div className="public-container">
            <details className="public-disclosure">
              <summary><PublicIcon name="terminal" /> Terminal Readout</summary>
            <div className="public-disclosure-content font-mono">
              <p className="text-xs text-muted mb-4">
                &gt; BARCODE_NETWORK // DOSSIER QUERY
              </p>
              <div className="space-y-1 text-sm text-foreground/60">
                <p>{terminalLead}</p>
                <p>&gt; RECORD FOUND: {dossier.name}</p>
                <p>
                  &gt; STATUS: {dossier.status}
                  {" // "}CLEARANCE: {dossier.clearance}
                </p>
                <p>
                  &gt; CATEGORY: {dossier.category}
                  {" // "}ORIGIN: {dossier.origin}
                </p>
                <p className="text-accent mt-3">
                  &gt; DOSSIER LOADED<span className="cursor-blink">_</span>
                </p>
              </div>
            </div>
            </details>
          </div>
        </section>
      )}

      {/* Back link */}
      <section>
        <div className="public-container pb-10">
          <Link
            href={backHref}
            className="public-button"
          >
            <PublicIcon name="arrow" className="rotate-180" /> {backLabel}
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
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/50 pb-3">
      <span className="text-sm text-muted">
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
