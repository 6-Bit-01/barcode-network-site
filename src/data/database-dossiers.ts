export type DossierCategory =
  | "Personnel"
  | "Production"
  | "Entity"
  | "Interface"
  | "Sponsor";

export type DossierStatus = "ACTIVE" | "PENDING" | "UNKNOWN";
export type DossierClearance = "PUBLIC" | "INTERNAL" | "RESTRICTED";
export type DossierOrigin = "KNOWN" | "UNKNOWN" | "UNVERIFIED" | "WITHHELD";

export type DossierFile = {
  name: string;
  url: string;
  type: "download" | "audio" | "video" | "image";
};

export type DatabaseDossier = {
  id: string;
  slug: string;
  title: string;
  category: DossierCategory;
  image: string;
  summary: string;
  status: DossierStatus;
  clearance: DossierClearance;
  role: string;
  origin: DossierOrigin;
  tags: string[];
  notes: string;
  link: string;
  files: DossierFile[];
};

export const databaseCategories: Array<{ name: DossierCategory; description: string }> = [
  { name: "Personnel", description: "Operators, moderators, and internal staff" },
  { name: "Production", description: "Programs and recurring broadcasts" },
  { name: "Entity", description: "Sentient beings, hosts, and anomalies" },
  { name: "Interface", description: "External systems and public-facing access points" },
  { name: "Sponsor", description: "Brands and external signals funding the network" },
];

