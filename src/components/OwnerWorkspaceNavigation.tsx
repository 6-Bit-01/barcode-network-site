import Link from "next/link";
import { OWNER_WORKSPACE_SECTIONS, type OwnerWorkspaceSection } from "@/lib/owner-workspace";

export function OwnerWorkspaceNavigation({ section }: { section: OwnerWorkspaceSection }) {
  return <div className="mb-8 border-b border-border pb-5">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-sm">
      {section === "home" ? <span className="font-bold text-foreground">Owner Home</span> : <Link href="/account/owner" className="text-accent underline underline-offset-4">Back to Owner Home</Link>}
      <Link href="/account" className="text-foreground/70 underline underline-offset-4 hover:text-foreground">Your account</Link>
    </div>
    <nav aria-label="Owner workspace" className="flex flex-wrap gap-2">
      {OWNER_WORKSPACE_SECTIONS.map(item => <Link key={item.id} href={item.href} aria-current={section === item.id ? "page" : undefined} className={"rounded-lg border px-3 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent " + (section === item.id ? "border-accent/60 bg-accent/10 font-bold text-accent" : "border-border text-foreground/70 hover:border-accent/40 hover:text-foreground")}>
        {item.label}
      </Link>)}
    </nav>
  </div>;
}
