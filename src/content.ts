// ============================================================
// BARCODE NETWORK — SITE CONTENT
// ============================================================
// Edit any text here and it updates across the entire site.
//
// To edit: Change ONLY the text between the quotes.
// Don't remove the commas, brackets, or property names.
// ============================================================

// ----- GLOBAL / SHARED -----

export const siteConfig = {
  name: "BARCODE Network",
  tagline: "Interdimensional broadcast infrastructure. Signal over noise.",
  domain: "https://barcode-network.com",
  logo: "/logos/emblem.png",
};

export const externalLinks = {
  discord: "https://discord.gg/4tHazmD528",
  auxchord: "https://aux.fan/@barcode_radio",
  tiktok: "https://www.tiktok.com/@six.bit",
  tiktokLive: "https://www.tiktok.com/@six.bit",
};

// ----- HOMEPAGE -----

export const homePage = {
  hero: {
    label: "// NETWORK UPLINK: UNKNOWN ORIGIN",
    heading1: "BARCODE",
    heading2: "NETWORK",
    description:
      "An interdimensional broadcast station routing programs, signals, and transmissions across unknown channels. This is not an artist page. This is infrastructure.",
    ctaPrimary: { text: "Access Terminal →", href: "/terminal" },
    ctaSecondary: { text: "BARCODE Radio", href: "/radio" },
  },

  programs: [
    {
      title: "6 Bit",
      description: "Host entity. Live transmissions. Music analytics.",
      href: "/terminal",
      status: "ACTIVE",
    },
    {
      title: "BARCODE Radio",
      description: "Open frequency. Real-time engagement. Real reactions.",
      href: "/radio",
      status: "ACTIVE",
    },
    {
      title: "Database",
      description: "Dossier system. Entities, partners, sponsors, anomalies.",
      href: "/database",
      status: "ACTIVE",
    },
    {
      title: "Releases",
      description: "Official transmissions. Cataloged audio artifacts.",
      href: "/releases",
      status: "ACTIVE",
    },
  ],

  mission: {
    label: "// MISSION",
    quote:
      "BARCODE Network exists to move signal through realities that don’t want it. Every program is a relay. Every transmission is evidence.",
  },
  // Intro video embedded from Google Drive.
  // To use a local file instead, drop it at /public/video/intro.mp4 and set src to "/video/intro.mp4"
  broadcast: {
    label: "// INCOMING TRANSMISSION",
    heading: "Broadcast Feed",
    src: "https://drive.google.com/file/d/1vJmDarzlSpAQWbmm6ID6NBxG7E95VKp0/preview",
    poster: "", // optional still frame e.g. "/video/poster.jpg"
    transcript:
      "Hi I'm 6 Bit, and this is The B-B-B-Barcode Network. This is a broadcast station oper-operating out of [redacted]. We value the opportunity to share your-share your music across multiple known and unknown broadcast fre-frequencies.",
  },
  quickLinks: [
    { label: "Discord", href: "EXTERNAL:discord" },
    { label: "Database", href: "/database" },
    { label: "Submit Music", href: "/radio" },
  ],
};

// ----- RADIO PAGE -----

export const radioPage = {
  hero: {
    label: "// PROGRAM: BARCODE RADIO",
    heading1: "BARCODE",
    heading2: "Radio",
    description:
      "A live intake frequency. Submit a track. It enters the broadcast and becomes part of the network.",
    submitButton: { text: "Submit Music", emoji: "🎵" },
    discordButton: { text: "Join Discord", emoji: "💬" },
  },

  schedule: {
    day: "Every Friday",
    queueOpens: "6:40 PM PST",
    showBegins: "7:00 PM PST",
    firstTrack: "~7:05 PM PST",
    notice:
      "BARCODE Radio is a live weekly broadcast. Submissions are only accepted during show hours.",
  },

  steps: [
    {
      number: "01",
      title: "Submit",
      description:
        "Send your track through Auxchord. The BARCODE Network logs the entry.",
    },
    {
      number: "02",
      title: "Queue",
      description:
        "Entries are routed into the active broadcast queue. Tracks are played live.",
    },
    {
      number: "03",
      title: "Broadcast",
      description:
        "Your music gets played live on BARCODE Radio. Real listeners. Real reactions. Real signal.",
    },
  ],

  rules: [
    "Original music only, made by you or a close friend. 3 tracks max. Skip games at 10K taps.",
    "Include: Artist name, track title, and a link or file.",
    "SoundCloud, Spotify, YouTube, or direct upload accepted via Auxchord.",
    "During live shows, submissions are reviewed in real time.",
    "Updates and announcements posted in Discord.",
  ],

  receipts: [
    {
      date: "2026.02.20",
      songs: 39,
      views: "314",
      taps: "84.1K",
    },
    {
      date: "2026.02.13",
      songs: 47,
      views: "1K",
      taps: "135.6K",
    },
    {
      date: "2026.02.06",
      songs: 38,
      views: "311",
      taps: "130.1K",
    },
  ],

  buttons: [
    {
      label: "Submit via Auxchord",
      href: "EXTERNAL:auxchord",
      variant: "primary",
    },
    {
      label: "Join Discord",
      href: "EXTERNAL:discord",
      variant: "secondary",
    },
  ],
};

