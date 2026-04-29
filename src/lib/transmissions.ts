// ============================================================
// TRANSMISSIONS — Blog Content & Utilities
// ============================================================
// Each transmission is a blog post from the BARCODE Network.
// Content is stored as TypeScript for type safety and easy
// authoring without MDX build dependencies.
// ============================================================

export interface Transmission {
  slug: string;
  title: string;
  date: string; // ISO 8601, e.g. "2025-01-15"
  author: string;
  tags: string[];
  excerpt: string;
  coverImage?: string;
  /** Body paragraphs — supports HTML strings for rich formatting */
  body: string[];
}

// ── All Transmissions (newest first) ────────────────────────
export const transmissions: Transmission[] = [
  {
    slug: "signal-origins",
    title: "Signal Origins: How BARCODE Found Its Frequency",
    date: "2025-07-10",
    author: "BARCODE HQ",
    tags: ["origins", "broadcast", "signal"],
    excerpt:
      "Every signal begins the same way — as noise. This is the story of how BARCODE went from idea to independent broadcast network.",
    body: [
      "Every signal begins the same way — as noise.",
      "Before BARCODE was a network, a show, or a platform, it was just an idea: create a space where independent artists could actually be heard without needing permission from the algorithm.",
      "No gatekeepers. No committees deciding what gets pushed and what disappears.",
      "Just signal.",
      "BARCODE started with music. The early releases were collaborative projects built around a small core team — and then alongside a growing circle of artists contributing verses, production, and ideas.",
      "From those sessions came the first major transmission: <strong>BARCODE Vol. 1</strong> — a project built on the idea that collaboration could be the system itself.",
      "But the music was only the beginning.",
      "The next step was <strong>BARCODE Radio</strong>.",
      "Instead of relying on traditional platforms or playlist placement, BARCODE Radio became a live broadcast environment where artists could submit their music directly and have it played in real time. No algorithm deciding reach. No artificial bottlenecks.",
      "Artists submit. The signal gets played. The audience decides what resonates.",
      "Over time the infrastructure grew — a dedicated website, a growing Discord community, a developing database documenting artists and transmissions across the network, and tools like the BNL-01 system helping organize the expanding ecosystem.",
      "BARCODE isn't a streaming platform.",
      "It's an independent broadcast network built by artists, for artists — where signal moves directly from creator to listener.",
      "And the system is still expanding.",
      "New releases, new tools, new transmissions.",
      "If you're reading this, you've already tuned in.",
    ],
  },
];

// ── Utility Functions ───────────────────────────────────────

/** Get all transmissions, newest first */
export function getAllTransmissions(): Transmission[] {
  return transmissions.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
}

/** Get a single transmission by slug */
export function getTransmissionBySlug(slug: string): Transmission | undefined {
  return transmissions.find((t) => t.slug === slug);
}

/** Get all unique tags */
export function getAllTags(): string[] {
  const tags = new Set<string>();
  transmissions.forEach((t) => t.tags.forEach((tag) => tags.add(tag)));
  return Array.from(tags).sort();
}

/** Get transmissions by tag */
export function getTransmissionsByTag(tag: string): Transmission[] {
  return getAllTransmissions().filter((t) => t.tags.includes(tag));
}

/** Format date for display */
export function formatTransmissionDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}