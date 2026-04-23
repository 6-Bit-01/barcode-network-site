import Link from "next/link";
import { PageHero, SectionDot } from "@/components/LiveEffects";
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
};

export default function TransmissionsPage() {
  const posts = getAllTransmissions();

  return (
    <div className="pt-14">
      {/* Hero */}
      <section className="border-b border-border noise-bg">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-16 sm:py-24">
          <PageHero
            label="// TRANSMISSION LOG"
            heading="Transmissions"
            description="Dispatches from the BARCODE Network. Dev logs, signal reports, and broadcast notes from across the interdimensional airwaves."
          />
        </div>
      </section>

      {/* Posts List */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-16">
          <div className="flex items-center gap-3 mb-10">
            <SectionDot />
            <h2 className="text-xs sm:text-sm uppercase tracking-[0.5em] text-muted">
              All Transmissions
            </h2>
          </div>

          <div className="space-y-6">
            {posts.map((post) => (
              <Link
                key={post.slug}
                href={`/transmissions/${post.slug}`}
                className="block border border-border bg-surface hover:border-accent/40 transition-colors group"
              >
                <div className="p-6 sm:p-8">
                  {/* Date & Author */}
                  <div className="flex items-center gap-4 mb-3 text-xs uppercase tracking-widest text-muted">
                    <time dateTime={post.date}>
                      {formatTransmissionDate(post.date)}
                    </time>
                    <span className="text-border">|</span>
                    <span>{post.author}</span>
                  </div>

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