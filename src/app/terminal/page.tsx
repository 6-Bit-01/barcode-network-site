import { terminalPage, externalLinks } from "@/content";
import Link from "next/link";
import { TerminalLogin } from "@/components/TerminalLogin";
import { SectionDot } from "@/components/LiveEffects";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "6 Bit Terminal — BARCODE Network",
  description:
    "Primary broadcast operator. Live transmissions, community routing, and cultural signal control.",
  openGraph: {
    title: "6 Bit Terminal — BARCODE Network",
    description:
      "Primary broadcast operator. Live transmissions, community routing, and cultural signal control.",
  },
};

function resolveHref(href: string): string {
  if (href.startsWith("EXTERNAL:")) {
    const key = href.replace("EXTERNAL:", "") as keyof typeof externalLinks;
    return externalLinks[key];
  }
  return href;
}

export default function TerminalPage() {
  return (
    <div className="pt-14">
      {/* Login Terminal */}
      <section className="border-b border-border noise-bg">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 py-12 sm:py-20">
          <TerminalLogin />
        </div>
      </section>

      {/* Dossier + About */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-16">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
            {/* Left: Info */}
            <div>
              <div className="flex items-center gap-3 mb-6">
                <SectionDot />
                <h2 className="text-xs sm:text-sm uppercase tracking-[0.5em] text-muted">
                  Dossier
                </h2>
              </div>

              <div className="space-y-4">
                {terminalPage.dossier.map((row) => (
                  <InfoRow
                    key={row.label}
                    label={row.label}
                    value={row.value}
                    accent={row.accent}
                  />
                ))}
              </div>
            </div>

            {/* Right: Description */}
            <div>
              <div className="flex items-center gap-3 mb-6">
                <SectionDot />
                <h2 className="text-xs sm:text-sm uppercase tracking-[0.5em] text-muted">
                  About
                </h2>
              </div>

              <div className="text-base text-foreground/70 leading-relaxed space-y-4">
                {terminalPage.about.map((paragraph, i) => (
                  <p key={i}>{paragraph}</p>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Access Points */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-16">
          <div className="flex items-center gap-3 mb-8">
            <SectionDot />
            <h2 className="text-xs sm:text-sm uppercase tracking-[0.5em] text-muted">
              Access Points
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {terminalPage.accessPoints.map((point) => (
              <ExternalLink
                key={point.label}
                href={resolveHref(point.href)}
                label={point.label}
                description={point.description}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Terminal Output */}
      <section>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-16">
          <div className="bg-surface border border-border p-6 font-mono">
            <p className="text-xs text-muted mb-4">
              &gt; BARCODE_NETWORK // TERMINAL ACCESS
            </p>
            <div className="space-y-1 text-sm text-foreground/60">
              {terminalPage.terminalOutput.map((line, i) => (
                <p key={i}>&gt; {line}</p>
              ))}
              <p className="text-accent mt-4">
                &gt; SESSION ACTIVE<span className="cursor-blink">_</span>
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function InfoRow({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center justify-between border-b border-border/50 pb-2">
      <span className="text-xs uppercase tracking-[0.3em] text-muted">
        {label}
      </span>
      <span
        className={`text-sm ${accent ? "text-accent" : "text-foreground/80"}`}
      >
        {value}
      </span>
    </div>
  );
}

function ExternalLink({
  href,
  label,
  description,
}: {
  href: string;
  label: string;
  description: string;
}) {
  const isExternal = href.startsWith("http");
  const className = "group border border-border hover:border-accent/30 bg-surface p-5 transition-all hover:bg-surface-light block";
  const inner = (
    <>
      <h3 className="text-base font-bold text-foreground group-hover:text-accent transition-colors mb-1">
        {label}
      </h3>
      <p className="text-xs text-muted uppercase tracking-wider">
        {description}
      </p>
    </>
  );

  if (isExternal) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
        {inner}
      </a>
    );
  }

  return (
    <Link href={href} className={className}>
      {inner}
    </Link>
  );
}