import { PublicIcon } from "@/components/PublicIcon";
import Link from "next/link";
import { PageHero } from "@/components/LiveEffects";
import {
  getAllTransmissions,
  formatTransmissionDate,
} from "@/lib/transmissions";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Transmissions",
  description:
    "Dispatches from the BARCODE Network. Dev logs, signal reports, and broadcast notes from across the interdimensional airwaves.",
  openGraph: {
    title: "Transmissions — BARCODE Network",
    description:
      "Dispatches from the BARCODE Network. Dev logs, signal reports, and broadcast notes.",
  },
  alternates: { canonical: "/transmissions" },
};

export default function TransmissionsPage() {
  const posts = getAllTransmissions();

  return (
    <div className="public-page">
      {/* Hero */}
      <section className="public-section">
        <div className="public-container">
          <PageHero
            label="// TRANSMISSION LOG"
            heading="Transmissions"
            description="Dispatches from the BARCODE Network. Dev logs, signal reports, and broadcast notes from across the interdimensional airwaves."
          />
        </div>
      </section>

      {/* Posts List */}
      <section className="public-section">
        <div className="public-container">
          <div className="flex items-center gap-3 mb-10">
            <PublicIcon name="send" className="public-icon" />
            <h2 className="public-section-heading">
              All Transmissions
            </h2>
          </div>

          <div className="divide-y divide-border">
            {posts.map((post) => (
              <Link
                key={post.slug}
                href={`/transmissions/${post.slug}`}
                className="block group py-6 transition-colors hover:bg-surface/40"
              >
                <div className="grid gap-5 sm:grid-cols-[10rem_1fr]">
                  {/* Date & Author */}
                  <div className="flex flex-wrap content-start gap-2 text-sm text-muted sm:flex-col">
                    <time dateTime={post.date}>
                      {formatTransmissionDate(post.date)}
                    </time>
                    <span className="hidden">|</span>
                    <span>{post.author}</span>
                  </div>

                  <div>
                  {/* Title */}
                  <h3 className="text-lg sm:text-xl font-bold tracking-wide text-foreground group-hover:text-accent transition-colors mb-3">
                    {post.title}
                  </h3>

                  {/* Excerpt */}
                  <p className="text-sm text-muted leading-relaxed mb-4">
                    {post.excerpt}
                  </p>

                  {/* Tags */}
                  <div className="flex flex-wrap gap-2">
                    {post.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-0.5 text-xs uppercase tracking-wider border border-border text-muted"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  <span className="public-button mt-3">Read transmission <PublicIcon name="arrow" /></span>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {posts.length === 0 && (
            <div className="text-center py-16 text-muted">
              <p className="text-sm uppercase tracking-widest">
                No transmissions yet. The signal is still resolving…
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
