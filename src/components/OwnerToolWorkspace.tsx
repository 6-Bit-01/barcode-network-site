import Link from "next/link";
import { OwnerWorkspaceNavigation } from "@/components/OwnerWorkspaceNavigation";
import { OWNER_TOOL_SECTIONS, type OwnerToolSection } from "@/lib/owner-workspace";

export function OwnerToolWorkspace({ section }: { section: OwnerToolSection }) {
  const group = OWNER_TOOL_SECTIONS[section];
  return <div className="mx-auto min-h-screen max-w-6xl px-4 py-10 sm:px-6">
    <OwnerWorkspaceNavigation section={section} />
    <h1 className="text-3xl font-bold">{group.title}</h1>
    <p className="mt-3 max-w-2xl text-foreground/70">{group.description}</p>
    <p className="mt-3 text-sm text-foreground/70">{section === "bnl" ? "The BARCODE song generator and Broadcast Ballads use your Owner sign-in. Journals and Relay controls use your existing show-control sign-in." : "These tools currently use your existing show-control sign-in."}</p>
    <div className="mt-8 grid gap-4 md:grid-cols-2">{group.tools.map(tool => <Link key={tool.href} href={tool.href} className="rounded-xl border border-border bg-surface p-6 transition-colors hover:border-accent/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
      <h2 className="text-xl font-bold text-accent">{tool.title}<span aria-hidden="true"> →</span></h2>
      <p className="mt-2 text-sm leading-relaxed text-foreground/70">{tool.description}</p>
    </Link>)}</div>
  </div>;
}
