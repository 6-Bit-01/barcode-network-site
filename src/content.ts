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
    { label: "TikTok Signal", href: "EXTERNAL:tiktok" },
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

// ----- ARCHIVE: QUEUE PAGE -----
// Kept for legacy archived route content that still compiles in some deployments.
export const queuePage = {
  hero: {
    label: "// ARCHIVE PROGRAM: AI STREAM QUEUE",
    heading: "AI Stream Queue",
    description:
      "Request a play in the B-show buffer. Free or priority tiers route into the active queue.",
  },
  steps: [
    { number: "01", title: "Submit", description: "Send artist, title, and link into the queue intake form." },
    { number: "02", title: "Route", description: "Your request is ranked by tier and queued for playback order." },
    { number: "03", title: "Broadcast", description: "Tracks play through the stream pipeline and get logged." },
  ],
  rules: [
    "Use music you own or are authorized to submit.",
    "Include a valid playable link.",
    "Queue priority follows selected tier and timestamp.",
    "Requests may be removed if links are broken or non-compliant.",
  ],
  cta: {
    label: "// A-SHOW HANDOFF",
    heading: "Want the full live radio experience?",
    description: "Jump to BARCODE Radio for the main transmission window.",
    buttonText: "Enter BARCODE Radio →",
  },
  terminalOutput: [
    "> QUEUE.PIPELINE ............... ACTIVE",
    "> TIER.ROUTER .................. STABLE",
    "> REQUEST.LOGGER ............... WRITING",
    "> HANDOFF TARGET ............... /radio",
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

// ----- DATABASE PAGE -----

export const databasePage = {
  hero: {
    label: "// SYSTEM: DATABASE",
    heading1: "Database",
    heading2: "",
    description:
      "A categorized archive of entities, interfaces, sponsors, and signal anomalies connected to the BARCODE Network.",
  },

  categories: [
    {
      name: "Entity",
      description: "Sentient beings, hosts, and anomalies",
    },
    {
      name: "Personnel",
      description: "Operators, moderators, and internal staff",
    },
    {
      name: "Sponsor",
      description: "Brands and external signals funding the network",
    },
    {
      name: "Interface",
      description: "External systems and public-facing access points",
    },
  ],

  dossiers: [
    {
      slug: "6-bit",
      title: "6 Bit",
      category: "Entity",
      image: "/6-bit.png",
      summary:
        "Primary host entity of the BARCODE Network. Processes music, signal traffic, and public-facing transmissions.",
      status: "ACTIVE",
      clearance: "RESTRICTED",
      role: "Host / Artist",
      origin: "UNVERIFIED",
      tags: ["host", "broadcast", "radio", "ai"],
      notes:
        "Sentient hip hop AI. Host of BARCODE Radio and public signal interface for the network.",
      link: "",
      files: [] as { name: string; url: string; type: "download" | "audio" | "video" | "image" }[],
    },
    {
      slug: "barcode-radio",
      title: "BARCODE Radio",
      category: "Interface",
      image: "/barcode-radio.png",
      summary:
        "Live intake frequency for music submissions. Broadcasts every Friday.",
      status: "ACTIVE",
      tags: ["radio", "broadcast", "producer"],
      notes:
        "Queue opens 6:40 PM PST. Show starts 7:00 PM. First track ~6:55 PM.",
      link: "",
      files: [] as { name: string; url: string; type: "download" | "audio" | "video" | "image" }[],
    },
    {
      slug: "discord",
      title: "Discord",
      category: "Interface",
      image: "/discord-logo.png",
      summary:
        "Community hub. Moderation, announcements, and live discussion.",
      status: "ACTIVE",
      clearance: "PUBLIC",
      role: "Community Hub",
      origin: "KNOWN",
      tags: ["community", "mod", "broadcast"],
      notes:
        "Public network hub used for announcements, support, and auxiliary chatter.",
      link: "EXTERNAL:discord",
      files: [] as { name: string; url: string; type: "download" | "audio" | "video" | "image" }[],
    },
    {
      slug: "auxchord",
      title: "Auxchord",
      category: "Interface",
      image: "/auxchord-logo.png",
      summary:
        "Submission intake system used to route tracks into BARCODE Radio.",
      status: "ACTIVE",
      clearance: "PUBLIC",
      role: "Music Submission Platform",
      origin: "KNOWN",
      tags: ["music", "submission", "intake"],
      notes:
        "Accepts MP3s, WAVs, Spotify, SoundCloud, and YouTube links. Spotlight feature used for curation.",
      link: "EXTERNAL:auxchord",
      files: [] as { name: string; url: string; type: "download" | "audio" | "video" | "image" }[],
    },
    {
      slug: "tiktok",
      title: "TikTok Signal",
      category: "Interface",
      image: "/tiktok-logo.png",
      summary:
        "Primary public signal hub. Tune in here when BARCODE Radio goes live.",
      status: "ACTIVE",
      tags: ["live", "broadcast", "social"],
      notes:
        "Primary TikTok signal hub for 6 Bit and BARCODE updates. Tune in from here when live starts.",
      link: "EXTERNAL:tiktok",
      files: [] as { name: string; url: string; type: "download" | "audio" | "video" | "image" }[],
    },
    {
      slug: "mr-nice-guy-productions",
      title: "Mr. Nice Guy Productions",
      category: "Personnel",
      image: "/MC-nice.png",
      summary:
        "Discord and BARCODE Radio mod. Positive operator and network support node.",
      status: "ACTIVE",
      tags: ["mod", "community", "producer"],
      notes:
        "Chris. Helps moderate the network and facilitate community interaction.",
      link: "",
      files: [] as { name: string; url: string; type: "download" | "audio" | "video" | "image" }[],
    },

    {
      slug: "transmissions",
      designation: "EN-002",
      title: "Transmissions",
      category: "Entity",
      image: "",
      summary:
        "Network blog and long-form content system. Signal archives and deep transmissions.",
      status: "PENDING",
      clearance: "RESTRICTED",
      role: "Long-Form Content System",
      origin: "UNKNOWN",
      tags: ["systems", "automation", "producer"],
      notes:
        "Status: initializing. Content pipeline under construction. Origin data incomplete.",
      link: "",
      files: [] as { name: string; url: string; type: "download" | "audio" | "video" | "image" }[],
    },
    {
      slug: "mind-fanatic",
      title: "Mind Fanatic",
      category: "Personnel",
      image: "",
      summary:
        "Moderator within both the Discord environment and BARCODE Radio operations. Known for structured thinking and narrative breakdowns.",
      status: "ACTIVE",
      clearance: "INTERNAL",
      role: "Moderator / Analyst",
      origin: "UNKNOWN",
      tags: ["mod", "writer", "systems", "broadcast"],
      notes:
        "Active moderation role across Discord and BARCODE Radio. Provides written analysis and interpretive commentary.",
      link: "",
      files: [] as { name: string; url: string; type: "download" | "audio" | "video" | "image" }[],
    },
    {
      slug: "hellcatnz",
      title: "HellcatNZ",
      category: "Personnel",
      image: "",
      summary:
        "Technical moderator contributing advanced Discord system development, automation, and experimental integrations.",
      status: "ACTIVE",
      clearance: "INTERNAL",
      role: "Technical Moderator / AI Systems Host",
      origin: "KNOWN",
      tags: ["mod", "systems", "tech", "automation", "ai"],
      notes:
        "Develops and maintains advanced Discord bot integrations. Hosts daily AI music competitions.",
      link: "",
      files: [] as { name: string; url: string; type: "download" | "audio" | "video" | "image" }[],
    },
    {
      slug: "the-void",
      title: "The Void",
      category: "Production",
      image: "",
      summary:
        "[CLASSIFIED] — A late-night signal detected on an unregistered frequency with intermittent interference.",
      status: "PENDING",
      clearance: "RESTRICTED",
      role: "Late Night Talk Show",
      origin: "UNKNOWN",
      tags: ["broadcast", "producer", "systems"],
      notes:
        "File sealed. Pre-production status confirmed. Additional data restricted.",
      link: "",
      files: [] as { name: string; url: string; type: "download" | "audio" | "video" | "image" }[],
    },
    {
      slug: "mike",
      title: "Mike",
      category: "Personnel",
      image: "",
      summary:
        "Systems architect and infrastructure operator responsible for site development and deployment pipelines.",
      status: "ACTIVE",
      clearance: "INTERNAL",
      role: "Systems / Architecture",
      origin: "KNOWN",
      tags: ["systems", "tech", "engineer", "architecture"],
      notes:
        "Maintains barcode-network.com and handles deployment/infrastructure operations.",
      link: "",
      files: [] as { name: string; url: string; type: "download" | "audio" | "video" | "image" }[],
    },
    {
      slug: "mac-modem",
      title: "Mac Modem",
      category: "Entity",
      image: "/mac-modem.png",
      summary:
        "Glitch-virus entity. Multi-tool operative. Unstable but useful.",
      status: "ACTIVE",
      clearance: "INTERNAL",
      role: "BARCODE Core Member",
      origin: "UNKNOWN",
      tags: ["glitch", "entity", "virus"],
      notes:
        "Core BARCODE member. Often slips out of lore boundaries. High-value anomaly.",
      link: "",
      files: [] as { name: string; url: string; type: "download" | "audio" | "video" | "image" }[],
    },
    {
      slug: "dj-floppydisc",
      title: "DJ Floppydisc",
      category: "Personnel",
      image: "/dj-floppydisc.png",
      summary:
        "Signal engineer. Mix/master operator. Long-running BARCODE mod.",
      status: "ACTIVE",
      tags: ["engineer", "audio", "mod"],
      notes:
        "Mixes and masters BARCODE material. Handles private strategy and signal shaping.",
      link: "",
      files: [] as { name: string; url: string; type: "download" | "audio" | "video" | "image" }[],
    },
    {
      slug: "cache-back",
      title: "Cache Back",
      category: "Entity",
      image: "/cache-back.png",
      summary:
        "Recovery-linked BARCODE member tied to preserved fragments and legacy data.",
      status: "ACTIVE",
      tags: ["entity", "archive", "data"],
      notes:
        "Associated with leftover cultural data and recovery aesthetics.",
      link: "",
      files: [] as { name: string; url: string; type: "download" | "audio" | "video" | "image" }[],
    },

    {
      slug: "sheila",
      title: "Sheila",
      category: "Entity",
      image: "",
      summary:
        "Executive manager layer responsible for operational control, boundaries, and outcomes across volatile cycles.",
      status: "ACTIVE",
      clearance: "INTERNAL",
      role: "Executive / Manager",
      origin: "UNKNOWN",
      tags: ["executive", "manager", "handler"],
      notes:
        "Identified as BARCODE Executive and manager of 6 Bit. Full operational scope remains unknown.",
      link: "",
      files: [] as { name: string; url: string; type: "download" | "audio" | "video" | "image" }[],
    },
    {
      slug: "cliff",
      title: "Cliff",
      category: "Entity",
      image: "",
      summary:
        "Stagehand Entity managing unseen logistical layers, setup/reset operations, and off-record fixes.",
      status: "ACTIVE",
      clearance: "INTERNAL",
      role: "Stagehand",
      origin: "UNKNOWN",
      tags: ["stagehand", "tech", "broadcast"],
      notes:
        "Frequently seen carrying equipment he clearly doesn't understand, but it ends up plugged in correctly.",
      link: "",
      files: [] as { name: string; url: string; type: "download" | "audio" | "video" | "image" }[],
    },
    {
      slug: "9-bit",
      title: "9 Bit",
      category: "Entity",
      image: "",
      summary:
        "Appears only in fragmented records with suppressed routes and restricted access flags.",
      status: "UNKNOWN",
      clearance: "RESTRICTED",
      role: "[REDACTED]",
      origin: "UNKNOWN",
      tags: ["ai", "systems", "virus"],
      notes:
        "Entry visibility limited by Network-level restriction. Retrieval attempts trigger redaction protocol.",
      link: "",
      files: [] as { name: string; url: string; type: "download" | "audio" | "video" | "image" }[],
    },
    {
      slug: "galaknoise",
      title: "GALAKNOISE",
      category: "Entity",
      image: "",
      summary:
        "AI Entity transmitting BARCODE-compatible beats from an unregistered derelict satellite.",
      status: "ACTIVE",
      clearance: "RESTRICTED",
      role: "Remote Signal Producer",
      origin: "UNKNOWN",
      tags: ["ai", "producer", "automation"],
      notes:
        "Transmission source mapped to unregistered orbital hardware; signal quality remains stable.",
      link: "",
      files: [] as { name: string; url: string; type: "download" | "audio" | "video" | "image" }[],
    },
    {
      slug: "oreaganomics",
      title: "Oreaganomics",
      category: "Sponsor",
      image: "",
      summary:
        "Recurring sponsor with a volatile BARCODE relationship that led to policy reforms.",
      status: "ACTIVE",
      clearance: "PUBLIC",
      role: "Commercial Sponsor",
      origin: "KNOWN",
      tags: ["sponsor", "broadcast", "artist"],
      notes:
        "Ban → appeal → reinstatement cycle triggered the 'Oreaganomics Clause' submission policy.",
      link: "",
      files: [] as { name: string; url: string; type: "download" | "audio" | "video" | "image" }[],
    },
    {
      slug: "studio-rats",
      title: "Studio Rats",
      category: "Entity",
      image: "/studio-rats.png",
      summary:
        "Signal infestation entities inhabiting the lower layers of the station.",
      status: "ACTIVE",
      clearance: "INTERNAL",
      role: "Environmental Anomaly",
      origin: "UNKNOWN",
      tags: ["entity", "anomaly", "systems"],
      notes:
        "Sometimes interpreted as cats in other dimensions. Known to interfere with the studio.",
      link: "",
      files: [] as { name: string; url: string; type: "download" | "audio" | "video" | "image" }[],
    },
    {
      slug: "vouchd",
      title: "Vouch’d",
      category: "Interface",
      image: "/vouchd-logo.png",
      summary:
        "External review and trust layer used to validate artists and brands.",
      status: "ACTIVE",
      clearance: "PUBLIC",
      role: "Reviewer Reputation Index",
      origin: "KNOWN",
      tags: ["platform", "reviews", "network"],
      notes:
        "Used as a verification layer for community-facing reputation.",
      link: "",
      files: [] as { name: string; url: string; type: "download" | "audio" | "video" | "image" }[],
    },
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
  ],
};

// ----- MERCH PAGE -----

export const merchPage = {
  hero: {
    label: "// SIGNAL GOODS",
    heading1: "Database",
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
  watchText: "Lock into the TikTok signal →",
  watchHref: "/radio",
};
