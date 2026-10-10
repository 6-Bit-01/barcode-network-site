"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { CrewWorkspaceNavigation } from "@/components/CrewWorkspaceNavigation";
import type { MemberAccess } from "@/lib/member-access";
const tools = [
 { permission: "show.overview", title: "Live show overview", description: "See what's playing, who's next, and artist introduction cards.", href: "/account/crew/show" },
 { permission: "song.generate", title: "BARCODE song generator", description: "Write and refine lyrics and a Suno prompt with BNL.", href: "/account/crew/songs" },
 { permission: "insights.read", title: "Show & community insights", description: "Review show activity, artist history, pacing and account growth.", href: "/account/crew/insights" }
];
function hasCurrentCrewAccess(access: MemberAccess) {
 return access.access?.crew === true && Date.parse(access.session?.expiresAt) > Date.now()
  && Array.isArray(access.access.permissions) && access.access.permissions.every(permission => typeof permission === "string")
  && Array.isArray(access.access.availablePermissions) && access.access.availablePermissions.every(permission => typeof permission === "string");
}
export function CrewWorkspace({ access }: { access: MemberAccess }) {
 const [check, setCheck] = useState({ input: access, authorized: true });
 const [projection, setProjection] = useState({ input: access, value: access });
 // A new server-confirmed projection takes precedence over retained client state.
 const current = projection.input === access ? projection.value : access;
 const authorized = check.input !== access || check.authorized;
 useEffect(() => {
  let controller: AbortController | undefined;
  async function refresh() {
   controller?.abort(); controller = new AbortController(); const active = controller; setCheck({ input: access, authorized: false });
   try {
    const response = await fetch("/api/member/access", { credentials: "same-origin", cache: "no-store", signal: active.signal });
    const data = response.ok ? await response.json() : null;
    if (active.signal.aborted) return;
    if (data?.user?.id !== access.user.id || !hasCurrentCrewAccess(data)) {
     setProjection({ input: access, value: { ...access, access: { ...access.access, crew: false, permissions: [], availablePermissions: [] } } });
     window.location.assign("/account"); return;
    }
    setProjection({ input: access, value: data }); setCheck({ input: access, authorized: true });
   } catch { /* Keep content hidden until access is checked. */ }
  }
  window.addEventListener("focus", refresh); window.addEventListener("pageshow", refresh);
  return () => { controller?.abort(); window.removeEventListener("focus", refresh); window.removeEventListener("pageshow", refresh); };
 }, [access]);
 const ready = authorized && hasCurrentCrewAccess(current);
 const available = ready ? tools.filter(tool => current.access.permissions.includes(tool.permission) && current.access.availablePermissions.includes(tool.permission)) : [];
 return <section className="mx-auto max-w-5xl rounded-xl border border-border bg-surface p-5 sm:p-8">
  {ready ? <>
   <CrewWorkspaceNavigation access={current} section="home" />
   <p className="public-kicker">BARCODE Network</p>
   <div className="mt-2 flex flex-wrap items-center gap-3"><h1 className="text-3xl font-bold">Crew Home</h1><span className="rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-xs font-bold text-accent">Crew</span></div>
   <p className="mt-3 text-foreground/70">{current.user.name}</p>
   {available.length ? <><p className="mt-3 text-muted">Your assigned tools. Choose what you need for the show or your next BARCODE song.</p><div className="mt-8 grid gap-4 md:grid-cols-2">{available.map(tool => <Link key={tool.href} href={tool.href} className="rounded-xl border border-border p-5 hover:border-accent focus-visible:outline-2 focus-visible:outline-accent"><h2 className="text-xl font-bold text-accent">{tool.title}<span aria-hidden="true"> →</span></h2><p className="mt-2 text-muted">{tool.description}</p></Link>)}</div></> : <p className="mt-5 text-muted">Your Crew access is assigned. Tools will become available here as they are ready.</p>}
  </> : <><Link href="/account" className="text-accent underline">Your account</Link><p role="status" className="mt-5">Checking your access. Return to your account if it is unavailable.</p></>}
 </section>;
}
