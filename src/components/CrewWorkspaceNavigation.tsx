import Link from "next/link";
import type { MemberAccess } from "@/lib/member-access";

const sections = [
  { id: "home", label: "Crew Home", title: "Crew Home", href: "/account/crew", permission: null },
  { id: "show", label: "Live show", title: "Live show overview", href: "/account/crew/show", permission: "show.overview" },
  { id: "songs", label: "Songs", title: "BARCODE song generator", href: "/account/crew/songs", permission: "song.generate" },
  { id: "insights", label: "Insights", title: "Show & community insights", href: "/account/crew/insights", permission: "insights.read" },
] as const;

type CrewWorkspaceSection = typeof sections[number]["id"];

export function CrewWorkspaceNavigation({ access, section }: { access: MemberAccess; section: CrewWorkspaceSection }) {
  const assigned = access.access?.permissions, available = access.access?.availablePermissions;
  // eslint-disable-next-line react-hooks/purity -- Hide tool links as soon as this render observes session expiry.
  const valid = access.access?.crew === true && Date.parse(access.session?.expiresAt) > Date.now()
    && Array.isArray(assigned) && assigned.every(permission => typeof permission === "string")
    && Array.isArray(available) && available.every(permission => typeof permission === "string");
  const accountLink = <Link href="/account" className="text-foreground/70 underline underline-offset-4 hover:text-foreground">Your account</Link>;
  if (!valid) return accountLink;

  const current = sections.find(item => item.id === section)!;
  const visible = sections.filter(item => item.permission === null || (assigned.includes(item.permission) && available.includes(item.permission)));
  return <div className="mb-8 border-b border-border pb-5">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-sm">
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2">
        {section === "home" ? <span aria-current="page" className="font-bold">Crew Home</span> : <>
          <Link href="/account/crew" className="text-accent underline underline-offset-4">Crew Home</Link>
          <span aria-hidden="true" className="text-foreground/50">/</span>
          <span aria-current="page" className="font-bold">{current.title}</span>
        </>}
      </nav>
      {accountLink}
    </div>
    <nav aria-label="Crew workspace" className="flex flex-wrap gap-2">
      {visible.map(item => item.id === section ? <span key={item.id} aria-current="page" className="rounded-lg border border-accent/60 bg-accent/10 px-3 py-2 text-sm font-bold text-accent">{item.label}</span> : <Link key={item.id} href={item.href} className="rounded-lg border border-border px-3 py-2 text-sm text-foreground/70 transition-colors hover:border-accent/40 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">{item.label}</Link>)}
    </nav>
  </div>;
}
