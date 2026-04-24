// ============================================================
// BARCODE NETWORK — SITE CONTENT
// ============================================================
// Edit any text here and it updates across the entire site.
//
// To edit: Change ONLY the text between the quotes.
// Don't remove the commas, brackets, or property names.
// ============================================================
import { databaseCategories, databaseDossiers } from "@/data/database-dossiers";

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

  categories: databaseCategories,

  dossiers: databaseDossiers,

  terminalQuery: [
    "SCAN DATABASE INDEX",
    "SORT BY CATEGORY PRIORITY",
    "FILTER STATUS != ARCHIVED",
    "RETURN ACTIVE RECORDS",
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
