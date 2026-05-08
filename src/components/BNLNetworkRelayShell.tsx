"use client";

import { usePathname } from "next/navigation";
import { BNLNetworkRelayTicker } from "@/components/BNLRelay";

export function BNLNetworkRelayShell() {
  const pathname = usePathname();
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return null;
  return <BNLNetworkRelayTicker />;
}
