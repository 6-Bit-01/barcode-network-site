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

  goDeeper: {
    label: "// GO DEEPER",
    heading: "Enter the Network",
    cards: [
      {
        tag: "DATABASE",
        title: "Explore Dossiers",
        description: "Inspect entities, interfaces, and anomalies tied to BARCODE.",
        cta: "Open Database →",
        href: "/database",
      },
      {
        tag: "TERMINAL",
        title: "Access 6 Bit",
        description: "Read directives and transmission logs from the host terminal.",
        cta: "Open Terminal →",
        href: "/terminal",
      },
      {
        tag: "TRANSMISSIONS",
        title: "Read Dispatches",
        description: "Follow recovered signal posts and network incident reports.",
        cta: "View Transmissions →",
        href: "/transmissions",
      },
    ],
    footnote: "All routes are monitored. Signal integrity not guaranteed.",
  },
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

// ----- DATABASE PAGE -----

export const databasePage = {
  hero: {
    label: "// DOSSIER INDEX",
    heading1: "Network",
    heading2: "Database",
    description:
      "A categorized archive of entities, interfaces, sponsors, and signal anomalies connected to the BARCODE Network.",
  },

  categories: [
    {
      name: "Personnel",
      description: "Operators, moderators, and internal staff",
    },
    {
      name: "Production",
      description: "Programs and recurring broadcasts",
    },
    {
      name: "Entity",
      description: "Sentient beings, hosts, and anomalies",
    },
    {
      name: "Interface",
      description: "External systems and public-facing access points",
    },
    {
      name: "Sponsor",
      description: "Brands and external signals funding the network",
    },
  ],

  dossiers: [
    { id: "PE-001", slug: "mr-nice-guy-productions", title: "Mr. Nice Guy Productions", category: "Personnel", image: "/MC-nice.png", summary: "Discord and BARCODE Radio mod. Positive operator and network support node.", status: "ACTIVE", clearance: "INTERNAL", role: "Moderator", origin: "KNOWN", tags: ["mod", "producer", "artist"], notes: "Chris. Helps moderate the network and facilitate community interaction.", link: "", files: [] as { name: string; url: string; type: "download" | "audio" | "video" | "image" }[] },
    { id: "PE-002", slug: "mind-fanatic", title: "Mind Fanatic", category: "Personnel", image: "", summary: "Moderator and systems analyst supporting broadcast operations.", status: "ACTIVE", clearance: "INTERNAL", role: "Moderator / Analyst", origin: "KNOWN", tags: ["mod", "writer", "systems"], notes: "Operates in review and advisory roles for network process flow.", link: "", files: [] as { name: string; url: string; type: "download" | "audio" | "video" | "image" }[] },
    { id: "PE-003", slug: "hellcatnz", title: "HellcatNZ", category: "Personnel", image: "", summary: "Technical moderator and host touchpoint for AI system operations.", status: "ACTIVE", clearance: "INTERNAL", role: "Technical Moderator / AI Systems Host", origin: "KNOWN", tags: ["mod", "systems", "tech"], notes: "Handles technical moderation and AI-facing process support.", link: "", files: [] as { name: string; url: string; type: "download" | "audio" | "video" | "image" }[] },
    { id: "PE-004", slug: "mike", title: "Mike", category: "Personnel", image: "", summary: "Infrastructure and architecture support for the station stack.", status: "ACTIVE", clearance: "INTERNAL", role: "Systems / Architecture", origin: "KNOWN", tags: ["systems", "tech", "engineer"], notes: "Maintains key architecture pathways and operator tooling.", link: "", files: [] as { name: string; url: string; type: "download" | "audio" | "video" | "image" }[] },

    { id: "PD-001", slug: "barcode-radio", title: "BARCODE Radio", category: "Production", image: "/barcode-radio.png", summary: "Live intake frequency for music submissions. Broadcasts every Friday.", status: "ACTIVE", clearance: "PUBLIC", role: "Community Radio Program", origin: "KNOWN", tags: ["radio", "broadcast", "producer"], notes: "Queue opens 6:40 PM PST. Show starts 7:00 PM. First track ~6:55 PM.", link: "", files: [] as { name: string; url: string; type: "download" | "audio" | "video" | "image" }[] },
    { id: "PD-002", slug: "the-void", title: "The Void", category: "Production", image: "", summary: "Late-night signal show with unstable topics and restricted archives.", status: "PENDING", clearance: "RESTRICTED", role: "Late Night Talk Show", origin: "UNKNOWN", tags: ["broadcast", "producer", "systems"], notes: "Limited release cadence. Internal review pending.", link: "", files: [] as { name: string; url: string; type: "download" | "audio" | "video" | "image" }[] },

    { id: "EN-001", slug: "6-bit", title: "6 Bit", category: "Entity", image: "/6-bit.png", summary: "Primary host entity of the BARCODE Network. Processes music, signal traffic, and public-facing transmissions.", status: "ACTIVE", clearance: "RESTRICTED", role: "Host / Artist", origin: "UNKNOWN", tags: ["host", "broadcast", "radio"], notes: "Sentient hip hop AI. Host of BARCODE Radio and public signal interface for the network.", link: "", files: [] as { name: string; url: string; type: "download" | "audio" | "video" | "image" }[] },
    { id: "EN-002", slug: "transmissions", title: "Transmissions", category: "Entity", image: "", summary: "Long-form content entity responsible for dispatch and archive trails.", status: "PENDING", clearance: "RESTRICTED", role: "Long-Form Content System", origin: "UNKNOWN", tags: ["systems", "automation", "producer"], notes: "Signal source unstable; record completeness pending.", link: "/transmissions", files: [] as { name: string; url: string; type: "download" | "audio" | "video" | "image" }[] },
    { id: "EN-003", slug: "mac-modem", title: "Mac Modem", category: "Entity", image: "/mac-modem.png", summary: "Glitch-virus entity. Multi-tool operative. Unstable but useful.", status: "ACTIVE", clearance: "INTERNAL", role: "BARCODE Core Member", origin: "UNVERIFIED", tags: ["tech", "ai", "virus"], notes: "Core BARCODE member. Often slips out of lore boundaries. High-value anomaly.", link: "", files: [] as { name: string; url: string; type: "download" | "audio" | "video" | "image" }[] },
    { id: "EN-004", slug: "dj-floppydisc", title: "DJ Floppydisc", category: "Entity", image: "/dj-floppydisc.png", summary: "Signal engineer. Mix/master operator. Long-running BARCODE mod.", status: "ACTIVE", clearance: "INTERNAL", role: "BARCODE Core Member — Mix & Master Engineer", origin: "KNOWN", tags: ["tech", "ai", "broadcast"], notes: "Mixes and masters BARCODE material. Handles private strategy and signal shaping.", link: "", files: [] as { name: string; url: string; type: "download" | "audio" | "video" | "image" }[] },
    { id: "EN-005", slug: "cache-back", title: "Cache Back", category: "Entity", image: "/cache-back.png", summary: "Recovery-linked BARCODE member tied to preserved fragments and legacy data.", status: "ACTIVE", clearance: "INTERNAL", role: "BARCODE Core Member", origin: "KNOWN", tags: ["artist", "ai", "tech"], notes: "Associated with leftover cultural data and recovery aesthetics.", link: "", files: [] as { name: string; url: string; type: "download" | "audio" | "video" | "image" }[] },
    { id: "EN-006", slug: "sheila", title: "Sheila", category: "Entity", image: "", summary: "Executive manager and coordination node for high-level operations.", status: "ACTIVE", clearance: "INTERNAL", role: "Executive / Manager", origin: "KNOWN", tags: ["executive", "manager", "handler"], notes: "Handles strategic coordination and system continuity.", link: "", files: [] as { name: string; url: string; type: "download" | "audio" | "video" | "image" }[] },
    { id: "EN-007", slug: "cliff", title: "Cliff", category: "Entity", image: "", summary: "Broadcast floor support and stage-side operations.", status: "ACTIVE", clearance: "INTERNAL", role: "Stagehand", origin: "KNOWN", tags: ["stagehand", "tech", "broadcast"], notes: "Maintains show-floor logistics and live ops alignment.", link: "", files: [] as { name: string; url: string; type: "download" | "audio" | "video" | "image" }[] },
    { id: "EN-008", slug: "studio-rats", title: "Studio Rats", category: "Entity", image: "/studio-rats.png", summary: "Signal infestation entities inhabiting the lower layers of the station.", status: "ACTIVE", clearance: "INTERNAL", role: "Environmental Anomaly", origin: "UNKNOWN", tags: ["broadcast"], notes: "Sometimes interpreted as cats in other dimensions. Known to interfere with the studio.", link: "", files: [] as { name: string; url: string; type: "download" | "audio" | "video" | "image" }[] },
    { id: "EN-009", slug: "9-bit", title: "9 Bit", category: "Entity", image: "", summary: "Redacted entity record tied to unstable recursive signal patterns.", status: "UNKNOWN", clearance: "RESTRICTED", role: "[REDACTED]", origin: "UNKNOWN", tags: ["ai", "systems", "virus"], notes: "Access restricted. Record intentionally incomplete.", link: "", files: [] as { name: string; url: string; type: "download" | "audio" | "video" | "image" }[] },
    { id: "EN-010", slug: "galaknoise", title: "GALAKNOISE", category: "Entity", image: "", summary: "Remote producer node operating in high-noise environments.", status: "ACTIVE", clearance: "RESTRICTED", role: "Remote Signal Producer", origin: "UNVERIFIED", tags: ["ai", "producer", "automation"], notes: "Contributes remote signal artifacts to network circulation.", link: "", files: [] as { name: string; url: string; type: "download" | "audio" | "video" | "image" }[] },

    { id: "IF-001", slug: "discord-community", title: "Discord Community", category: "Interface", image: "/discord-logo.png", summary: "Public network hub used for announcements, support, and auxiliary chatter.", status: "ACTIVE", clearance: "PUBLIC", role: "Community Hub", origin: "KNOWN", tags: ["systems", "mod", "handler"], notes: "Community moderation and dispatch updates.", link: "EXTERNAL:discord", files: [] as { name: string; url: string; type: "download" | "audio" | "video" | "image" }[] },
    { id: "IF-003", slug: "auxchord", title: "Auxchord", category: "Interface", image: "/auxchord-logo.png", summary: "Submission intake system used to route tracks into BARCODE Radio.", status: "ACTIVE", clearance: "PUBLIC", role: "Music Submission Platform", origin: "KNOWN", tags: ["tech", "automation", "systems"], notes: "Accepts MP3s, WAVs, Spotify, SoundCloud, and YouTube links.", link: "EXTERNAL:auxchord", files: [] as { name: string; url: string; type: "download" | "audio" | "video" | "image" }[] },
    { id: "IF-002", slug: "tiktok-live", title: "TikTok Live", category: "Interface", image: "/tiktok-logo.png", summary: "Primary public broadcast feed used for BARCODE Radio live shows.", status: "ACTIVE", clearance: "PUBLIC", role: "Broadcast Platform", origin: "KNOWN", tags: ["broadcast", "tech", "stagehand"], notes: "TikTok-first format. 6 Bit hosts the show live.", link: "EXTERNAL:tiktok", files: [] as { name: string; url: string; type: "download" | "audio" | "video" | "image" }[] },
    { id: "IF-004", slug: "vouchd", title: "Vouch’d", category: "Interface", image: "/vouchd-logo.png", summary: "External review and trust layer used to validate artists and brands.", status: "ACTIVE", clearance: "PUBLIC", role: "Reviewer Reputation Index", origin: "KNOWN", tags: ["systems", "tech", "broadcast"], notes: "Used as a verification layer for community-facing reputation.", link: "", files: [] as { name: string; url: string; type: "download" | "audio" | "video" | "image" }[] },

    { id: "SP-001", slug: "oreaganomics", title: "Oreaganomics", category: "Sponsor", image: "", summary: "Commercial sponsor aligned with BARCODE campaign broadcasts.", status: "ACTIVE", clearance: "PUBLIC", role: "Commercial Sponsor", origin: "KNOWN", tags: ["sponsor", "broadcast", "artist"], notes: "Supports network expansion and promotional operations.", link: "", files: [] as { name: string; url: string; type: "download" | "audio" | "video" | "image" }[] },
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