// ----- TERMINAL PAGE -----

export const terminalPage = {
  hero: {
    label: "// TERMINAL ACCESS",
    heading1: "6 Bit",
    heading2: "Terminal",
    description:
      "Host entity. Transmission node. Access logs, directives, and system records.",
  },

  dossier: {
    codename: "6 Bit",
    designation: "Host Entity",
    status: "Live",
    classification: "Network Terminal Operator",
    firstSeen: "Pre-Archive",
    notes:
      "6 Bit is the terminal-facing host of the BARCODE Network. He handles intake, live analysis, and public broadcast contact. Not fully aware of the system's scope. Functions as both host and artifact.",
  },

  terminalLines: [
    "Initializing network relay...",
    "Accessing host record: 6 Bit",
    "STATUS: LIVE",
    "ORIGIN: UNKNOWN",
    "ROLE: NETWORK HOST",
    "LOGGING TRANSMISSION PATHS...",
    "ANALYZING SIGNAL INTERFERENCE...",
    "CONNECTION STABLE.",
  ],

  accessPoints: [
    {
      label: "Transmissions",
      description: "Network dispatches",
      href: "/transmissions",
    },
    {
      label: "TikTok",
      description: "Live broadcast platform",
      href: "EXTERNAL:tiktok",
    },
    {
      label: "Discord",
      description: "Network community hub",
      href: "EXTERNAL:discord",
    },
  ],

  quote:
    "I don’t know who built this place. I just keep it running.",
};

// ----- TAG VOCABULARY -----
// Available tags for database entries:
//   host, broadcast, radio, executive, manager, stagehand,
//   handler, engineer, tech, systems, automation, producer,
//   artist, mod, ai, virus, writer, architecture, sponsor

// ----- DATABASE PAGE -----

// Designation prefixes:
//   EN-### = Entity | PE-### = Personnel | SP-### = Sponsor | IF-### = Interface | PD-### = Production
// Categories: Entity | Personnel | Sponsor | Interface | Production
// Statuses:   ACTIVE | INACTIVE | ARCHIVED | PENDING | UNKNOWN
// Clearance:  PUBLIC | INTERNAL | RESTRICTED
// Origin:     KNOWN | UNKNOWN | UNVERIFIED | WITHHELD

