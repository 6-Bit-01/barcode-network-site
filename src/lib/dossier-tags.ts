import type { DatabaseEntry } from "@/content";

export type DossierTagCategory =
  | "role"
  | "system"
  | "media"
  | "function"
  | "relationship"
  | "community"
  | "status"
  | "identity"
  | "technology"
  | "broadcast"
  | "creative"
  | "other";

export type DossierTagRegistryItem = {
  tag: string;
  canonical: string;
  category: DossierTagCategory;
  usageCount: number;
  usedByIds: string[];
  aliases: string[];
  description: string;
  source: "database_entries" | "manual_registry" | "inferred";
  status: "active" | "deprecated" | "candidate";
};

type DossierTagMetadata = {
  category: DossierTagCategory;
  aliases?: string[];
  description: string;
};

type DossierTagCreationPolicy = {
  defaultAction: "reuse_existing_tag_first";
  newTagsAllowed: "proposal_only";
  creationRequires: "operator_or_site_content_update";
  doNotCreateFor: string[];
  newTagProposalRequirements: string[];
};

type DossierTagRegistry = {
  source: "databasePage.entries";
  totalUniqueTags: number;
  totalTagAssignments: number;
  items: DossierTagRegistryItem[];
  usageCounts: Record<string, number>;
  categories: Record<DossierTagCategory, string[]>;
  aliases: Record<string, string>;
  rules: string[];
  creationPolicy: DossierTagCreationPolicy;
};

const DOSSIER_TAG_METADATA = {
  ai: {
    category: "technology",
    aliases: ["artificial intelligence", "machine intelligence"],
    description: "Connected to artificial intelligence, autonomous systems, or AI-assisted BARCODE operations.",
  },
  architecture: {
    category: "system",
    aliases: ["system design", "infrastructure design"],
    description: "Connected to structure, system design, or technical architecture.",
  },
  artist: {
    category: "identity",
    aliases: ["performer", "music artist"],
    description: "Identifies an artist, performer, or creative subject surfaced as a dossier role.",
  },
  automation: {
    category: "function",
    aliases: ["automated", "workflow"],
    description: "Connected to automated workflows, routing, or operational processing.",
  },
  broadcast: {
    category: "broadcast",
    aliases: ["live", "livestream", "on-air"],
    description: "Connected to BARCODE Radio, live programming, or broadcast behavior.",
  },
  engineer: {
    category: "role",
    aliases: ["technical engineer", "systems engineer"],
    description: "Identifies engineering, technical maintenance, or build responsibility.",
  },
  executive: {
    category: "role",
    aliases: ["leadership", "director"],
    description: "Identifies executive, leadership, or organizational authority.",
  },
  handler: {
    category: "role",
    aliases: ["operator", "control"],
    description: "Identifies handler, control, or operational stewardship roles.",
  },
  host: {
    category: "role",
    aliases: ["presenter", "emcee"],
    description: "Identifies an on-air host or primary presentation role.",
  },
  manager: {
    category: "role",
    aliases: ["management", "supervisor"],
    description: "Identifies management, oversight, or coordination responsibility.",
  },
  mod: {
    category: "community",
    aliases: ["moderation", "moderator"],
    description: "Connected to community moderation, safety, or participant stewardship.",
  },
  producer: {
    category: "creative",
    aliases: ["production", "program producer"],
    description: "Connected to production, programming, or creative assembly work.",
  },
  radio: {
    category: "broadcast",
    aliases: ["radio program", "radio show"],
    description: "Connected specifically to radio programming or the BARCODE Radio format.",
  },
  sponsor: {
    category: "relationship",
    aliases: ["partner", "supporter"],
    description: "Identifies sponsor, partner, or support relationship context.",
  },
  stagehand: {
    category: "role",
    aliases: ["crew", "production hand"],
    description: "Identifies support crew, stage, or behind-the-scenes production work.",
  },
  systems: {
    category: "system",
    aliases: ["infrastructure", "backend", "network"],
    description: "Connected to technical systems, infrastructure, or operational mechanisms.",
  },
  tech: {
    category: "technology",
    aliases: ["technology", "technical"],
    description: "Connected to technical platforms, tools, or technology-facing operations.",
  },
  virus: {
    category: "system",
    aliases: ["malware", "infection"],
    description: "Connected to virus-class, infection, or anomalous system behavior.",
  },
  writer: {
    category: "creative",
    aliases: ["copywriter", "author"],
    description: "Identifies writing, text, or authored creative work.",
  },
} satisfies Record<string, DossierTagMetadata>;

