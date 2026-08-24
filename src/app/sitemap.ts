import type { MetadataRoute } from "next";
import { databasePage } from "@/content";
import { getAllTransmissions } from "@/lib/transmissions";
import { listAllBNLJournalEntries } from "@/lib/bnl-journal-store";

// Journal entries are published between deployments, so the sitemap must read
// the live archive instead of freezing whatever Redis contained at build time.
export const dynamic = "force-dynamic";

function slugify(name: string) {
  return name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = "https://www.barcode-network.com";
  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    { url: base, changeFrequency: "weekly", priority: 1.0 },
    { url: `${base}/radio`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/radio/deck`, changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/radio/archive`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/database`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/bnl`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/journal`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/releases`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${base}/merch`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/terminal`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/transmissions`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/contact`, changeFrequency: "yearly", priority: 0.4 },
    { url: `${base}/legal`, changeFrequency: "yearly", priority: 0.4 },
  ];

  // Dynamic database pages
  const databasePages: MetadataRoute.Sitemap = databasePage.entries.map((entry) => ({
    url: `${base}/database/${slugify(entry.name)}`,
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));

  // Transmission blog posts
  const transmissionPages: MetadataRoute.Sitemap = getAllTransmissions().map((post) => ({
    url: `${base}/transmissions/${post.slug}`,
    lastModified: new Date(post.date),
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));

  let journalPages: MetadataRoute.Sitemap = [];
  try {
    const archive = await listAllBNLJournalEntries();
    if (archive.ok) {
      journalPages = archive.value.map((entry) => ({
        url: `${base}/journal/${entry.entryId}`,
        lastModified: new Date(entry.publishedAt),
        changeFrequency: "monthly" as const,
        priority: 0.6,
      }));
    }
  } catch {
    journalPages = [];
  }

  return [...staticPages, ...databasePages, ...transmissionPages, ...journalPages];
}
