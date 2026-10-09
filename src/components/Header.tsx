"use client";
import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useLiveStatus } from "./LiveStatusProvider";
import { GlitchText } from "./GlitchText";
import { PublicIcon, type PublicIconName } from "./PublicIcon";
import { siteConfig, externalLinks } from "@/content";

const navItems = [
  { href: "/", label: "HQ", icon: "globe" },
  { href: "/radio", label: "Radio", icon: "radio" },
  { href: externalLinks.discord, label: "Community", icon: "community" },
  { href: "/bnl", label: "BNL-01 Hub", icon: "bnl" },
  { href: "/contests", label: "Contests", icon: "trophy" },
] satisfies { href: string; label: string; icon: PublicIconName }[];
const exploreItems = [
  { href: "/releases", label: "Music", icon: "music" },
  { href: "/database", label: "Database", icon: "archive" },
  { href: "/transmissions", label: "Transmissions", icon: "send" },
  { href: "/merch", label: "Merch", icon: "merch" },
  { href: "/terminal", label: "Terminal Archive", icon: "terminal" },
] satisfies { href: string; label: string; icon: PublicIconName }[];

function isNavItemActive(pathname: string, href: string) {
  if (href === "/radio")
    return pathname === "/radio" || pathname.startsWith("/radio/");
  if (href === "/bnl")
    return (
      pathname === "/bnl" ||
      pathname.startsWith("/bnl/") ||
      pathname === "/journal" ||
      pathname.startsWith("/journal/")
    );
  if (href === "/database" || href === "/transmissions")
    return pathname === href || pathname.startsWith(`${href}/`);
  return pathname === href;
}

export function Header({ accountEnabled = false }: { accountEnabled?: boolean }) {
  const pathname = usePathname();
  const { siteShowMode, queueHref, streamUrl } = useLiveStatus();
  const liveHref =
    queueHref ??
    (siteShowMode === "broadcast_live" ? streamUrl || "/radio" : null);
  const liveLabel =
    siteShowMode === "broadcast_live"
      ? "BARCODE RADIO LIVE"
      : siteShowMode === "intake_open"
        ? "SUBMISSIONS OPEN"
        : null;
  const isExternalLiveHref = Boolean(liveHref && liveHref.startsWith("http"));
  const renderLink = (
    item: (typeof exploreItems)[number] | (typeof navItems)[number],
  ) => {
    const isActive = isNavItemActive(pathname, item.href);
    if (item.href.startsWith("https://")) {
      return (
        <a
          key={item.href}
          href={item.href}
          target="_blank"
          rel="noopener noreferrer"
          className="public-nav-link"
        >
          <PublicIcon name={item.icon} />
          {item.label}
        </a>
      );
    }
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={isActive ? "page" : undefined}
        className="public-nav-link"
        onClick={(event) =>
          event.currentTarget.closest("details")?.removeAttribute("open")
        }
      >
        <PublicIcon name={item.icon} />
        {item.label}
      </Link>
    );
  };
  return (
    <header className="public-header fixed top-0 left-0 right-0 z-50 border-b border-border bg-background/95 backdrop-blur-sm">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="flex h-14 items-center justify-between gap-2">
          <Link
            href="/"
            className="flex shrink-0 items-center gap-2.5 group"
            aria-label="BARCODE Network home"
          >
            <Image
              src={siteConfig.logo}
              alt=""
              width={36}
              height={36}
              className="w-8 rounded-sm"
              unoptimized
            />
            <div className="flex flex-col">
              <GlitchText
                text="BARCODE"
                className="text-sm font-bold tracking-[0.23em] text-accent uppercase"
                intensity="low"
              />
              <span className="text-[9px] tracking-[0.4em] text-muted uppercase">
                NETWORK
              </span>
            </div>
          </Link>
          <nav
            className="hidden xl:flex items-center gap-1"
            aria-label="Primary navigation"
          >
            {navItems.map(renderLink)}
            <details
              className="public-nav-explore"
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.currentTarget.removeAttribute("open");
                  event.currentTarget.querySelector("summary")?.focus();
                }
              }}
            >
              <summary
                className={`public-nav-link ${exploreItems.some((item) => isNavItemActive(pathname, item.href)) ? "text-foreground" : ""}`}
              >
                Explore <PublicIcon name="chevron" />
              </summary>
              <div className="public-nav-dropdown">
                <p className="public-kicker px-3 pt-2">More of the Network</p>
                {exploreItems.map(renderLink)}
              </div>
            </details>
          </nav>
          <div className="flex items-center gap-1 sm:gap-3">
            {liveHref && liveLabel && (
              <Link
                href={liveHref}
                target={isExternalLiveHref ? "_blank" : undefined}
                rel={isExternalLiveHref ? "noopener noreferrer" : undefined}
                className="flex min-h-11 items-center gap-2 px-2 py-1 border border-danger rounded text-xs sm:px-3 sm:text-sm uppercase tracking-wider text-danger live-indicator hover:bg-danger/10 transition-colors"
                aria-label={`Primary BARCODE Radio live and submissions status: ${liveLabel}`}
              >
                <span className="w-2 h-2 rounded-full bg-danger" />
                <span className="sm:hidden">
                  {siteShowMode === "broadcast_live" ? "LIVE" : "SUBMIT"}
                </span>
                <span className="hidden sm:inline">{liveLabel}</span>
              </Link>
            )}
            {accountEnabled && <Link href="/account" className="public-nav-link text-xs" aria-current={pathname.startsWith("/account") ? "page" : undefined}>Account</Link>}
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
    <div
      className="xl:hidden"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setOpen(false);
          event.currentTarget.querySelector("button")?.focus();
        }
      }}
    >
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center p-2 text-muted hover:text-foreground"
        aria-label={
          open ? "Close primary navigation" : "Open primary navigation"
        }
        aria-expanded={open}
        aria-controls={menuId}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="none"
          aria-hidden="true"
        >
          {open ? (
            <path
              d="M4 4L16 16M16 4L4 16"
              stroke="currentColor"
              strokeWidth="1.5"
            />
          ) : (
            <path
              d="M2 5H18M2 10H18M2 15H18"
              stroke="currentColor"
              strokeWidth="1.5"
            />
          )}
        </svg>
      </button>
      {open && (
        <div
          id={menuId}
          className="absolute top-14 left-0 right-0 max-h-[calc(100dvh-3.5rem)] overflow-y-auto overscroll-contain bg-background border-b border-border p-4"
        >
          <nav
            className="flex flex-col gap-1"
            aria-label="Mobile primary navigation"
          >
            <p className="public-kicker px-3">Start here</p>
            {[...navItems, ...exploreItems].map((item, index) => {
              const isActive = isNavItemActive(pathname, item.href);
              return (
                <div key={item.href}>
                  {index === navItems.length && (
                    <p className="public-kicker mt-5 px-3">
                      Explore the Network
                    </p>
                  )}
                  {item.href.startsWith("https://") ? (
                    <a
                      href={item.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="public-nav-link"
                      onClick={() => setOpen(false)}
                    >
                      <PublicIcon name={item.icon} />
                      {item.label}
                    </a>
                  ) : (
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      aria-current={isActive ? "page" : undefined}
                      className="public-nav-link"
                    >
                      <PublicIcon name={item.icon} />
                      {item.label}
                    </Link>
                  )}
                </div>
              );
            })}
          </nav>
        </div>
      )}
    </div>
  );
}
