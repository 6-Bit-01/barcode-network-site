import Link from "next/link";
import { OWNER_WORKSPACE_SECTIONS, type OwnerWorkspaceSection } from "@/lib/owner-workspace";

export function OwnerWorkspaceNavigation({ section, tool }: { section: OwnerWorkspaceSection; tool?: string }) {
  const current = OWNER_WORKSPACE_SECTIONS.find(item => item.id === section)!;
  return <div className="mb-8 border-b border-border pb-5">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-sm">
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2">
        {section === "home" ? <span aria-current="page" className="font-bold">Owner Home</span> : <>
          <Link href="/account/owner" className="text-accent underline underline-offset-4">Owner Home</Link>
          <span aria-hidden="true" className="text-foreground/50">/</span>
          {tool ? <><Link href={current.href} className="text-accent underline underline-offset-4">{current.label}</Link><span aria-hidden="true" className="text-foreground/50">/</span><span aria-current="page" className="font-bold">{tool}</span></> : <span aria-current="page" className="font-bold">{current.label}</span>}
        </>}
      </nav>
      <Link href="/account" className="text-foreground/70 underline underline-offset-4 hover:text-foreground">Your account</Link>
    </div>
    <nav aria-label="Owner workspace" className="flex flex-wrap gap-2">
      {OWNER_WORKSPACE_SECTIONS.map(item => section === item.id ? <span key={item.id} aria-current="location" className="rounded-lg border border-accent/60 bg-accent/10 px-3 py-2 text-sm font-bold text-accent">{item.label}</span> : <Link key={item.id} href={item.href} className="rounded-lg border border-border px-3 py-2 text-sm text-foreground/70 transition-colors hover:border-accent/40 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">{item.label}</Link>)}
    </nav>
  </div>;
}
