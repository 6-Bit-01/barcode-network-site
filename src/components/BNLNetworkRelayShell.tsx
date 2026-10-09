"use client";

import { usePathname } from "next/navigation";
import { isAccountWorkspace } from "@/lib/account-workspace";
import { BNLNetworkRelayTicker } from "@/components/BNLRelay";

export function BNLNetworkRelayShell() {
  const pathname = usePathname();
  if (isAccountWorkspace(pathname) || pathname === "/admin" || pathname.startsWith("/admin/")) return null;
  return <BNLNetworkRelayTicker />;
}
