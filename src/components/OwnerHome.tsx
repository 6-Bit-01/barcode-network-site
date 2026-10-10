import Link from "next/link";
import { OwnerWorkspaceNavigation } from "@/components/OwnerWorkspaceNavigation";

const tasks = [
  { title: "Radio & shows", description: "Prepare the next broadcast, run the queue, or review an archived show.", action: "Run a show", href: "/admin/show-management", sectionHref: "/account/owner/radio" },
  { title: "Artists & history", description: "Approve an Artist project, review older songs, or correct public credits.", action: "Review Artist access", href: "/account/owner/artists", sectionHref: "/account/owner/artists" },
  { title: "Accounts & Crew", description: "Find an account, manage its profile, assign Crew access, or handle recovery.", action: "Manage accounts & Crew", href: "/account/owner/accounts", sectionHref: "/account/owner/accounts" },
  { title: "BNL & music", description: "Work on Broadcast Ballads, review Journals, or manage BNL's Relay.", action: "Write with BNL", href: "/admin/ballads", sectionHref: "/account/owner/bnl" },
];
export function OwnerHome() {
  return <div className="mx-auto min-h-screen max-w-6xl px-4 py-10 sm:px-6">
    <OwnerWorkspaceNavigation section="home" />
    <p className="public-kicker">BARCODE Network</p>
    <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Owner Home</h1>
    <p className="mt-3 max-w-2xl text-foreground/70">Choose what you need to do. Your show, Artist, account, and BNL tools are organized here.</p>
    <div className="mt-8 grid gap-4 md:grid-cols-2">
      {tasks.map(task => <section key={task.href} className="flex flex-col rounded-xl border border-border bg-surface p-6">
        <h2 className="text-xl font-bold"><Link href={task.sectionHref} className="hover:text-accent underline-offset-4 hover:underline">{task.title}</Link></h2>
        <p className="mb-5 mt-2 flex-1 text-sm leading-relaxed text-foreground/70">{task.description}</p>
        <Link href={task.href} className="w-fit rounded-lg border border-accent/50 bg-accent/10 px-4 py-2 font-bold text-accent hover:bg-accent/20">{task.action}<span aria-hidden="true"> →</span></Link>
      </section>)}
    </div>
    <section className="mt-8 flex flex-col justify-between gap-4 rounded-xl border border-border p-5 sm:flex-row sm:items-center">
      <div><h2 className="font-bold">Maintenance</h2><p className="mt-1 text-sm text-foreground/70">Storage, uploads, and checkout recovery when something needs attention.</p></div>
      <Link href="/account/owner/maintenance" className="shrink-0 text-sm text-accent underline underline-offset-4">Open Maintenance</Link>
    </section>
  </div>;
}
