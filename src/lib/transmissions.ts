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
  {
    slug: "queue-system-explained",
    title: "The Queue: A Breakdown of the Transmission Protocol",
    date: "2025-07-08",
    author: "BARCODE HQ",
    tags: ["queue", "technical", "guide"],
    excerpt:
      "How submissions enter the BARCODE broadcast queue, how tiers work, and what happens when your transmission reaches the front of the line.",
    body: [
      "The BARCODE queue isn't a playlist. It's a priority-weighted transmission buffer. Submissions enter at the back and advance forward, but not all at the same speed.",
      "<strong>Free tier</strong> — anyone can submit. Zero cost, zero friction. Your entry joins the back of the queue and advances naturally. Rate limited to 3 submissions per hour to prevent flooding.",
      '<strong>Featured ($3)</strong> — a small signal boost. Your submission skips ahead of free entries and gets a green highlight in the queue display. Think of it as "I believe in this enough to buy it a coffee."',
      "<strong>Fast Lane ($5)</strong> — meaningful queue advancement. Jumps ahead of both Free and Featured entries. The yellow tier. For when you want your transmission heard sooner rather than later.",
      "<strong>Front Row ($10)</strong> — maximum priority. Your entry goes to the front of the queue, behind only other Front Row submissions. The red tier. First in line, first on air.",
      "All payments are processed through Stripe. No accounts required — just submit, pay, and your transmission enters the buffer. The queue processes entries in tier-weighted order during live broadcasts.",
      "Every submission that airs gets logged. Play counts, timestamps, tier — all tracked. The system remembers every signal that passed through.",
    ],
  },
  {
    slug: "building-in-public",
    title: "Building in Public: The BARCODE Dev Log",
    date: "2025-07-05",
    author: "BARCODE HQ",
    tags: ["dev-log", "technical", "open-source"],
    excerpt:
      "A look behind the broadcast — the tech stack, the decisions, and why we're building BARCODE the way we are.",
    body: [
      "BARCODE runs on Next.js, Tailwind CSS, Upstash Redis, and Stripe. It deploys to Vercel. The OBS overlay connects via iframe. The Discord bot polls the API. It's a frankenstein of modern web tools stitched together with intent.",
      "Why Next.js? Because server-side rendering matters for SEO, and static generation matters for speed. Every database dossier is pre-rendered at build time. The queue page is dynamic. The admin panel is server-authenticated.",
      "Why Upstash Redis? Because the queue needs to be fast, persistent, and accessible from both the website and external services (Discord bot, OBS overlay, future stream engine). Redis is the nervous system.",
      "Why Stripe? Because musicians deserve to get paid, and payment infrastructure should be invisible. No accounts, no sign-ups. Scan → pay → you're in the queue. That's it.",
      "The CRT aesthetic isn't decoration — it's philosophy. Old technology had character. Scan lines, phosphor glow, signal degradation — these aren't bugs, they're texture. BARCODE looks the way it sounds: analog warmth through digital pipes.",
      "Everything is being built incrementally. Phase 1 was the core site. Phase 2 added the Discord bot. Phase 3 (you're reading it) is the blog. Phase 4 will be the AI stream automation engine. Each phase adds a new dimension to the broadcast.",
      "We're documenting the process because building in public creates accountability. And because someone, somewhere, is trying to build something similar and could use a reference signal.",
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