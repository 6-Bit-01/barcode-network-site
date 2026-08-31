import Link from "next/link";
import Image from "next/image";
import { siteConfig, externalLinks } from "@/content";
import type { RadioSubmissionRouting } from "@/lib/radio-submission-routing";

export function Footer({ submission }: { submission: RadioSubmissionRouting }) {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-border bg-background pb-10">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-8 sm:py-12">
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8">
          {/* Brand */}
          <div className="col-span-2 sm:col-span-2 md:col-span-1">
            <div className="flex items-center gap-3 mb-3">
              <Image
                src={siteConfig.logo}
                alt={siteConfig.name}
                width={512}
                height={512}
                className="rounded-sm w-[36px]"
                unoptimized
              />
              <div className="flex flex-col">
                <span className="text-base font-bold tracking-[0.3em] text-accent uppercase">
                  BARCODE
                </span>
                <span className="text-xs tracking-[0.5em] text-muted uppercase">
                  NETWORK
                </span>
              </div>
            </div>
            <p className="text-sm text-muted leading-relaxed">
              Host-led artist discovery, music, community, and media network.
            </p>
          </div>

          {/* Programs */}
          <div>
            <h4 className="text-xs uppercase tracking-[0.3em] text-muted mb-4">
              Programs
            </h4>
            <ul className="space-y-2">
              <li>
                <Link href="/terminal" className="text-sm text-foreground/70 hover:text-accent transition-colors">
                  Terminal Archive
                </Link>
              </li>
              <li>
                <Link href="/radio" className="text-sm text-foreground/70 hover:text-accent transition-colors">
                  BARCODE Radio
                </Link>
              </li>
              <li>
                <Link href="/database" className="text-sm text-foreground/70 hover:text-accent transition-colors">
                  Database
                </Link>
              </li>
              <li>
                <Link href="/bnl" className="text-sm text-foreground/70 hover:text-accent transition-colors">
                  BNL-01 Hub
                </Link>
              </li>
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h4 className="text-xs uppercase tracking-[0.3em] text-muted mb-4">
              Resources
            </h4>
            <ul className="space-y-2">
              <li>
                <Link href="/releases" className="text-sm text-foreground/70 hover:text-accent transition-colors">
                  Releases
                </Link>
              </li>
              <li>
                <a href={externalLinks.discord} target="_blank" rel="noopener noreferrer" className="text-sm text-foreground/70 hover:text-accent transition-colors">
                  Discord
                </a>
              </li>
              <li>
                {submission.external ? (
                  <a href={submission.href} target="_blank" rel="noopener noreferrer" className="text-sm text-foreground/70 hover:text-accent transition-colors">
                    {submission.resourceLabel}
                  </a>
                ) : (
                  <Link href={submission.href} className="text-sm text-foreground/70 hover:text-accent transition-colors">
                    {submission.resourceLabel}
                  </Link>
                )}
              </li>
              <li>
                <a href={externalLinks.tiktok} target="_blank" rel="noopener noreferrer" className="text-sm text-foreground/70 hover:text-accent transition-colors">
                  TikTok
                </a>
              </li>
              <li>
                <Link href="/merch" className="text-sm text-foreground/70 hover:text-accent transition-colors">
                  Merch
                </Link>
              </li>
            </ul>
          </div>

          {/* Identity */}
          <div>
            <h4 className="text-xs uppercase tracking-[0.3em] text-muted mb-4">
              Network
            </h4>
            <p className="text-sm text-muted leading-relaxed">
              {submission.footerSummary}
            </p>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-8 sm:mt-12 pt-4 sm:pt-6 border-t border-border flex flex-col sm:flex-row justify-between items-center gap-2 sm:gap-4">
          <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4">
            <p className="text-xs text-muted tracking-widest uppercase">
              &copy; {currentYear} BARCODE Network. All rights reserved.
            </p>
            <nav aria-label="Footer legal links" className="flex items-center gap-3">
              <Link href="/legal" className="text-xs text-muted hover:text-accent tracking-widest uppercase transition-colors">
                Legal / Privacy
              </Link>
              <Link href="/contact" className="text-xs text-muted hover:text-accent tracking-widest uppercase transition-colors">
                Contact
              </Link>
            </nav>
          </div>
          <p className="text-xs text-muted/50 tracking-wider font-mono">
            BARCODE Network
          </p>
        </div>
      </div>
    </footer>
  );
}
