import { databasePage } from "@/content";
import { DossierPageView } from "@/components/DossierPageView";
import { databaseEntryToDossierPageViewModel } from "@/lib/dossier-page-view-model";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

function slugify(name: string) {
  return name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

// Generate static paths for all entries
export function generateStaticParams() {
  return databasePage.entries.map((entry) => ({
    slug: slugify(entry.name),
  }));
}

// Dynamic metadata per entity
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const entry = databasePage.entries.find((e) => slugify(e.name) === slug);
  if (!entry) return { title: "Not Found — BARCODE Network" };

  return {
    title: `${entry.name} — BARCODE Network Database`,
    description: entry.summary,
    openGraph: {
      title: `${entry.name} — BARCODE Network Database`,
      description: entry.summary,
    },
  };
}

export default async function EntityPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const entry = databasePage.entries.find((e) => slugify(e.name) === slug);

  if (!entry) notFound();

  return <DossierPageView dossier={databaseEntryToDossierPageViewModel(entry)} />;
}
