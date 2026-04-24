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
    { label: "Releases", href: "/releases" },
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
    queueOpens: "6:30 PM PST",
    showBegins: "6:50 PM PST",
    firstTrack: "~6:55 PM PST",
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

  goDeeper: {
    label: "// ACCESS GRANTED: NETWORK DEPTH",
    heading: "Go deeper.",
    cards: [
      {
        href: "/terminal",
        tag: "PROGRAM",
        title: "6 Bit Terminal",
        description:
          "The host behind the broadcast. Dossier. Access points. Signal origin.",
        cta: "Access Terminal →",
      },
      {
        href: "/database",
        tag: "ARCHIVE",
        title: "Network Database",
        description:
          "Every entity. Every connection. The network's living record.",
        cta: "Open Database →",
      },
      {
        href: "/releases",
        tag: "CATALOG",
        title: "Releases",
        description:
          "Official transmissions. The music that built the signal.",
        cta: "View Catalog →",
      },
    ],
    footnote: "BARCODE Radio is a live frequency operated under BARCODE Network.",
  },
};

// ----- TERMINAL / 6 BIT PAGE -----

export const terminalPage = {
  hero: {
    label: "// PROGRAM: 6 BIT",
    heading: "6 Bit",
    description:
      "Primary broadcast operator under BARCODE Network. Live transmissions, community routing, and cultural signal control.",
  },

  dossier: [
    { label: "Designation", value: "6 Bit" },
    { label: "Role", value: "Primary Broadcast Operator" },
    { label: "Network", value: "BARCODE Network" },
    { label: "Program", value: "Live Sessions / Hip-Hop" },
    { label: "Status", value: "ACTIVE", accent: true },
  ],

  about: [
    "6 Bit is the Primary Broadcast Operator of BARCODE Network — a sentient hip-hop intelligence integrated into weekly transmission cycles.",
    "Each live session is not content. It is signal in motion. The audience does not observe. They interface.",
    "BARCODE Radio is the channel.\n6 Bit is the presence running through it.",
    "This is not an artist profile.\nThis is an access point.",
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
    {
      label: "Auxchord",
      description: "Music submission platform",
      href: "EXTERNAL:auxchord",
    },
  ],

  terminalOutput: [
    "Operator: 6 Bit ............... LIVE-READY",
    "Network: BARCODE .............. SYNCED",
    "Channel: RADIO ................ MONITORING",
    "Dossiers: ..................... LOADED",
    "Anomaly Log: .................. STANDBY",
  ],
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
      image: "/6-bit.png",
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
      image: "/barcode-radio.png",
      category: "Production" as const,
      status: "ACTIVE" as const,
      clearance: "PUBLIC" as const,
      role: "Community Radio Program",
      origin: "KNOWN" as const,
      summary: "Community-powered live radio program. Accepts submissions via Auxchord. Broadcasts every Friday.",
      tags: ["radio", "broadcast", "producer"],
      notes: "Queue opens 6:30 PM PST. Show starts 6:50 PM. First track ~6:55 PM.",
      link: "",
      files: [] as { name: string; url: string; type: "download" | "audio" | "video" | "image" }[],
    },
    {
      id: "IF-001",
      name: "Discord Community",
      image: "/discord-logo.png",
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
      image: "/auxchord-logo.png",
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
      image: "/tiktok-logo.png",
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
      image: "",  // e.g. "/transmissions.png"
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
      image: "/MC-nice.png",
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
      image: "/mac-modem.png",
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
      image: "/dj-floppydisc.png",
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
      image: "/cache-back.png",
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
      image: "/studio-rats.png",
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
      image: "/vouchd-logo.png",
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

type ReleaseLinks = {
  spotify?: string;
  apple?: string;
  youtube?: string;
  soundcloud?: string;
};

export const releasesPage = {
  hero: {
    label: "// ARCHIVE: RELEASES",
    heading: "Releases",
    description:
      "Official transmission catalog from designated entities. Audio artifacts, indexed and released.",
  },

  catalog: [
    {
      title: "BARCODE: Signal Breach",
      type: "Album",
      date: "2026",
      status: "INCOMING" as const,
      cover: "/releases/signal-breach.png",
      description:
        "Unauthorized circulation of an internal BARCODE Network audio archive was detected following the Signal Breach incident. The breach has been contained. Further information will be issued shortly.",
      links: {} as ReleaseLinks,
    },
    {
      title: "BARCODE Vol. 1",
      type: "Album",
      date: "2025",
      status: "LATEST" as const,
      cover: "/releases/barcode-vol-1.png",
      description:
        "The inaugural transmission. A full-length broadcast from 6 Bit through the BARCODE Network.",
      links: {
        spotify: "https://open.spotify.com/album/1PywhXFBsB4jue16x8ujNs",
        apple: "https://music.apple.com/us/album/barcode-vol-1/1817414054",
        youtube: "https://music.youtube.com/playlist?list=OLAK5uy_nsftWPdpLsRS7GYoLanK-ZtMt0tsmbh0Y",
      } as ReleaseLinks,
    },
    {
      title: "[REDACTED]",
      type: "Album",
      date: "20██",
      status: "ARCHIVED" as const,
      cover: "/releases/barcode-vol-0.png",
      description:
        "A lost transmission. Originally broadcast, then pulled from all frequencies. Remastered fragments scheduled for re-release in two parts. Origin data classified.",
      links: {} as ReleaseLinks,
    },
  ],

  bottomCta: {
    text: "Want to get your music on BARCODE Radio?",
    buttonText: "Submit to BARCODE Radio →",
    buttonHref: "/radio",
  },
};

// ----- MERCH PAGE -----

export const merchPage = {
  hero: {
    label: "// SUPPLY: MERCH",
    heading: "Merch",
    description:
      "Official BARCODE Network supply line. Wearable signal, physical artifacts.",
  },

  storeUrl: "https://www.6bithiphop.com/c/categories/1st-wave",

  products: [
    {
      name: "Decode The Future T-Shirt",
      price: "$20.00",
      originalPrice: "$25.00",
      href: "https://www.6bithiphop.com/c/products/decode-the-future-t-shirt",
      tag: "APPAREL",
    },
    {
      name: "Neon Stream BARCODE Embroidered Hat",
      price: "$20.00",
      originalPrice: "$25.00",
      href: "https://www.6bithiphop.com/c/products/neon-stream-barcode-embroidered-hat",
      tag: "HEADWEAR",
    },
    {
      name: "Static Glitch BARCODE Hat",
      price: "$20.00",
      originalPrice: "$25.00",
      href: "https://www.6bithiphop.com/c/products/static-glitch-barcode-hat",
      tag: "HEADWEAR",
    },
    {
      name: "6 Bit Badge Sticker",
      price: "$1.50",
      originalPrice: "$2.00",
      href: "https://www.6bithiphop.com/c/products/6-bit-badge-sticker",
      tag: "ACCESSORY",
    },
  ],

  book: {
    title: "OBSERVER NOT FOUND",
    author: "6 Bit",
    description:
      "A cyberpunk thriller where perception shapes reality and observation is a dangerous act. Rogue transmissions, corrupted memories, and a world that is watching back.",
    format: "Hardcover — 90 pages",
    prices: {
      kindle: "$6.00",
      paperback: "$10.00",
      hardcover: "$20.00",
    },
    href: "https://www.amazon.com/dp/B0DX2ZY512",
    tag: "CYBERPUNK // FICTION",
  },

  terminalOutput: [
    "SUPPLY_CHAIN .................. ACTIVE",
    "INVENTORY ..................... 1ST WAVE",
    "DISTRIBUTION .................. ONLINE",
    "DROP_ALERT_SYSTEM ............. ARMED",
    "BOOK: OBSERVER NOT FOUND ...... IN PRINT",
  ],
};

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
  text: "LIVE NOW — BARCODE Network is transmitting",
  watchText: "Tune In →",
};