const dossiers: DatabaseDossier[] = [
  {
    id: "PE-001",
    slug: "mr-nice-guy-productions",
    title: "Mr. Nice Guy Productions",
    category: "Personnel",
    image: "/MC-nice.png",
    summary: "Discord and BARCODE Radio mod. Positive operator and network support node.",
    status: "ACTIVE",
    clearance: "INTERNAL",
    role: "Moderator",
    origin: "KNOWN",
    tags: ["mod", "producer", "artist"],
    notes: "Chris. Helps moderate the network and facilitate community interaction.",
    link: "",
    files: [],
  },
  { id: "PE-002", slug: "mind-fanatic", title: "Mind Fanatic", category: "Personnel", image: "", summary: "Moderator and systems analyst supporting broadcast operations.", status: "ACTIVE", clearance: "INTERNAL", role: "Moderator / Analyst", origin: "KNOWN", tags: ["mod", "writer", "systems"], notes: "Operates in review and advisory roles for network process flow.", link: "", files: [] },
  { id: "PE-003", slug: "hellcatnz", title: "HellcatNZ", category: "Personnel", image: "", summary: "Technical moderator and host touchpoint for AI system operations.", status: "ACTIVE", clearance: "INTERNAL", role: "Technical Moderator / AI Systems Host", origin: "KNOWN", tags: ["mod", "systems", "tech"], notes: "Handles technical moderation and AI-facing process support.", link: "", files: [] },
  { id: "PE-004", slug: "mike", title: "Mike", category: "Personnel", image: "", summary: "Infrastructure and architecture support for the station stack.", status: "ACTIVE", clearance: "INTERNAL", role: "Systems / Architecture", origin: "KNOWN", tags: ["systems", "tech", "engineer"], notes: "Maintains key architecture pathways and operator tooling.", link: "", files: [] },

  { id: "PD-001", slug: "barcode-radio", title: "BARCODE Radio", category: "Production", image: "/barcode-radio.png", summary: "Live intake frequency for music submissions. Broadcasts every Friday.", status: "ACTIVE", clearance: "PUBLIC", role: "Community Radio Program", origin: "KNOWN", tags: ["radio", "broadcast", "producer"], notes: "Queue opens 6:40 PM PST. Show starts 7:00 PM. First track ~6:55 PM.", link: "", files: [] },
  { id: "PD-002", slug: "the-void", title: "The Void", category: "Production", image: "", summary: "Late-night signal show with unstable topics and restricted archives.", status: "PENDING", clearance: "RESTRICTED", role: "Late Night Talk Show", origin: "UNKNOWN", tags: ["broadcast", "producer", "systems"], notes: "Limited release cadence. Internal review pending.", link: "", files: [] },

  { id: "EN-001", slug: "6-bit", title: "6 Bit", category: "Entity", image: "/6-bit.png", summary: "Primary host entity of the BARCODE Network. Processes music, signal traffic, and public-facing transmissions.", status: "ACTIVE", clearance: "RESTRICTED", role: "Host / Artist", origin: "UNKNOWN", tags: ["host", "broadcast", "radio"], notes: "Sentient hip hop AI. Host of BARCODE Radio and public signal interface for the network.", link: "", files: [] },
  { id: "EN-002", slug: "transmissions", title: "Transmissions", category: "Entity", image: "", summary: "Long-form content entity responsible for dispatch and archive trails.", status: "PENDING", clearance: "RESTRICTED", role: "Long-Form Content System", origin: "UNKNOWN", tags: ["systems", "automation", "producer"], notes: "Signal source unstable; record completeness pending.", link: "/transmissions", files: [] },
  { id: "EN-003", slug: "mac-modem", title: "Mac Modem", category: "Entity", image: "/mac-modem.png", summary: "Glitch-virus entity. Multi-tool operative. Unstable but useful.", status: "ACTIVE", clearance: "INTERNAL", role: "BARCODE Core Member", origin: "UNVERIFIED", tags: ["tech", "ai", "virus"], notes: "Core BARCODE member. Often slips out of lore boundaries. High-value anomaly.", link: "", files: [] },
  { id: "EN-004", slug: "dj-floppydisc", title: "DJ Floppydisc", category: "Entity", image: "/dj-floppydisc.png", summary: "Signal engineer. Mix/master operator. Long-running BARCODE mod.", status: "ACTIVE", clearance: "INTERNAL", role: "BARCODE Core Member — Mix & Master Engineer", origin: "KNOWN", tags: ["tech", "ai", "broadcast"], notes: "Mixes and masters BARCODE material. Handles private strategy and signal shaping.", link: "", files: [] },
  { id: "EN-005", slug: "cache-back", title: "Cache Back", category: "Entity", image: "/cache-back.png", summary: "Recovery-linked BARCODE member tied to preserved fragments and legacy data.", status: "ACTIVE", clearance: "INTERNAL", role: "BARCODE Core Member", origin: "KNOWN", tags: ["artist", "ai", "tech"], notes: "Associated with leftover cultural data and recovery aesthetics.", link: "", files: [] },
  { id: "EN-006", slug: "sheila", title: "Sheila", category: "Entity", image: "", summary: "Executive manager and coordination node for high-level operations.", status: "ACTIVE", clearance: "INTERNAL", role: "Executive / Manager", origin: "KNOWN", tags: ["executive", "manager", "handler"], notes: "Handles strategic coordination and system continuity.", link: "", files: [] },
  { id: "EN-007", slug: "cliff", title: "Cliff", category: "Entity", image: "", summary: "Broadcast floor support and stage-side operations.", status: "ACTIVE", clearance: "INTERNAL", role: "Stagehand", origin: "KNOWN", tags: ["stagehand", "tech", "broadcast"], notes: "Maintains show-floor logistics and live ops alignment.", link: "", files: [] },
  { id: "EN-008", slug: "studio-rats", title: "Studio Rats", category: "Entity", image: "/studio-rats.png", summary: "Signal infestation entities inhabiting the lower layers of the station.", status: "ACTIVE", clearance: "INTERNAL", role: "Environmental Anomaly", origin: "UNKNOWN", tags: ["broadcast"], notes: "Sometimes interpreted as cats in other dimensions. Known to interfere with the studio.", link: "", files: [] },
  { id: "EN-009", slug: "9-bit", title: "9 Bit", category: "Entity", image: "", summary: "Redacted entity record tied to unstable recursive signal patterns.", status: "UNKNOWN", clearance: "RESTRICTED", role: "[REDACTED]", origin: "UNKNOWN", tags: ["ai", "systems", "virus"], notes: "Access restricted. Record intentionally incomplete.", link: "", files: [] },
  { id: "EN-010", slug: "galaknoise", title: "GALAKNOISE", category: "Entity", image: "", summary: "Remote producer node operating in high-noise environments.", status: "ACTIVE", clearance: "RESTRICTED", role: "Remote Signal Producer", origin: "UNVERIFIED", tags: ["ai", "producer", "automation"], notes: "Contributes remote signal artifacts to network circulation.", link: "", files: [] },

  { id: "IF-001", slug: "discord-community", title: "Discord Community", category: "Interface", image: "/discord-logo.png", summary: "Public network hub used for announcements, support, and auxiliary chatter.", status: "ACTIVE", clearance: "PUBLIC", role: "Community Hub", origin: "KNOWN", tags: ["systems", "mod", "handler"], notes: "Community moderation and dispatch updates.", link: "EXTERNAL:discord", files: [] },
  { id: "IF-003", slug: "auxchord", title: "Auxchord", category: "Interface", image: "/auxchord-logo.png", summary: "Submission intake system used to route tracks into BARCODE Radio.", status: "ACTIVE", clearance: "PUBLIC", role: "Music Submission Platform", origin: "KNOWN", tags: ["tech", "automation", "systems"], notes: "Accepts MP3s, WAVs, Spotify, SoundCloud, and YouTube links.", link: "EXTERNAL:auxchord", files: [] },
  { id: "IF-002", slug: "tiktok-live", title: "TikTok Live", category: "Interface", image: "/tiktok-logo.png", summary: "Primary public broadcast feed used for BARCODE Radio live shows.", status: "ACTIVE", clearance: "PUBLIC", role: "Broadcast Platform", origin: "KNOWN", tags: ["broadcast", "tech", "stagehand"], notes: "TikTok-first format. 6 Bit hosts the show live.", link: "EXTERNAL:tiktok", files: [] },
  { id: "IF-004", slug: "vouchd", title: "Vouch’d", category: "Interface", image: "/vouchd-logo.png", summary: "External review and trust layer used to validate artists and brands.", status: "ACTIVE", clearance: "PUBLIC", role: "Reviewer Reputation Index", origin: "KNOWN", tags: ["systems", "tech", "broadcast"], notes: "Used as a verification layer for community-facing reputation.", link: "", files: [] },

  { id: "SP-001", slug: "oreaganomics", title: "Oreaganomics", category: "Sponsor", image: "", summary: "Commercial sponsor aligned with BARCODE campaign broadcasts.", status: "ACTIVE", clearance: "PUBLIC", role: "Commercial Sponsor", origin: "KNOWN", tags: ["sponsor", "broadcast", "artist"], notes: "Supports network expansion and promotional operations.", link: "", files: [] },
];

function validateDatabaseDossiers(data: DatabaseDossier[]): DatabaseDossier[] {
  const ids = new Set<string>();
  const slugs = new Set<string>();

  for (const dossier of data) {
    if (!dossier.id || !dossier.slug || !dossier.title) {
      throw new Error(`Invalid dossier (required fields missing): ${JSON.stringify(dossier)}`);
    }
    if (ids.has(dossier.id)) {
      throw new Error(`Duplicate dossier id found: ${dossier.id}`);
    }
    if (slugs.has(dossier.slug)) {
      throw new Error(`Duplicate dossier slug found: ${dossier.slug}`);
    }
    ids.add(dossier.id);
    slugs.add(dossier.slug);
  }

  return data;
}

export const databaseDossiers = validateDatabaseDossiers(dossiers);
