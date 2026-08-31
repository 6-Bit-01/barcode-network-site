"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import type { RadioSubmissionRouting } from "@/lib/radio-submission-routing";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { DataStream } from "@/components/DataStream";
import { BNLNetworkRelayShell } from "@/components/BNLNetworkRelayShell";

export function SiteChrome({ children, radioSubmission }: { children: ReactNode; radioSubmission: RadioSubmissionRouting }) {
  const pathname = usePathname();

  if (pathname === "/world/playtest" || pathname.startsWith("/overlay/")) {
    return children;
  }

  return (
    <>
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <DataStream />
      <Header />
      <BNLNetworkRelayShell />
      <main
        id="main-content"
        className="min-h-screen animate-interference overflow-x-hidden"
        tabIndex={-1}
      >
        {children}
      </main>
      <Footer submission={radioSubmission} />
    </>
  );
}