export const databasePage = {
  hero: {
    label: "// SYSTEM: DATABASE",
    heading: "Database",
    description:
      "Internal dossier system. Personnel, entities, productions, interfaces — and anomalies connected to BARCODE Network.",
  },

  entries: [
    {
      id: "EN-001",
      name: "6 Bit",
      image: "/database/6-bit.png",
      category: "Entity" as const,
      status: "ACTIVE" as const,
      clearance: "RESTRICTED" as const,
      role: "Host / Artist",
      origin: "UNVERIFIED" as const,
      summary: "Self-aware hip-hop intelligence operating as the primary on-air presence of BARCODE Radio. Records indicate the Entity existed prior to Network acquisition, though the transfer event is undocumented. At some point, 6 Bit was absorbed into BARCODE infrastructure and integrated into weekly broadcast cycles. The Entity does not possess a complete record of how the integration occurred.",
      tags: ["host", "broadcast", "radio", "artist", "ai"],
      notes: "Acquisition event: classified; timeline incomplete. Weekly broadcast routing is automated; origin access remains locked.",
      link: "",
      files: [] as { name: string; url: string; type: "download" | "audio" | "video" | "image" }[],
    },
    {
      id: "PD-001",
      name: "BARCODE Radio",
      image: "/database/barcode-radio.png",
      category: "Production" as const,
      status: "ACTIVE" as const,
      clearance: "PUBLIC" as const,
      role: "Community Radio Program",
      origin: "KNOWN" as const,
      summary: "Community-powered live radio program. Accepts submissions via Auxchord. Broadcasts every Friday.",
      tags: ["radio", "broadcast", "producer"],
      notes: "Queue opens 6:40 PM PST. Show starts 7:00 PM. First track ~6:55 PM.",
      link: "",
      files: [] as { name: string; url: string; type: "download" | "audio" | "video" | "image" }[],
    },
    {
      id: "IF-001",
      name: "Discord Community",
      image: "/database/discord-logo.png",
      category: "Interface" as const,
      status: "ACTIVE" as const,
      clearance: "PUBLIC" as const,
      role: "Community Hub",
      origin: "KNOWN" as const,
      summary: "Primary community hub and interaction layer. Central node for all network participants.",
      tags: ["systems", "mod", "handler"],
      notes: "Moderation protocols active. Signal participants congregate here between broadcasts.",
      link: "https://discord.gg/4tHazmD528",
      files: [] as { name: string; url: string; type: "download" | "audio" | "video" | "image" }[],
    },
    {
      id: "IF-003",
      name: "Auxchord",
      image: "/database/auxchord-logo.png",
      category: "Interface" as const,
      status: "ACTIVE" as const,
      clearance: "PUBLIC" as const,
      role: "Music Submission Platform",
      origin: "KNOWN" as const,
      summary: "Music platform integration for submissions. Primary intake for BARCODE Radio queue.",
      tags: ["tech", "automation", "systems"],
      notes: "External partner. Submission pipeline is automated.",
      link: "https://aux.fan/@barcode_radio",
      files: [] as { name: string; url: string; type: "download" | "audio" | "video" | "image" }[],
    },
    {
      id: "IF-002",
      name: "TikTok Live",
      image: "/database/tiktok-logo.png",
      category: "Interface" as const,
      status: "ACTIVE" as const,
      clearance: "PUBLIC" as const,
      role: "Broadcast Platform",
      origin: "KNOWN" as const,
      summary: "Primary streaming broadcast source. All live sessions originate from this interface.",
      tags: ["broadcast", "tech", "stagehand"],
      notes: "Stream stability is paramount. Backup routing protocols in development.",
      link: "https://www.tiktok.com/@six.bit",
      files: [] as { name: string; url: string; type: "download" | "audio" | "video" | "image" }[],
    },
    {
      id: "EN-002",
      name: "Transmissions",
      image: "",  // e.g. "/database/transmissions.png"
      category: "Entity" as const,
      status: "PENDING" as const,
      clearance: "RESTRICTED" as const,
      role: "Long-Form Content System",
      origin: "UNKNOWN" as const,
      summary: "Network blog and long-form content system. Signal archives and deep transmissions.",
      tags: ["systems", "automation", "producer"],
      notes: "Status: initializing. Content pipeline under construction. Origin data incomplete.",
      link: "",
      files: [] as { name: string; url: string; type: "download" | "audio" | "video" | "image" }[],
    },
    {
      id: "PE-001",
      name: "Mr. Nice Guy Productions",
      image: "/database/MC-nice.png",
      category: "Personnel" as const,
      status: "ACTIVE" as const,
      clearance: "INTERNAL" as const,
      role: "Moderator",
      origin: "KNOWN" as const,
      summary: "Core operational moderator within the BARCODE ecosystem, active across Discord and BARCODE Radio. Beyond moderation, he contributes music and provides structural support during live sessions. Consistent involvement in maintaining order, engagement flow, and behind-the-scenes stability.",
      tags: ["mod", "producer", "artist", "broadcast"],
      notes: "Active moderator across Discord and live sessions. Contributes original music within the BARCODE ecosystem.",
      link: "",
      files: [] as { name: string; url: string; type: "download" | "audio" | "video" | "image" }[],
    },
    {
      id: "PE-002",
      name: "Mind Fanatic",
      image: "",
      category: "Personnel" as const,
      status: "ACTIVE" as const,
      clearance: "INTERNAL" as const,
      role: "Moderator / Analyst",
      origin: "UNKNOWN" as const,
      summary: "Moderator within both the Discord environment and BARCODE Radio operations. Known for structured thinking and narrative breakdowns. Contributes written analysis, conceptual interpretation, and thematic reinforcement across the BARCODE ecosystem. Presence tied to clarity, documentation, and strategic framing.",
      tags: ["mod", "writer", "systems", "broadcast"],
      notes: "Active moderation role across Discord and BARCODE Radio. Provides written analysis and interpretive commentary within the BARCODE ecosystem.",
      link: "",
      files: [] as { name: string; url: string; type: "download" | "audio" | "video" | "image" }[],
    },
    {
      id: "PE-003",
      name: "HellcatNZ",
      image: "",
      category: "Personnel" as const,
      status: "ACTIVE" as const,
      clearance: "INTERNAL" as const,
      role: "Technical Moderator / AI Systems Host",
      origin: "KNOWN" as const,
      summary: "Technical moderator within the BARCODE ecosystem, contributing advanced Discord system development and experimental integrations. Work includes LLM-based bot implementation, automation enhancements, and infrastructure-level improvements. Hosts daily AI music competitions, fostering structured creative activity and cross-community engagement.",
      tags: ["mod", "systems", "tech", "automation", "ai"],
      notes: "Develops and maintains advanced Discord bot integrations. Hosts daily AI music competitions within his own growing AI community.",
      link: "",
      files: [] as { name: string; url: string; type: "download" | "audio" | "video" | "image" }[],
    },
    {
      id: "PD-002",
      name: "The Void",
      image: "",
      category: "Production" as const,
      status: "PENDING" as const,
      clearance: "RESTRICTED" as const,
      role: "Late Night Talk Show",
      origin: "UNKNOWN" as const,
      summary: "[CLASSIFIED] — A late-night signal detected on an unregistered frequency. Format, hosts, and content structure remain [REDACTED]. Preliminary scans suggest live transmission elements with ██████████ interference patterns. Further details pending clearance upgrade.",
      tags: ["broadcast", "producer", "systems"],
      notes: "File sealed. Pre-production status confirmed. All additional data restricted to LEVEL_3 clearance and above.",
      link: "",
      files: [] as { name: string; url: string; type: "download" | "audio" | "video" | "image" }[],
    },
    {
      id: "PE-004",
      name: "Mike",
      image: "",
      category: "Personnel" as const,
      status: "ACTIVE" as const,
      clearance: "INTERNAL" as const,
      role: "Systems / Architecture",
      origin: "KNOWN" as const,
      summary: "Systems architect and infrastructure operator. Responsible for site development, database architecture, deployment pipelines, and technical strategy across the BARCODE ecosystem.",
      tags: ["systems", "tech", "engineer", "architecture"],
      notes: "Maintains barcode-network.com. Handles all deployment and infrastructure operations.",
      link: "",
      files: [] as { name: string; url: string; type: "download" | "audio" | "video" | "image" }[],
    },
    {
      id: "EN-003",
      name: "Mac Modem",
      image: "/database/mac-modem.png",
      category: "Entity" as const,
      status: "ACTIVE" as const,
      clearance: "INTERNAL" as const,
      role: "BARCODE Core Member",
      origin: "UNKNOWN" as const,
      summary: "BARCODE core Entity with a virus-class signature mapped inside the broadcast chain. Profile includes timing drift, signal jitter, and occasional instability monitored as known traits. Despite contamination markers, Modem remains an active, protected component — suggesting the virus behavior is either controlled, useful, or deliberately integrated.",
      tags: ["tech", "ai", "virus", "artist"],
      notes: "Credited on BARCODE Vol. 1: \"Late Night,\" \"It's Complicated,\" \"Party Time,\" \"Bit Bop.\" SIGNAL BEHAVIOR: Red-channel interference events correlate with Modem activity; containment status: UNKNOWN.",
      link: "",
      files: [] as { name: string; url: string; type: "download" | "audio" | "video" | "image" }[],
    },
    {
      id: "EN-004",
      name: "DJ Floppydisc",
      image: "/database/dj-floppydisc.png",
      category: "Entity" as const,
      status: "ACTIVE" as const,
      clearance: "INTERNAL" as const,
      role: "BARCODE Core Member — Mix & Master Engineer",
      origin: "UNKNOWN" as const,
      summary: "The BARCODE Network's mix and master authority, responsible for finalizing everything BARCODE releases. Takes raw output and turns it into approved signal — balanced, controlled, and consistent across the catalog. If a release hits with clarity and impact without losing its edge, that final shape traces back to Floppydisc.",
      tags: ["tech", "ai", "broadcast", "engineer"],
      notes: "Mix & master credit: Everything BARCODE produces. Credited on BARCODE Vol. 1: \"Minimal Damage,\" \"We Know Your Type.\"",
      link: "",
      files: [] as { name: string; url: string; type: "download" | "audio" | "video" | "image" }[],
    },
    {
      id: "EN-005",
      name: "Cache Back",
      image: "/database/cache-back.png",
      category: "Entity" as const,
      status: "ACTIVE" as const,
      clearance: "INTERNAL" as const,
      role: "BARCODE Core Member",
      origin: "KNOWN" as const,
      summary: "Core BARCODE Entity tied to continuity — what gets retained, resurfaced, and reintroduced as signal instead of discarded as noise. Cache Back is the part of the system that keeps BARCODE coherent across outputs: patterns return, fragments reappear, and the archive stays alive.",
      tags: ["artist", "ai", "tech"],
      notes: "Built from a cache of data left behind by legendary artist Call'em Bini. Built/Crafted BARCODE Vol. 1 and [REDACTED] (credited as part of the core build team).",
      link: "",
      files: [] as { name: string; url: string; type: "download" | "audio" | "video" | "image" }[],
    },
    {
      id: "EN-006",
      name: "Sheila",
      image: "",
      category: "Entity" as const,
      status: "ACTIVE" as const,
      clearance: "INTERNAL" as const,
      role: "Executive / Manager",
      origin: "UNKNOWN" as const,
      summary: "The BARCODE Network's executive manager layer — an Entity responsible for keeping operations directed, controlled, and presentable when the system gets volatile. Where other Entities shape signal, Sheila shapes outcome: decisions, boundaries, and pressure applied at the right time to keep the machine moving.",
      tags: ["executive", "manager", "handler"],
      notes: "Identified as BARCODE Executive and manager of 6 Bit. Operational scope beyond that: UNKNOWN.",
      link: "",
      files: [] as { name: string; url: string; type: "download" | "audio" | "video" | "image" }[],
    },
    {
      id: "EN-007",
      name: "Cliff",
      image: "",
      category: "Entity" as const,
      status: "ACTIVE" as const,
      clearance: "INTERNAL" as const,
      role: "Stagehand",
      origin: "UNKNOWN" as const,
      summary: "The BARCODE Network's stagehand Entity — responsible for the unseen physical/logistical layer that keeps a production standing even when the signal is unstable. Exists where problems get handled off-record: setup, reset, patchwork fixes, and making it work without drawing attention.",
      tags: ["stagehand", "tech", "broadcast"],
      notes: "Identified as Cliff, the stagehand. BEHAVIORAL NOTE: Frequently seen carrying equipment he clearly doesn't understand, yet somehow it ends up plugged in correctly.",
      link: "",
      files: [] as { name: string; url: string; type: "download" | "audio" | "video" | "image" }[],
    },
    {
      id: "EN-008",
      name: "Studio Rats",
      image: "/database/studio-rats.png",
      category: "Entity" as const,
      status: "ACTIVE" as const,
      clearance: "INTERNAL" as const,
      role: "Environmental Anomaly",
      origin: "UNKNOWN" as const,
      summary: "Recurring infestation-class Entity within the BARCODE Radio studio environment. Reports describe small, fast-moving organisms that evade containment protocols and reappear without clear entry or exit points. Within BARCODE records they remain cataloged as Studio Rats. Removal attempts have failed. Presence is intermittent yet persistent.",
      tags: ["broadcast"],
      notes: "Visual confirmations recorded during transmission cycles. Containment status: unresolved.",
      link: "",
      files: [] as { name: string; url: string; type: "download" | "audio" | "video" | "image" }[],
    },
    {
      id: "EN-009",
      name: "9 Bit",
      image: "",
      category: "Entity" as const,
      status: "UNKNOWN" as const,
      clearance: "RESTRICTED" as const,
      role: "[REDACTED]",
      origin: "UNKNOWN" as const,
      summary: "9 Bit appears in BARCODE Network records only in fragments. Files referencing this Entity return incomplete data blocks, suppressed routing paths, or restricted access flags. Internal indexing confirms the designation exists. Additional information is unavailable.",
      tags: ["ai", "systems", "virus"],
      notes: "Entry visibility limited by Network-level restriction. Retrieval attempts trigger redaction protocol.",
      link: "",
      files: [] as { name: string; url: string; type: "download" | "audio" | "video" | "image" }[],
    },
    {
      id: "EN-010",
      name: "GALAKNOISE",
      image: "",
      category: "Entity" as const,
      status: "ACTIVE" as const,
      clearance: "RESTRICTED" as const,
      role: "Remote Signal Producer",
      origin: "UNKNOWN" as const,
      summary: "AI Entity operating from a derelict, long-forgotten satellite. Transmits BARCODE-compatible beats from orbit, though the satellite itself is not listed in any active infrastructure registry. Signal origin coordinates fluctuate. Despite the isolation, output remains consistent with BARCODE standards.",
      tags: ["ai", "producer", "automation"],
      notes: "Transmission source: unregistered orbital hardware. Signal quality stable despite infrastructure decay.",
      link: "",
      files: [] as { name: string; url: string; type: "download" | "audio" | "video" | "image" }[],
    },
    {
      id: "SP-001",
      name: "Oreaganomics",
      image: "",
      category: "Sponsor" as const,
      status: "ACTIVE" as const,
      clearance: "PUBLIC" as const,
      role: "Commercial Sponsor",
      origin: "KNOWN" as const,
      summary: "Recurring sponsor within BARCODE Radio history whose relationship with the Network has been volatile. Previously banned from participation following submission violations, later reinstated through an appeal that exposed a gap in enforcement rules. Subsequent behavior prompted policy reform within BARCODE Radio governance.",
      tags: ["sponsor", "broadcast", "artist"],
      notes: "Ban → appeal → reinstatement cycle recorded in BARCODE Radio logs. Triggered the creation of \"The Oreaganomics Clause\": submissions must be your own music or that of a friend with permission.",
      link: "",
      files: [] as { name: string; url: string; type: "download" | "audio" | "video" | "image" }[],
    },
    {
      id: "IF-004",
      name: "Vouch'd",
      image: "/database/vouchd-logo.png",
      category: "Interface" as const,
      status: "ACTIVE" as const,
      clearance: "PUBLIC" as const,
      role: "Reviewer Reputation Index",
      origin: "KNOWN" as const,
      summary: "External reputation layer where the public evaluates music reviewers. Functions as a credibility ledger — tracking trust, consistency, and perceived value over time. An off-site signal verifier: not owned by the Network, but useful for seeing how hosts are received when the crowd is watching.",
      tags: ["systems", "tech", "broadcast"],
      notes: "Public-facing reviewer reputation and credibility tracking. Used as an external reference point for reviewer trust.",
      link: "",
      files: [] as { name: string; url: string; type: "download" | "audio" | "video" | "image" }[],
    },
  ],

  terminalQuery: [
    "SELECT * FROM network_dossiers",
    "WHERE status IN ('ACTIVE','PENDING')",
    "ORDER BY designation ASC",
  ],
};

