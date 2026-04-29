import type { MetadataRoute } from "next";
import { databasePage } from "@/content";
import { getAllTransmissions } from "@/lib/transmissions";

function toSlug(entry: { id: string; name: string }): string {
  return `${entry.id}-${entry.name}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}


export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://barcode-network.com";
  const now = new Date();

  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    { url: base, lastModified: now, changeFrequency: "weekly", priority: 1.0 },
    { url: `${base}/radio`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/database`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/releases`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${base}/merch`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/terminal`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/transmissions`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
  ];

  // Dynamic database pages
  const databasePages: MetadataRoute.Sitemap = databasePage.entries.map((entry) => ({
    url: `${base}/database/${toSlug(entry)}`,
    lastModified: now,
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

  return [...staticPages, ...databasePages, ...transmissionPages];
}
