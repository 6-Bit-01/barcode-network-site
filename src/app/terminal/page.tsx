import type { Metadata } from "next";
import { databasePage, externalLinks, radioPage, releasesPage } from "@/content";
import { getDatabaseAggregateStats } from "@/lib/database-stats";
import { getRadioSubmissionRouting } from "@/lib/radio-submission-routing";
import { getAllTransmissions } from "@/lib/transmissions";
import { TerminalShell } from "./terminal-shell";

export const metadata: Metadata = {
  title: "Network Archive Terminal — BARCODE Network",
  description:
    "Enter the public BARCODE Network archive. Search dossiers, trace transmissions, monitor BNL-01, and investigate the records behind the signal.",
  openGraph: {
    title: "Network Archive Terminal — BARCODE Network",
    description:
      "Enter the public BARCODE Network archive. Search dossiers, trace transmissions, monitor BNL-01, and investigate the records behind the signal.",
  },
  alternates: { canonical: "/terminal" },
};

function slugify(name: string) {
  return name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

export default function TerminalPage() {
  const submission = getRadioSubmissionRouting();
  const archive = {
    dossiers: databasePage.entries.map((entry) => ({
      id: entry.id,
      name: entry.name,
      category: entry.category,
      status: entry.status,
      role: entry.role,
      clearance: entry.clearance,
      origin: entry.origin,
      summary: entry.summary,
      tags: entry.tags,
      slug: slugify(entry.name),
    })),
    transmissions: getAllTransmissions().map((post) => ({
      slug: post.slug,
      title: post.title,
      date: post.date,
      author: post.author,
      excerpt: post.excerpt,
      tags: post.tags,
    })),
    releases: releasesPage.catalog.map((release) => ({
      title: release.title,
      date: release.date,
      status: release.status,
      description: release.description,
    })),
    radio: {
      description: submission.terminalDescription,
      schedule: radioPage.schedule,
      links: {
        radio: "/radio",
        submit: submission.href,
        submitLabel: submission.submitLabel,
        submitExternal: submission.external,
        discord: externalLinks.discord,
        live: externalLinks.tiktokLive,
      },
    },
    stats: getDatabaseAggregateStats(databasePage.entries),
  };

  return (
    <div className="min-h-screen border-b border-border bg-background pt-14 noise-bg">
      <div className="mx-auto max-w-7xl px-3 pb-2 pt-2 sm:px-6">
        <TerminalShell archive={archive} />
      </div>
    </div>
  );
}
