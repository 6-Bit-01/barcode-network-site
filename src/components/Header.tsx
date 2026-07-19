"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useLiveStatus } from "./LiveStatusProvider";
import { GlitchText } from "./GlitchText";
import { siteConfig } from "@/content";

const navItems = [
  { href: "/", label: "HQ" },
  { href: "/terminal", label: "Terminal" },
  { href: "/radio", label: "Radio" },
  { href: "/database", label: "Database" },
  { href: "/bnl", label: "BNL-01 Hub" },
  { href: "/releases", label: "Releases" },
  { href: "/transmissions", label: "Transmissions" },
  { href: "/merch", label: "Merch" },
];

const mobileNavItems = navItems.map((item) =>
  item.href === "/terminal" ? { ...item, label: "Terminal Archive" } : item,
);

function isNavItemActive(pathname: string, href: string) {
  if (href === "/bnl") {
    return (
      pathname === "/bnl" ||
      pathname === "/journal" ||
      pathname.startsWith("/journal/")
    );
  }
  return pathname === href;
}

export function Header() {
  const pathname = usePathname();
  const { siteShowMode, queueHref, streamUrl } = useLiveStatus();

  const liveHref = queueHref ?? (siteShowMode === "broadcast_live" ? streamUrl || "/radio" : null);
  const liveLabel = siteShowMode === "broadcast_live" ? "BARCODE RADIO LIVE" : siteShowMode === "intake_open" ? "SUBMISSIONS OPEN" : null;
  const isExternalLiveHref = Boolean(liveHref && liveHref.startsWith("http"));

  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-border bg-background/95 backdrop-blur-sm">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="flex h-14 items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <Image
              src={siteConfig.logo}
              alt={siteConfig.name}
              width={512}
              height={512}
              className="rounded-sm glitch-hover w-[32px] sm:w-[36px]"
              unoptimized
            />
            <div className="flex flex-col">
              <GlitchText
                text="BARCODE"
                className="text-base font-bold tracking-[0.3em] text-accent uppercase animate-glow-breathe"
                intensity="low"
              />
              <span className="text-xs tracking-[0.5em] text-muted uppercase">
                NETWORK
              </span>
            </div>
          </Link>

          <nav className="hidden xl:flex items-center gap-1" aria-label="Primary navigation">
            {navItems.map((item) => {
              const isActive = isNavItemActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={`min-h-11 px-3 py-2 text-sm uppercase tracking-widest transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                    isActive
                      ? "text-accent border-b border-accent"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-4">
            {liveHref && liveLabel && (
              <a
                href={liveHref}
                target={isExternalLiveHref ? "_blank" : undefined}
                rel={isExternalLiveHref ? "noopener noreferrer" : undefined}
                className="flex items-center gap-2 px-2 py-1 border border-danger rounded text-xs sm:px-3 sm:text-sm uppercase tracking-wider text-danger live-indicator hover:bg-danger/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger transition-colors" aria-label={`Primary BARCODE Radio live and submissions status: ${liveLabel}`}
              >
                <span className="w-2 h-2 rounded-full bg-danger" />
                <span className="sm:hidden">{siteShowMode === "broadcast_live" ? "LIVE" : "SUBMIT"}</span>
                <span className="hidden sm:inline">{liveLabel}</span>
              </a>
            )}

            <MobileMenu pathname={pathname} />
          </div>
        </div>
      </div>
    </header>
  );
}

function MobileMenu({ pathname }: { pathname: string }) {
  const [open, setOpen] = useState(false);
  const menuId = "primary-mobile-navigation";

  return (
    <div className="xl:hidden">
      <button
        onClick={() => setOpen(!open)}
        className="p-2 text-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent transition-colors"
        aria-label={open ? "Close primary navigation" : "Open primary navigation"}
        aria-expanded={open}
        aria-controls={menuId}
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          {open ? (
            <path d="M4 4L16 16M16 4L4 16" stroke="currentColor" strokeWidth="1.5" />
          ) : (
            <>
              <path d="M2 5H18" stroke="currentColor" strokeWidth="1.5" />
              <path d="M2 10H18" stroke="currentColor" strokeWidth="1.5" />
              <path d="M2 15H18" stroke="currentColor" strokeWidth="1.5" />
            </>
          )}
        </svg>
      </button>

      {open && (
        <div id={menuId} className="absolute top-14 left-0 right-0 bg-background border-b border-border p-4">
          <nav className="flex flex-col gap-2" aria-label="Mobile primary navigation">
            {mobileNavItems.map((item) => {
              const isActive = isNavItemActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  aria-current={isActive ? "page" : undefined}
                  className={`min-h-11 px-3 py-3 text-sm uppercase tracking-widest transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                    isActive
                      ? "text-accent border-l-2 border-accent pl-4"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      )}
    </div>
  );
}
