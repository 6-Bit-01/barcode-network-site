"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { MemberAccess } from "@/lib/member-access";

export function MemberAccessNavigation({ memberId }: { memberId: string }) {
  const [access, setAccess] = useState<MemberAccess | null>(null);
  useEffect(() => {
    let controller: AbortController | undefined;
    const refresh = async () => {
      controller?.abort();
      controller = new AbortController();
      const current = controller;
      setAccess(null);
      try {
        const response = await fetch("/api/member/access", { credentials: "same-origin", cache: "no-store", signal: current.signal });
        const data = response.ok ? await response.json() : null;
        if (!current.signal.aborted && data?.user?.id === memberId && typeof data.access?.owner === "boolean" && typeof data.access?.crew === "boolean" && Date.parse(data.session?.expiresAt) > Date.now()) setAccess(data);
      } catch { /* Access stays hidden when the authority cannot be reached. */ }
    };
    void refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("pageshow", refresh);
    return () => { controller?.abort(); window.removeEventListener("focus", refresh); window.removeEventListener("pageshow", refresh); };
  }, [memberId]);
  if (!access || (!access.access.owner && !access.access.crew)) return null;
  return <nav aria-label="Your assigned access" className="flex flex-wrap gap-3 border-t border-border pt-5">
    {access.access.owner && <Link className="btn-primary" href="/account/owner">Owner access</Link>}
    {access.access.crew && <Link className="btn-secondary" href="/account/crew">Crew access</Link>}
  </nav>;
}
