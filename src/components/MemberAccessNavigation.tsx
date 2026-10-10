"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { MemberAccess } from "@/lib/member-access";

export async function fetchCurrentMemberAccess(memberId: string, signal?: AbortSignal): Promise<MemberAccess | null> {
  try {
    const response = await fetch("/api/member/access", { credentials: "same-origin", cache: "no-store", signal });
    const data = response.ok ? await response.json() : null;
    if (!signal?.aborted && data?.user?.id === memberId && typeof data.access?.owner === "boolean" && typeof data.access?.crew === "boolean" && Date.parse(data.session?.expiresAt) > Date.now()) return data;
  } catch { /* Access remains unavailable when the authority cannot be reached. */ }
  return null;
}

export function MemberAccessNavigation({ memberId }: { memberId: string }) {
  const [access, setAccess] = useState<MemberAccess | null>(null);
  useEffect(() => {
    let controller: AbortController | undefined;
    const refresh = async () => {
      controller?.abort();
      controller = new AbortController();
      const current = controller;
      setAccess(null);
      const data = await fetchCurrentMemberAccess(memberId,current.signal);
      if (!current.signal.aborted) setAccess(data);
    };
    void refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("pageshow", refresh);
    return () => { controller?.abort(); window.removeEventListener("focus", refresh); window.removeEventListener("pageshow", refresh); };
  }, [memberId]);
  if (!access || (!access.access.owner && !access.access.crew)) return null;
  const linkClass = "inline-flex min-h-12 cursor-pointer items-center justify-center rounded-lg border px-4 py-3 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent";
  return <nav aria-label="Your assigned access" className="mt-5 space-y-3 rounded-lg border border-accent/40 bg-accent/5 p-4">
    <p className="text-sm font-semibold">Your dashboards</p>
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
      {access.access.owner && <Link className={`${linkClass} border-accent bg-accent text-background hover:bg-accent-dim`} href="/account/owner">Owner dashboard</Link>}
      {access.access.crew && <Link className={`${linkClass} border-border-light bg-background text-foreground hover:border-accent hover:bg-surface-light`} href="/account/crew">Crew dashboard</Link>}
    </div>
    <p className="text-xs text-foreground/80">{access.access.owner ? "Manage Network accounts and open your assigned Owner tools." : "Open the Crew tools assigned to your account."}</p>
  </nav>;
}
