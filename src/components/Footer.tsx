import Link from "next/link";
import Image from "next/image";
import { siteConfig, externalLinks } from "@/content";
import { PublicIcon, type PublicIconName } from "@/components/PublicIcon";
import type { RadioSubmissionRouting } from "@/lib/radio-submission-routing";

function FooterLink({
  href,
  children,
  icon,
  external = false,
}: {
  href: string;
  children: React.ReactNode;
  icon: PublicIconName;
  external?: boolean;
}) {
  const content = (
    <>
      <PublicIcon name={icon} />
      {children}
    </>
  );
  return (
    <li>
      {external ? (
        <a href={href} target="_blank" rel="noopener noreferrer">
          {content}
        </a>
      ) : (
        <Link href={href}>{content}</Link>
      )}
    </li>
  );
}

export function Footer({ submission }: { submission: RadioSubmissionRouting }) {
  const currentYear = new Date().getFullYear();
  return (
    <footer className="border-t border-border bg-background pb-10">
      <div className="public-container py-10">
        <div className="grid grid-cols-2 gap-7 md:grid-cols-[1.3fr_1fr_1fr_1fr]">
          <div className="col-span-2 md:col-span-1">
            <div className="mb-4 flex items-center gap-3">
              <Image
                src={siteConfig.logo}
                alt={siteConfig.name}
                width={40}
                height={40}
                className="w-10"
                unoptimized
              />
              <span className="text-sm font-bold tracking-[.15em]">
                BARCODE
                <br />
                <span className="text-xs font-normal text-muted tracking-[.28em]">
                  NETWORK
                </span>
              </span>
            </div>
            <p className="max-w-56 text-sm leading-relaxed text-muted">
              Host-led artist discovery, music, community, and media network.
            </p>
          </div>
          <div>
            <h2 className="public-kicker">Music</h2>
            <ul className="public-footer-links">
              <FooterLink href="/releases" icon="music">
                Releases
              </FooterLink>
              <FooterLink href="/radio" icon="radio">
                BARCODE Radio
              </FooterLink>
              <FooterLink
                href={submission.href}
                external={submission.external}
                icon="send"
              >
                {submission.resourceLabel}
              </FooterLink>
              <FooterLink href={externalLinks.tiktok} external icon="play">
                TikTok
              </FooterLink>
            </ul>
          </div>
          <div>
            <h2 className="public-kicker">Community</h2>
            <ul className="public-footer-links">
              <FooterLink
                href={externalLinks.discord}
                external
                icon="community"
              >
                Discord
              </FooterLink>
              <FooterLink href="/contests" icon="trophy">
                Community Contests
              </FooterLink>
              <FooterLink href="/merch" icon="merch">
                Merch
              </FooterLink>
            </ul>
          </div>
          <div>
            <h2 className="public-kicker">Explore</h2>
            <ul className="public-footer-links">
              <FooterLink href="/database" icon="archive">
                Database
              </FooterLink>
              <FooterLink href="/transmissions" icon="send">
                Transmissions
              </FooterLink>
              <FooterLink href="/bnl" icon="bnl">
                BNL-01 Hub
              </FooterLink>
              <FooterLink href="/terminal" icon="terminal">
                Terminal Archive
              </FooterLink>
            </ul>
          </div>
        </div>
        <p className="mt-8 max-w-3xl text-xs leading-relaxed text-muted">
          {submission.footerSummary}
        </p>
        <div className="mt-6 flex flex-col justify-between gap-3 border-t border-border pt-5 text-xs text-muted sm:flex-row">
          <p>
            <Link
              href="/secret-menu"
              prefetch={false}
              aria-label="Open hidden games"
              className="rounded-sm focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent focus-visible:outline-offset-4"
            >
              &copy;
            </Link>{" "}
            {currentYear} BARCODE Network. All rights reserved.
          </p>
          <nav aria-label="Footer legal links" className="flex gap-5">
            <Link
              href="/legal"
              className="min-h-11 inline-flex items-center hover:text-accent"
            >
              Legal / Privacy
            </Link>
            <Link
              href="/contact"
              className="min-h-11 inline-flex items-center hover:text-accent"
            >
              Contact
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