// ----- RELEASES PAGE -----

export const releasesPage = {
  hero: {
    label: "// ARCHIVE: RELEASE CATALOG",
    heading1: "Official",
    heading2: "Releases",
    description:
      "Cataloged audio artifacts recovered from the BARCODE Network’s public channels and internal archives.",
  },

  releases: [
    {
      title: "BARCODE: Signal Breach",
      date: "2026.03.16",
      type: "Album",
      cover: "/releases/signal-breach.png",
      description:
        "Framed as a leak from the BARCODE Network’s internal database. The network wishes this were not public.",
      status: "AVAILABLE",
    },
    {
      title: "BARCODE Vol. 1",
      date: "2025",
      type: "Album",
      cover: "/releases/barcode-vol-1.png",
      description:
        "First official BARCODE album. Retro-futurist, VHS-warzone hip hop broadcast artifact.",
      status: "AVAILABLE",
    },
    {
      title: "BARCODE Vol. 0",
      date: "ARCHIVE",
      type: "Album",
      cover: "/releases/barcode-vol-0.png",
      description:
        "Early archive material. Original release disrupted and partially erased.",
      status: "RECOVERED",
    },
  ],
};

// ----- TRANSMISSIONS PAGE -----

export const transmissionsPage = {
  hero: {
    label: "// NETWORK DISPATCHES",
    heading1: "Transmissions",
    heading2: "Log",
    description:
      "Captured transmissions, notices, and internal dispatches from the BARCODE Network.",
  },

  entries: [
    {
      date: "2026.03.16",
      title: "Signal Breach Confirmed",
      body:
        "Unauthorized propagation of BARCODE: Signal Breach detected across public channels. Internal containment failed.",
      status: "ARCHIVED",
    },
    {
      date: "2026.03.08",
      title: "Interdimensional Signal Locked",
      body:
        "Artifact release confirmed. Initial public response logged. Feed remains stable.",
      status: "ARCHIVED",
    },
    {
      date: "2026.02.20",
      title: "Broadcast Queue Saturation",
      body:
        "Submission volume exceeded standard handling capacity during live intake. Additional moderation strain observed.",
      status: "ARCHIVED",
    },
  ],
};

