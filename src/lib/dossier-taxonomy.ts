import type {
  DossierEcosystemLane,
  DossierIdentityAuthority,
  PublicDossierKind,
} from "@/content";

export const DOSSIER_IDENTITY_AUTHORITY_OPTIONS = [
  "barcode_controlled",
  "community_owned",
  "external_system",
  "sponsor_controlled",
  "mixed_or_unclear",
] as const satisfies readonly DossierIdentityAuthority[];

export const DOSSIER_ECOSYSTEM_LANE_OPTIONS = [
  "core_team",
  "network_operator",
  "network_staff",
  "community_mod",
  "radio_support",
  "technical_operator",
  "collaborator",
  "community_member",
  "radio_regular",
  "sponsor",
  "radio_entity",
  "infrastructure",
  "production",
  "unknown",
] as const satisfies readonly DossierEcosystemLane[];

export const DOSSIER_KIND_OPTIONS = [
  "program",
  "interface",
  "platform",
  "system",
  "entity",
  "artist",
  "sponsor_character",
  "story_arc",
  "technical_component",
  "archive_record",
  "core_entity",
  "network_operator",
  "network_staff",
  "moderator",
  "collaborator",
  "community_member",
  "radio_regular",
  "radio_entity",
] as const satisfies readonly PublicDossierKind[];

export const DOSSIER_KIND_GUIDE = {
  program: "Production/program dossier such as BARCODE Radio or a show format.",
  interface: "Interaction or access surface presented as a dossier.",
  platform:
    "Third-party or platform-like surface supporting BARCODE operations.",
  system:
    "Operational system, automation, liaison, or infrastructure-like entity.",
  entity: "General entity dossier retained for backward compatibility.",
  artist: "Artist or performer dossier form.",
  sponsor_character: "Sponsor or sponsor-character record.",
  story_arc: "Narrative/program arc record.",
  technical_component: "Technical component or infrastructure operator record.",
  archive_record: "Legacy or archival dossier record.",
  core_entity:
    "BARCODE-controlled core team entity such as 6 Bit, Mac Modem, Cache Back, or DJ Floppydisc.",
  network_operator:
    "BARCODE-controlled operator/authority character such as Sheila.",
  network_staff: "BARCODE-controlled support/staff character such as Cliff.",
  moderator:
    "Community-owned moderator/helper identity, not a BARCODE-created character.",
  collaborator: "Creative collaborator or featured participant dossier form.",
  community_member: "Recurring or active community member dossier form.",
  radio_regular: "Recurring BARCODE Radio participant dossier form.",
  radio_entity: "BARCODE Radio-created entity/anomaly such as Studio Rats.",
} as const satisfies Record<PublicDossierKind, string>;

export const DOSSIER_TAXONOMY_GUIDE = {
  version: "1.0",
  organizingPrinciples: [
    "Category describes the structural record type.",
    "Kind describes the dossier form.",
    "Ecosystem lane describes where the subject sits in BARCODE.",
    "Identity authority describes who controls/owns the identity.",
    "AI, human, hybrid, and unknown nature are tags/traits, not the organizing structure.",
  ],
  categoryGuide: {
    Entity: "BARCODE entities, characters, anomalies, and entity-like systems.",
    Personnel:
      "Community-owned people, personas, moderators, collaborators, or operators represented as personnel records.",
    Sponsor: "Sponsor or commercial-relationship records.",
    Interface:
      "Platforms, community surfaces, submission surfaces, and other interaction layers.",
    Production: "Shows, programs, arcs, albums, and production records.",
  },
  kindGuide: DOSSIER_KIND_GUIDE,
  ecosystemLaneGuide: {
    core_team: "6 Bit, Mac Modem, Cache Back, DJ Floppydisc.",
    network_operator:
      "BARCODE-controlled authority/operator figures like Sheila.",
    network_staff: "BARCODE-controlled staff/support figures like Cliff.",
    community_mod: "Community-owned moderators/helpers.",
    radio_support: "Support roles around BARCODE Radio.",
    technical_operator: "Site, bot, or infrastructure helpers.",
    collaborator: "Musical or creative collaborators.",
    community_member: "Recurring/active BARCODE Network members.",
    radio_regular: "Recurring BARCODE Radio participants.",
    sponsor: "Sponsor/commercial relationship.",
    radio_entity: "BARCODE Radio-created entities/anomalies like Studio Rats.",
    infrastructure: "Platforms, interfaces, systems, and tools.",
    production: "Shows, albums, arcs, and programs.",
    unknown: "Not classified yet.",
  } satisfies Record<DossierEcosystemLane, string>,
  identityAuthorityGuide: {
    barcode_controlled:
      "BARCODE-created or BARCODE-controlled character/entity/operator/production.",
    community_owned:
      "Real people, mods, members, collaborators, artists, or personas not created/controlled by BARCODE.",
    external_system: "Third-party systems/platforms/tools.",
    sponsor_controlled: "Sponsor-owned or sponsor-character records.",
    mixed_or_unclear:
      "Unclear, shared, or intentionally ambiguous identity control.",
  } satisfies Record<DossierIdentityAuthority, string>,
  tagNatureGuide: {
    rule: "AI, human, hybrid, and unknown-nature are searchable traits/tags only, not category, kind, ecosystem lane, or identity authority.",
    natureTags: ["ai", "human", "hybrid", "unknown-nature"],
    examples: [
      "A BARCODE-controlled character can have unknown nature without becoming community-owned.",
      "A community-owned moderator can use human or unknown-nature tags without becoming a BARCODE-created entity.",
    ],
  },
  bnlRules: [
    "Do not classify community-owned mods as BARCODE-created characters.",
    "Do not classify BARCODE-created operators as community mods just because they help.",
    "Use identityAuthority before drafting public language about control, origin, or ownership.",
    "Use nature tags only when the subject nature is known or intentionally marked unknown.",
    "When uncertain, use mixed_or_unclear and ask for operator confirmation.",
  ],
} as const;
