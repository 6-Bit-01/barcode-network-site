import Link from "next/link";
import Image from "next/image";
import { siteConfig, externalLinks } from "@/content";

export function Footer() {
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
              A decentralized broadcast system.
              <br />
              Signal over noise.
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
                  6 Bit
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
                <a href={externalLinks.auxchord} target="_blank" rel="noopener noreferrer" className="text-sm text-foreground/70 hover:text-accent transition-colors">
                  Auxchord
                </a>
              </li>
              <li>
                <Link href="/merch" className="text-sm text-foreground/70 hover:text-accent transition-colors">
                  Merch
                </Link>
              </li>
            </ul>
          </div>

          {/* Status */}
          <div>
            <h4 className="text-xs uppercase tracking-[0.3em] text-muted mb-4">
              System Status
            </h4>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-accent animate-status-blink" />
                <span className="text-sm text-muted">Network Online</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-accent animate-status-blink" style={{ animationDelay: '2s' }} />
                <span className="text-sm text-muted">Systems Operational</span>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-8 sm:mt-12 pt-4 sm:pt-6 border-t border-border flex flex-col sm:flex-row justify-between items-center gap-2 sm:gap-4">
          <p className="text-xs text-muted tracking-widest uppercase">
            &copy; {currentYear} BARCODE Network. All rights reserved.
          </p>
          <p className="text-xs text-muted/50 tracking-wider font-mono animate-flicker">
            SYS.BUILD // v2.0.0 // PHASE_02
          </p>
        </div>
      </div>
    </footer>
  );
}