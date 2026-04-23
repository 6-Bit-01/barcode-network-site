import Link from "next/link";
import { notFound } from "next/navigation";
import { SectionDot } from "@/components/LiveEffects";
import {
  getAllTransmissions,
  getTransmissionBySlug,
  formatTransmissionDate,
} from "@/lib/transmissions";
import type { Metadata } from "next";

// ── Static Params (pre-render all posts) ────────────────────
export function generateStaticParams() {
  return getAllTransmissions().map((post) => ({ slug: post.slug }));
}

// ── Dynamic Metadata ────────────────────────────────────────
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getTransmissionBySlug(slug);
  if (!post) return { title: "Transmission Not Found" };

  return {
    title: post.title,
    description: post.excerpt,
    openGraph: {
      title: `${post.title} — BARCODE Network`,
      description: post.excerpt,
      type: "article",
      publishedTime: post.date,
      authors: [post.author],
      tags: post.tags,
    },
    twitter: {
      card: "summary",
      title: post.title,
      description: post.excerpt,
    },
  };
}

// ── Page Component ──────────────────────────────────────────
export default async function TransmissionPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getTransmissionBySlug(slug);
  if (!post) notFound();

  // Find prev/next for navigation
  const allPosts = getAllTransmissions();
  const currentIndex = allPosts.findIndex((p) => p.slug === slug);
  const prevPost = currentIndex < allPosts.length - 1 ? allPosts[currentIndex + 1] : null;
  const nextPost = currentIndex > 0 ? allPosts[currentIndex - 1] : null;

  return (
    <div className="pt-14">
      {/* Back link */}
      <section className="border-b border-border noise-bg">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 py-16 sm:py-24">
          <Link
            href="/transmissions"
            className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-muted hover:text-accent transition-colors mb-8"
          >
            <span>←</span>
            <span>All Transmissions</span>
          </Link>

          {/* Date & Author */}
          <div className="flex items-center gap-4 mb-4 text-xs uppercase tracking-widest text-muted">
            <time dateTime={post.date}>
              {formatTransmissionDate(post.date)}
            </time>
            <span className="text-border">|</span>
            <span>{post.author}</span>
          </div>

          {/* Title */}
          <h1 className="text-2xl sm:text-4xl font-bold tracking-wide text-foreground mb-6">
            {post.title}
          </h1>

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
      </section>

      {/* Body */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 py-16">
          <div className="flex items-center gap-3 mb-10">
            <SectionDot />
            <h2 className="text-xs sm:text-sm uppercase tracking-[0.5em] text-muted">
              Transmission Body
            </h2>
          </div>

          <article className="space-y-6">
            {post.body.map((paragraph, i) => (
              <p
                key={i}
                className="text-sm sm:text-base text-muted leading-relaxed"
                dangerouslySetInnerHTML={{ __html: paragraph }}
              />
            ))}
          </article>
        </div>
      </section>

      {/* Prev / Next Navigation */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 py-8">
          <div className="flex justify-between items-center gap-4">
            {prevPost ? (
              <Link
                href={`/transmissions/${prevPost.slug}`}
                className="group flex flex-col text-left"
              >
                <span className="text-xs uppercase tracking-widest text-muted mb-1">
                  ← Older
                </span>
                <span className="text-sm text-foreground group-hover:text-accent transition-colors">
                  {prevPost.title}
                </span>
              </Link>
            ) : (
              <div />
            )}

            {nextPost ? (
              <Link
                href={`/transmissions/${nextPost.slug}`}
                className="group flex flex-col text-right"
              >
                <span className="text-xs uppercase tracking-widest text-muted mb-1">
                  Newer →
                </span>
                <span className="text-sm text-foreground group-hover:text-accent transition-colors">
                  {nextPost.title}
                </span>
              </Link>
            ) : (
              <div />
            )}
          </div>
        </div>
      </section>
    </div>
  );
}