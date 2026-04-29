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
  { href: "/releases", label: "Releases" },
  { href: "/transmissions", label: "Transmissions" },
  { href: "/merch", label: "Merch" },
];

export function Header() {
  const pathname = usePathname();
  const { isLive, streamUrl } = useLiveStatus();

  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-border bg-background/95 backdrop-blur-sm">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="flex h-14 items-center justify-between">
          {/* Logo / Brand */}
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

          {/* Navigation */}
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-3 py-1.5 text-sm uppercase tracking-widest transition-colors ${
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

          {/* Live Status + Mobile Menu */}
          <div className="flex items-center gap-4">
            {/* LIVE NOW indicator */}
            {isLive && (
              <a
                href={streamUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-1 border border-danger rounded text-sm uppercase tracking-wider text-danger live-indicator hover:bg-danger/10 transition-colors"
              >
                <span className="w-2 h-2 rounded-full bg-danger" />
                LIVE NOW
              </a>
            )}

            {/* Mobile hamburger */}
            <MobileMenu pathname={pathname} />
          </div>
        </div>
      </div>
    </header>
  );
}

function MobileMenu({ pathname }: { pathname: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="md:hidden">
      <button
        onClick={() => setOpen(!open)}
        className="p-2 text-muted hover:text-foreground transition-colors"
        aria-label="Toggle menu"
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
        <div className="absolute top-14 left-0 right-0 bg-background border-b border-border p-4">
          <nav className="flex flex-col gap-2">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={`px-3 py-2 text-sm uppercase tracking-widest transition-colors ${
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