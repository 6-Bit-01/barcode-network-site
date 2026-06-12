export const dossierAuthoringGuide = {
  version: "1.0",
  purpose: "Guide BNL/operator drafting of BARCODE Network dossier records.",
  pageStructure: [
    "Hero: // DOSSIER: ID, name, status/clearance/category badges, role line",
    "Portrait/card: image or generated placeholder with ID and clearance",
    "Dossier Record: designation, name, category, status, clearance, role, origin, tags, featured link if present",
    "Intelligence Brief: summary and optional notes",
    "Attached Files: optional audio/video/image/download records",
    "Terminal Readout: generated route/query/status/category/origin lines",
  ],
  fieldGuide: {
    id: "Stable dossier designation using the current prefix pattern, such as EN-###, PE-###, AR-###, CO-###, CM-###, SP-###, IF-###, or PD-###.",
    name: "Public display name for the person, entity, production, interface, sponsor, or anomaly.",
    category:
      "Pick the structural record type first: Entity, Personnel, Artist, Collaborator, Community, Sponsor, Interface, or Production. Personnel is not the human catch-all; artists, collaborators, and active community members stay first-class categories when their evidence supports those routes.",
    kind: "Pick the dossier form after category, using the taxonomy guide; keep legacy values compatible and use expanded values such as core_entity, network_operator, network_staff, moderator, or radio_entity where appropriate.",
    ecosystemLane:
      "Pick where the subject sits in the BARCODE ecosystem, such as core_team, network_operator, community_mod, artist, collaborator, community_member, infrastructure, production, external_platform, or unknown.",
    identityAuthority:
      "Pick who controls or owns the identity: barcode_controlled, community_owned, external_system, sponsor_controlled, or mixed_or_unclear. This is about authority/control, not AI/human nature.",
    status:
      "Current public lifecycle label: ACTIVE, INACTIVE, ARCHIVED, PENDING, or UNKNOWN.",
    clearance:
      "Public-facing lore classification label: PUBLIC, INTERNAL, or RESTRICTED. Do not imply private data access.",
    role: "Short operational role line displayed below the hero and inside the Dossier Record grid.",
    origin:
      "Known-source confidence label: KNOWN, UNKNOWN, UNVERIFIED, or WITHHELD.",
    summary:
      "Primary Intelligence Brief paragraph using public-page-safe facts and controlled BARCODE Network language.",
    notes:
      "Optional contextual note, usually operational or status-oriented, not a second full summary.",
    tags: "Short searchable labels used by the database table and dossier record. Pick category, kind, ecosystem lane, and identity authority before tags. Use sections.dossiers.tagRegistry, reuse existing tags first, and treat AI/human/hybrid/unknown-nature as nature traits only, not primary organization.",
    link: "Legacy single public URL; keep compatible while preferring primaryLink/links for new chosen links.",
    primaryLink:
      "Optional chosen/featured public-safe link with label, URL, type, and selectedBy metadata.",
    links:
      "Optional public-safe link list for official, artist, music, social, website, community, submission, portfolio, or other destinations.",
    files:
      "Optional attached public media/download records rendered as audio, video, image, or download files.",
  },
  toneGuide: {
    voice: "controlled BARCODE Network dossier language",
    style: [
      "clear, compact, in-universe, operational",
      "specific enough to be useful",
      "not overly purple or vague",
      "no fake private details",
      "preserve uncertainty with words like unverified, incomplete, pending, classified, restricted, or unknown when appropriate",
    ],
    avoid: [
      "generic cyberpunk filler",
      "random static/signal jargon unless meaningful",
      "overlong lore dumps",
      "claiming hidden facts not present in source",
      "turning every person into a supernatural entity",
    ],
  },
  lengthGuide: {
    role: "short phrase, usually 2-8 words",
    summary:
      "usually 1 compact paragraph, roughly 25-80 words depending importance",
    notes:
      "optional, usually 1-2 sentences, operational/contextual, not a second full summary",
    tags: "usually 3-6 short labels; prefer existing registry tags over synonyms",
  },
  draftingRules: [
    "Use existing page structure.",
    "Classify in order: category, kind, ecosystem lane, identity authority, then tags.",
    "Do not use AI, human, hybrid, or unknown nature as the primary organization; those are tags/traits only.",
    "Separate BARCODE-controlled characters/entities such as Sheila or Cliff from community-owned mods and helpers, and do not collapse artists, collaborators, or active community members into Personnel by default.",
    "Match current dossier tone and length.",
    "Use public-page-safe facts only.",
    "Preserve clearance/status/origin uncertainty.",
    "Do not invent hidden restricted details.",
    "Do not treat Discord identity or payment identity as dossier identity.",
    "Do not auto-promote queue artists into dossiers.",
    "Use the dossier tag registry before drafting tags, reuse existing canonical tags first, and propose new tags only when clearly justified.",
    "Do not present a proposed tag as an existing/created tag until it is added to site content or the registry.",
  ],
} as const;