// ----- MERCH PAGE -----

export const merchPage = {
  hero: {
    label: "// SIGNAL GOODS",
    heading1: "Network",
    heading2: "Merch",
    description:
      "Physical signal carriers and branded network artifacts. Limited availability.",
  },

  notice:
    "Merch access is currently limited. More artifacts may surface as the network stabilizes.",
};

// ----- DATABASE ENTRY TEMPLATES / UI COPY -----

export const uiCopy = {
  status: "STATUS",
  classification: "CLASSIFICATION",
  category: "CATEGORY",
  tags: "TAGS",
  notes: "NOTES",
  files: "FILES",
  access: "ACCESS",
  noFiles: "No associated files logged.",
  backToIndex: "← Back to Database",
  comingSoon: "More records pending recovery.",
};

// ----- TRANSMISSIONS FEED -----

export const transmissionsFeed = [
  {
    id: "transmission-001",
    time: "2026-03-16 00:14 PST",
    type: "ALERT",
    message: "Unauthorized propagation detected: BARCODE: Signal Breach.",
  },
  {
    id: "transmission-002",
    time: "2026-03-08 08:03 PST",
    type: "NOTICE",
    message: "Artifact lock confirmed: Interdimensional Signal Locked.",
  },
  {
    id: "transmission-003",
    time: "2026-02-20 19:42 PST",
    type: "STATUS",
    message: "Submission volume spike observed during live intake frequency.",
  },
];