export const DOSSIER_TAG_RULES = [
  "Reuse an existing canonical tag before proposing a new one.",
  "Compare tags case-insensitively, but preserve the spelling already stored on database entries.",
  "Aliases are lookup hints for reuse; they do not rewrite existing dossier tags.",
  "Proposed tags are not created tags until an operator or site content update adds them to the registry/source content.",
  "Do not create tags for one-off wording differences, synonyms of existing tags, temporary queue appearances, private identities, or payment/customer data.",
  "Queue-derived artists do not automatically create dossier tags or dossier records.",
  "Tags should support search and organization, not decorative lore.",
] as const;

export const DOSSIER_TAG_CREATION_POLICY: DossierTagCreationPolicy = {
  defaultAction: "reuse_existing_tag_first",
  newTagsAllowed: "proposal_only",
  creationRequires: "operator_or_site_content_update",
  doNotCreateFor: [
    "one-off wording differences",
    "synonyms of existing tags",
    "temporary queue appearances",
    "private identities",
    "payment/customer data",
  ],
  newTagProposalRequirements: [
    "short lowercase label",
    "clear reason",
    "suggested category",
    "why existing tags do not fit",
    "which dossier would use it",
  ],
};

function normalizeTag(tag: string) {
  return tag.trim().toLocaleLowerCase();
}

function emptyCategories(): Record<DossierTagCategory, string[]> {
  return {
    role: [],
    system: [],
    media: [],
    function: [],
    relationship: [],
    community: [],
    status: [],
    identity: [],
    technology: [],
    broadcast: [],
    creative: [],
    other: [],
  };
}

function fallbackDescription(tag: string) {
  return `Existing dossier tag from databasePage.entries used for search and organization: ${tag}.`;
}

export function resolveDossierTagCanonical(tagOrAlias: string) {
  const normalized = normalizeTag(tagOrAlias);
  if (!normalized) return null;
  if (DOSSIER_TAG_METADATA[normalized as keyof typeof DOSSIER_TAG_METADATA]) return normalized;

  for (const [canonical, metadata] of Object.entries(DOSSIER_TAG_METADATA)) {
    if (metadata.aliases?.some((alias) => normalizeTag(alias) === normalized)) return canonical;
  }

  return null;
}

export function buildDossierTagRegistry(entries: DatabaseEntry[]): DossierTagRegistry {
  const tagRecords = new Map<string, { tag: string; usageCount: number; usedByIds: Set<string> }>();
  let totalTagAssignments = 0;

  for (const entry of entries) {
    for (const rawTag of entry.tags) {
      const normalized = normalizeTag(rawTag);
      if (!normalized) continue;
      totalTagAssignments += 1;

      const existing = tagRecords.get(normalized);
      if (existing) {
        existing.usageCount += 1;
        existing.usedByIds.add(entry.id);
      } else {
        tagRecords.set(normalized, {
          tag: rawTag,
          usageCount: 1,
          usedByIds: new Set([entry.id]),
        });
      }
    }
  }

  const categories = emptyCategories();
  const aliases: Record<string, string> = {};
  const usageCounts: Record<string, number> = {};
  const items = Array.from(tagRecords.entries())
    .map(([normalized, record]) => {
      const metadata = DOSSIER_TAG_METADATA[normalized as keyof typeof DOSSIER_TAG_METADATA];
      const category = metadata?.category ?? "other";
      const tagAliases = metadata?.aliases ?? [];
      const item: DossierTagRegistryItem = {
        tag: record.tag,
        canonical: record.tag,
        category,
        usageCount: record.usageCount,
        usedByIds: Array.from(record.usedByIds).sort(),
        aliases: tagAliases,
        description: metadata?.description ?? fallbackDescription(record.tag),
        source: metadata ? "database_entries" : "inferred",
        status: "active",
      };

      usageCounts[record.tag] = record.usageCount;
      categories[category].push(record.tag);
      for (const alias of tagAliases) aliases[alias] = record.tag;

      return item;
    })
    .sort((a, b) => a.tag.localeCompare(b.tag));

  for (const tags of Object.values(categories)) tags.sort((a, b) => a.localeCompare(b));

  return {
    source: "databasePage.entries",
    totalUniqueTags: items.length,
    totalTagAssignments,
    items,
    usageCounts,
    categories,
    aliases: Object.fromEntries(Object.entries(aliases).sort(([a], [b]) => a.localeCompare(b))),
    rules: [...DOSSIER_TAG_RULES],
    creationPolicy: DOSSIER_TAG_CREATION_POLICY,
  };
}
