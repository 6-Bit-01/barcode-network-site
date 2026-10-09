"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { isAccountWorkspace } from "@/lib/account-workspace";
import Link from "next/link";
import type { RadioSubmissionRouting } from "@/lib/radio-submission-routing";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { DataStream } from "@/components/DataStream";
import { BNLNetworkRelayShell } from "@/components/BNLNetworkRelayShell";

export function SiteChrome({
  children,
  radioSubmission,
  accountEnabled = false,
}: {
  children: ReactNode;
  radioSubmission: RadioSubmissionRouting;
  accountEnabled?: boolean;
}) {
  const pathname = usePathname();

  if (pathname === "/world/playtest" || pathname.startsWith("/overlay/")) {
    return children;
  }

  if (isAccountWorkspace(pathname)) {
    return <div className="account-workspace"><a href="#main-content" className="skip-link">Skip to main content</a><header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5"><span className="font-bold">BARCODE Network</span><Link href="/account" className="btn-secondary">My account</Link></header><main id="main-content" className="min-h-screen overflow-x-hidden" tabIndex={-1}>{children}</main></div>;
  }
  const publicPresentation =
    !/^\/(admin|queue|obs|secret-menu|connect|world|games)(?:\/|$)/.test(
      pathname,
    );

  return (
    <div className={publicPresentation ? "public-site" : undefined}>
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      {!publicPresentation && <DataStream />}
      <Header accountEnabled={accountEnabled} />
      <BNLNetworkRelayShell />
      <main
        id="main-content"
        className="min-h-screen animate-interference overflow-x-hidden"
        tabIndex={-1}
      >
        {children}
      </main>
      <Footer submission={radioSubmission} />
    </div>
  );
}