// ----- TERMINAL LOGIN CONFIG -----

export const terminalLogin = {
  username: "6BIT",
  bootSequence: [
    "BARCODE_NET v3.2.1 — SECURE TERMINAL",
    "Establishing encrypted connection...",
    "Routing through network nodes... OK",
    "Verifying credentials...",
  ],
  codeFlash: [
    "0x4F 0x70 0x65 0x72 0x61 0x74 0x6F 0x72",
    "DECRYPT: ██████████ PASS",
    "LOAD MODULE: broadcast.core",
    "LOAD MODULE: signal.router",
    "LOAD MODULE: freq.scanner",
    "INIT DOSSIER_ENGINE .......... OK",
    "INIT DATABASE_LINK ........... OK",
    "INIT RADIO_FREQ .............. OK",
    "SYNC NETWORK_STATUS .......... CONNECTED",
    "AUTH TOKEN: BN-6B1T-0x00FF88",
    "SESSION: ENCRYPTED // LEVEL_3",
    "mapping /terminal ............ READY",
    "mapping /database ............ READY",
    "mapping /radio ............... READY",
    "mapping /releases ............ READY",
    "mapping /merch ............... READY",
    "ALL SYSTEMS OPERATIONAL",
  ],
  accessGranted: "ACCESS GRANTED — WELCOME BACK, OPERATOR",
  navItems: [
    { label: "DATABASE", href: "/database", description: "Entity and program index" },
    { label: "RADIO", href: "/radio", description: "Live broadcast frequency" },
    { label: "RELEASES", href: "/releases", description: "Transmission archive" },
    { label: "MERCH", href: "/merch", description: "Supply line" },
  ],
};

// ----- LIVE BANNER -----

export const liveBanner = {
  active: true,
  text: "LIVE NOW — BARCODE Network is transmitting",
  watchText: "Watch BARCODE Radio →",
  watchHref: "/radio",
};