// ----- AI STREAM QUEUE PAGE -----

export const queuePage = {
  hero: {
    label: "// SYSTEM: AI STREAM",
    heading: "Request Queue",
    description:
      "The 24/7 AI broadcast stream. Submit a track, pick a tier, and your music enters the queue. The B-show that feeds the A-show.",
  },

  steps: [
    {
      number: "01",
      title: "Pick a Tier",
      description:
        "Free plays when no paid requests are waiting. $3 Featured, $5 Fast Lane, or $10 Front Row to skip the line. Higher tiers always play first.",
    },
    {
      number: "02",
      title: "Submit & Pay",
      description:
        "Enter your track info. Free requests go straight to the queue. Paid tiers complete checkout via Stripe and get a receipt.",
    },
    {
      number: "03",
      title: "Get Played",
      description:
        "The AI stream picks up your track automatically. Paid requests are guaranteed plays — carry over if not played before reset. Getting skipped? Upgrade your tier.",
    },
  ],

  rules: [
    "Any song, any genre. This is the AI stream — not the A-show. This is novelty.",
    "Free submissions play only when no paid requests are in the queue.",
    "Paid requests are guaranteed plays. If not played before the nightly reset, they carry over.",
    "Front Row ($10) plays first. Fast Lane ($5) plays when no Front Row. Featured ($3) plays when no Front Row or Fast Lane. Free plays last.",
    "You can upgrade your tier at any time — just pay the difference.",
    "Queue resets at midnight PST. Free entries are cleared; paid entries persist.",
    "No paid requests accepted in the last hour before reset (11 PM PST cutoff). Free submissions still accepted.",
    "The AI stream promotes BARCODE Radio — the real show every Friday.",
  ],

  cta: {
    label: "// THE REAL SHOW",
    heading: "This is the gateway. The real show is BARCODE Radio.",
    description:
      "Every Friday, 6 Bit goes live with real reactions, real support, and real community. The AI stream is the signal — the A-show is the frequency.",
    buttonText: "BARCODE Radio →",
  },

  terminalOutput: [
    "AI_STREAM ..................... ARMED",
    "QUEUE_ENGINE .................. ONLINE",
    "STRIPE_GATEWAY ................ CONNECTED",
    "TIER_SYSTEM ................... FREE / 3 / 5 / 10",
    "UPGRADE_PATH .................. ENABLED",
    "NIGHTLY_RESET ................. 00:00 PST",
    "A_SHOW_REDIRECT ............... BARCODE RADIO",
  ],
};
