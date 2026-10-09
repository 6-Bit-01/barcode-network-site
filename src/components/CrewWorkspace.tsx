"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { MemberAccess } from "@/lib/member-access";

export function CrewWorkspace({ access }: { access: MemberAccess }) {
  const [authorized, setAuthorized] = useState(true);
  useEffect(() => {
    let controller: AbortController | undefined;
    async function refresh() {
      controller?.abort(); controller = new AbortController(); const current = controller;
      setAuthorized(false);
      try {
        const response = await fetch("/api/member/access", { credentials: "same-origin", cache: "no-store", signal: current.signal });
        const data = response.ok ? await response.json() : null;
        if (current.signal.aborted) return;
        if (data?.user?.id !== access.user.id || data.access?.crew !== true || !(Date.parse(data.session?.expiresAt) > Date.now())) { window.location.assign("/account"); return; }
        setAuthorized(true);
      } catch { /* Keep private content hidden until access is revalidated. */ }
    }
    window.addEventListener("focus", refresh); window.addEventListener("pageshow", refresh);
    return () => { controller?.abort(); window.removeEventListener("focus", refresh); window.removeEventListener("pageshow", refresh); };
  }, [access.user.id]);
  return <section className="mx-auto max-w-3xl rounded-xl border border-border bg-surface p-5 sm:p-8">
    <Link href="/account" className="text-accent underline">Back to your account</Link>
    {authorized ? <><p className="public-kicker mt-6">BARCODE Network</p><h1 className="mt-2 text-3xl font-bold">Crew workspace</h1><p className="mt-5 text-muted">Your Crew access is assigned. Tools will become available here as they are ready.</p></> : <p role="status" className="mt-5">Checking your access. Return to your account if it is unavailable.</p>}
  </section>;
}
