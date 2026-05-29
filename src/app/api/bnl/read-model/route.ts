import { NextResponse } from "next/server";
import { databasePage, radioPage, siteConfig } from "@/content";
import { getRadioQueueState, toPublicQueueTrack } from "@/lib/queue";
import type { QueueEntry, QueueLane, QueuePublicTrack, QueueSourceType } from "@/lib/queue-types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CACHE_CONTROL = "public, max-age=15, s-maxage=30";
const MAX_ARTISTS = 25;
const MAX_TRACKS_PER_ARTIST = 5;

type BnlReadModelTrackStatus = "queued" | "completed" | "nowPlaying" | "upNext";

type BnlTrackContextRole = "runtime" | "recap_candidate";

type BnlTrackContext = {
  source: "queue_public_snapshot";
  visibility: "public";
  contextRole: BnlTrackContextRole;
  status: BnlReadModelTrackStatus;
  memoryDefault: "do_not_store" | "recap_candidate_only";
  profileDefault: "not_profile";
  identityDefault: "not_discord_identity";
  recapDefault: "not_until_completed" | "recap_candidate";
};

type BnlArtistTrackStatusCounts = Record<BnlReadModelTrackStatus, number>;

type BnlReadModelArtist = {
  name: string;
  normalizedName: string;
  tiktokHandle?: string | null;
  tracks: Array<{
    trackId: string;
    title: string;
    lane: QueueLane;
    status: BnlReadModelTrackStatus;
    sourceType: QueueSourceType;
    publicSourceUrl?: string | null;
  }>;
  source: "queue_public_snapshot";
  trackStatusCounts: BnlArtistTrackStatusCounts;
  bnlContext: {
    source: "queue_public_snapshot";
    visibility: "public";
    surfaceType: "queue_derived_artist_surface";
    profileStatus: "not_profile";
    identityStatus: "not_discord_or_account_identity";
    memoryDefault: "do_not_store";
    dossierDefault: "not_seed_without_operator_reason";
  };
};

type BnlQueueTrack = Pick<
  QueuePublicTrack,
  | "id"
  | "submittedArtistName"
  | "submittedSongTitle"
  | "detectedArtistName"
  | "detectedSongTitle"
  | "providerTitle"
  | "sourceType"
  | "lane"
  | "durationLabel"
  | "estimatedDurationSeconds"
  | "detectedDurationSeconds"
  | "durationIsEstimate"
  | "sourceArtworkUrl"
  | "publicSourceUrl"
  | "tiktokHandle"
  | "priorityUpgradeRequested"
  | "priorityUpgradeStatus"
> & {
  bnlContext: BnlTrackContext;
};

function bnlTrackContext(status: BnlReadModelTrackStatus): BnlTrackContext {
  const completed = status === "completed";
  return {
    source: "queue_public_snapshot",
    visibility: "public",
    contextRole: completed ? "recap_candidate" : "runtime",
    status,
    memoryDefault: completed ? "recap_candidate_only" : "do_not_store",
    profileDefault: "not_profile",
    identityDefault: "not_discord_identity",
    recapDefault: completed ? "recap_candidate" : "not_until_completed",
  };
}

function publicTrack(track: QueuePublicTrack | null | undefined, status: BnlReadModelTrackStatus): BnlQueueTrack | null {
  if (!track) return null;
  return {
    id: track.id,
    submittedArtistName: track.submittedArtistName,
    submittedSongTitle: track.submittedSongTitle,
    detectedArtistName: track.detectedArtistName ?? null,
    detectedSongTitle: track.detectedSongTitle ?? null,
    providerTitle: track.providerTitle ?? null,
    sourceType: track.sourceType,
    lane: track.lane,
    durationLabel: track.durationLabel,
    estimatedDurationSeconds: track.estimatedDurationSeconds,
    detectedDurationSeconds: track.detectedDurationSeconds ?? null,
    durationIsEstimate: track.durationIsEstimate,
    sourceArtworkUrl: track.sourceArtworkUrl ?? null,
    publicSourceUrl: track.publicSourceUrl ?? null,
    tiktokHandle: track.tiktokHandle ?? null,
    priorityUpgradeRequested: track.priorityUpgradeRequested === true,
    priorityUpgradeStatus: track.priorityUpgradeStatus ?? "none",
    bnlContext: bnlTrackContext(status),
  };
}

function isRealQueueEntry(entry: QueueEntry | null | undefined): entry is QueueEntry {
  if (!entry || entry.isTestTrack === true) return false;
  if (entry.note?.includes("[QUEUE SIMULATION TRACK]") === true) return false;
  if (entry.artist.startsWith("SIM ") || entry.title.startsWith("SIM ")) return false;
  return true;
}

function pressureFor(activeCount: number, capacity: number): "low" | "medium" | "high" | "max" {
  if (capacity <= 0) return "low";
  const load = activeCount / capacity;
  if (load >= 1) return "max";
  if (load >= 0.75) return "high";
  if (load >= 0.4) return "medium";
  return "low";
}

async function readPublicLiveQueueForBnl() {
  const state = await getRadioQueueState();
  const realQueueEntries = state.queue.filter(isRealQueueEntry);
  const realCompletedEntries = state.history.filter(isRealQueueEntry).slice(0, 10);
  const realRemovedCount = (state.removed ?? []).filter(isRealQueueEntry).length;
  const realNowPlaying = isRealQueueEntry(state.nowPlaying) ? state.nowPlaying : null;
  const realUpNext = isRealQueueEntry(state.nextInLine) ? state.nextInLine : null;
  const activeIds = new Set<string>();
  for (const entry of realQueueEntries) {
    if (entry.status === "queued" || entry.status === "playing") activeIds.add(entry.id);
  }
  if (realNowPlaying) activeIds.add(realNowPlaying.id);
  if (realUpNext) activeIds.add(realUpNext.id);

  const capacity = state.publicStatus?.capacity ?? state.session?.queueCapacity ?? 0;
  const activeCount = activeIds.size;
  const publicQueueTracks = realQueueEntries.map(toPublicQueueTrack);
  const publicCompletedTracks = realCompletedEntries.map(toPublicQueueTrack);
  const nowPlaying = realNowPlaying ? toPublicQueueTrack(realNowPlaying) : null;
  const upNext = realUpNext ? toPublicQueueTrack(realUpNext) : null;

  return {
    queue: {
      available: true,
      session: {
        sessionId: state.session?.sessionId ?? "",
        title: state.session?.title ?? "",
        showDate: state.session?.showDate ?? "",
        status: state.session?.status ?? "prepared",
        queueOpen: state.session?.queueOpen === true,
        broadcastPhase: state.session?.broadcastPhase ?? null,
        activeCount,
        completedCount: publicCompletedTracks.length,
        removedCount: realRemovedCount,
        wheelSpinsOwed: state.session?.wheelSpinsOwed ?? 0,
        priorityUpgradesEnabled: state.session?.priorityUpgradesEnabled === true,
        priorityUpgradeLabel: state.session?.priorityUpgradeLabel ?? "Priority Signal",
      },
      status: {
        isOpen: state.publicStatus?.isOpen ?? state.session?.queueOpen === true,
        activeCount,
        capacity,
        pressure: pressureFor(activeCount, capacity),
      },
      nowPlaying: publicTrack(nowPlaying, "nowPlaying"),
      upNext: publicTrack(upNext, "upNext"),
      queue: publicQueueTracks.map((track) => publicTrack(track, "queued")).filter((track): track is BnlQueueTrack => Boolean(track)),
      completed: publicCompletedTracks.map((track) => publicTrack(track, "completed")).filter((track): track is BnlQueueTrack => Boolean(track)),
    },
    artists: artistsFromTracks(nowPlaying, upNext, publicQueueTracks, publicCompletedTracks),
  };
}

function stableArtistKeyFallback(name: string): string {
  let hash = 0;
  for (const char of name) {
    hash = (hash * 31 + char.codePointAt(0)!) >>> 0;
  }
  return `artist-${hash.toString(36)}`;
}

function normalizeArtistName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "";

  const normalized = trimmed
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return normalized || stableArtistKeyFallback(trimmed);
}

function artistNameForTrack(track: QueuePublicTrack): string {
  return (track.detectedArtistName || track.submittedArtistName).trim();
}

function titleForTrack(track: QueuePublicTrack): string {
  return (track.detectedSongTitle || track.submittedSongTitle || track.providerTitle || "Untitled track").trim();
}

function addArtistTrack(artists: Map<string, BnlReadModelArtist>, track: QueuePublicTrack | null | undefined, status: BnlReadModelTrackStatus) {
  if (!track) return;
  const name = artistNameForTrack(track);
  if (!name) return;
  const normalizedName = normalizeArtistName(name);
  if (!normalizedName) return;

  const existing = artists.get(normalizedName);
  const artist: BnlReadModelArtist = existing ?? {
    name,
    normalizedName,
    tiktokHandle: track.tiktokHandle ?? null,
    tracks: [],
    source: "queue_public_snapshot",
    trackStatusCounts: {
      queued: 0,
      completed: 0,
      nowPlaying: 0,
      upNext: 0,
    },
    bnlContext: {
      source: "queue_public_snapshot",
      visibility: "public",
      surfaceType: "queue_derived_artist_surface",
      profileStatus: "not_profile",
      identityStatus: "not_discord_or_account_identity",
      memoryDefault: "do_not_store",
      dossierDefault: "not_seed_without_operator_reason",
    },
  };

  if (!artist.tiktokHandle && track.tiktokHandle) artist.tiktokHandle = track.tiktokHandle;
  if (!artist.tracks.some((artistTrack) => artistTrack.trackId === track.id) && artist.tracks.length < MAX_TRACKS_PER_ARTIST) {
    artist.tracks.push({
      trackId: track.id,
      title: titleForTrack(track),
      lane: track.lane,
      status,
      sourceType: track.sourceType,
      publicSourceUrl: track.publicSourceUrl ?? null,
    });
  }
  artist.trackStatusCounts[status] += 1;

  artists.set(normalizedName, artist);
}

function artistsFromTracks(
  nowPlaying: QueuePublicTrack | null,
  upNext: QueuePublicTrack | null,
  queue: QueuePublicTrack[],
  completed: QueuePublicTrack[],
): BnlReadModelArtist[] {
  const artists = new Map<string, BnlReadModelArtist>();
  addArtistTrack(artists, nowPlaying, "nowPlaying");
  addArtistTrack(artists, upNext, "upNext");
  for (const track of queue) addArtistTrack(artists, track, "queued");
  for (const track of completed) addArtistTrack(artists, track, "completed");
  return [...artists.values()].slice(0, MAX_ARTISTS);
}

function publicDossiers() {
  const publicEntries = databasePage.entries
    .filter((entry) => entry.clearance === "PUBLIC")
    .map((entry) => ({
      id: entry.id,
      name: entry.name,
      category: entry.category,
      status: entry.status,
      role: entry.role,
      origin: entry.origin,
      summary: entry.summary,
      tags: entry.tags,
      link: entry.link || null,
      source: "public_database_dossier",
      bnlContext: {
        source: "public_database_dossier",
        visibility: "public",
        dossierStatus: "existing_public_dossier",
        memoryDefault: "site_context_not_broadcast_memory",
        seedDefault: "not_seed_already_public_dossier",
        identityDefault: "public_site_entity_not_discord_identity",
      },
    }));

  if (publicEntries.length === 0) {
    return {
      implemented: false,
      public: [],
      items: [],
      sourceAuthority: "public_database_entries_only",
      rules: [
        "Existing public dossiers are website-published public context.",
        "They are not private profiles.",
        "They are not Discord identity mappings.",
        "They are not automatic broadcast memory.",
      ],
      note: "No public-clearance database dossier summaries are currently included.",
    };
  }

  return {
    implemented: true,
    public: publicEntries,
    items: publicEntries,
    sourceAuthority: "public_database_entries_only",
    rules: [
      "Existing public dossiers are website-published public context.",
      "They are not private profiles.",
      "They are not Discord identity mappings.",
      "They are not automatic broadcast memory.",
    ],
    note: "Only public-clearance database dossier summaries are included.",
  };
}

const sourceContext = [
  {
    id: "barcode_network",
    title: "BARCODE Network",
    summary: `${siteConfig.name} is the public broadcast infrastructure behind BARCODE Radio: a connected site, archive, and signal surface for programs, transmissions, releases, and live-show context.`,
  },
  {
    id: "barcode_radio",
    title: "BARCODE Radio",
    summary: `${radioPage.hero.heading1} ${radioPage.hero.heading2} is the weekly live broadcast. Public submissions enter the show through Auxchord and the website queue surface reflects public session state.`,
  },
  {
    id: "bnl_01",
    title: "BNL-01",
    summary: "BNL-01 is the BARCODE Network liaison/bot surface for public-safe context and community-facing continuity. This read model does not grant BNL private system control or admin access.",
  },
  {
    id: "broadcast_memory",
    title: "Broadcast Memory",
    summary: "Broadcast memory is public-facing continuity about what the Network has already surfaced through broadcasts, site copy, queue state, and public records. It is not raw Discord data, private notes, or hidden R&D process material.",
  },
  {
    id: "priority_signal",
    title: "Priority Signal",
    summary: "Priority Signal is the public queue upgrade concept shown on the BARCODE Radio queue surface when enabled. This endpoint only exposes public-safe priority labels/statuses, never Stripe secrets, checkout records, or payment facts.",
  },
  {
    id: "boundaries",
    title: "Public Read Boundary",
    summary: "This source context is not user accounts, payment records, private queue notes, Discord identity mapping, hidden dossiers, private upload access, or private admin state.",
  },
];

type OperatorLaneItem = {
  id: string;
  label: string;
  source: "queue_public_snapshot" | "public_database_dossier" | "read_model_boundary";
  kind: string;
  trackId?: string;
  status?: BnlReadModelTrackStatus;
  value?: string | number | boolean | null;
  reason: string;
};

function trackLaneItem(track: BnlQueueTrack, status: BnlReadModelTrackStatus, lane: "temporaryRuntimeContext" | "recapCandidates" | "publicSafeCopyCandidates"): OperatorLaneItem {
  const title = track.detectedSongTitle || track.submittedSongTitle || track.providerTitle || "Untitled track";
  const artist = track.detectedArtistName || track.submittedArtistName || "Unknown artist";
  return {
    id: `${lane}:${track.id}:${status}`,
    label: `${artist} — ${title}`,
    source: "queue_public_snapshot",
    kind: "track",
    trackId: track.id,
    status,
    reason: lane === "recapCandidates" ? "Completed public queue track; possible recap item only." : "Public queue track; temporary runtime/site context only.",
  };
}

function buildOperatorLanes(queue: Awaited<ReturnType<typeof readPublicLiveQueueForBnl>>["queue"], dossiers: ReturnType<typeof publicDossiers>) {
  const temporaryRuntimeContext: OperatorLaneItem[] = [
    { id: "queue:open", label: "Queue open/closed", source: "queue_public_snapshot", kind: "queue_status", value: queue.session.queueOpen, reason: "Public queue runtime status." },
    { id: "session:status", label: "Session status", source: "queue_public_snapshot", kind: "session_status", value: queue.session.status, reason: "Public session runtime status." },
    { id: "session:broadcastPhase", label: "Broadcast phase", source: "queue_public_snapshot", kind: "broadcast_phase", value: queue.session.broadcastPhase, reason: "Public broadcast phase runtime status." },
    { id: "queue:activeCount", label: "Active queue count", source: "queue_public_snapshot", kind: "queue_count", value: queue.session.activeCount, reason: "Public count of active queue tracks." },
    { id: "priority:enabled", label: "Priority Signal enabled", source: "queue_public_snapshot", kind: "priority_signal_status", value: queue.session.priorityUpgradesEnabled, reason: "Public feature availability label only, not a payment fact." },
    { id: "priority:label", label: "Priority Signal label", source: "queue_public_snapshot", kind: "priority_signal_label", value: queue.session.priorityUpgradeLabel, reason: "Public queue label only." },
    { id: "wheel:spinsOwed", label: "Wheel spins owed", source: "queue_public_snapshot", kind: "wheel_status", value: queue.session.wheelSpinsOwed, reason: "Public queue runtime status." },
  ];

  if (queue.nowPlaying) temporaryRuntimeContext.push(trackLaneItem(queue.nowPlaying, "nowPlaying", "temporaryRuntimeContext"));
  if (queue.upNext) temporaryRuntimeContext.push(trackLaneItem(queue.upNext, "upNext", "temporaryRuntimeContext"));
  temporaryRuntimeContext.push(...queue.queue.map((track) => trackLaneItem(track, "queued", "temporaryRuntimeContext")));

  const recapCandidates = queue.completed.map((track) => trackLaneItem(track, "completed", "recapCandidates"));
  const publicSafeCopyCandidates: OperatorLaneItem[] = [
    { id: "copy:queue:open", label: "Queue open/closed", source: "queue_public_snapshot", kind: "queue_status", value: queue.session.queueOpen, reason: "High-level public queue copy is safe to reference." },
  ];
  if (queue.nowPlaying) publicSafeCopyCandidates.push(trackLaneItem(queue.nowPlaying, "nowPlaying", "publicSafeCopyCandidates"));
  if (queue.upNext) publicSafeCopyCandidates.push(trackLaneItem(queue.upNext, "upNext", "publicSafeCopyCandidates"));
  publicSafeCopyCandidates.push(...queue.completed.map((track) => trackLaneItem(track, "completed", "publicSafeCopyCandidates")));
  publicSafeCopyCandidates.push(...dossiers.public.map((dossier) => ({
    id: `copy:dossier:${dossier.id}`,
    label: dossier.name,
    source: "public_database_dossier" as const,
    kind: "public_dossier_summary",
    reason: "Published public dossier summary is public site context, not private memory.",
  })));

  return {
    temporaryRuntimeContext,
    recapCandidates,
    broadcastMemoryCandidates: [] as OperatorLaneItem[],
    dossierSeedCandidates: [] as OperatorLaneItem[],
    publicSafeCopyCandidates,
    doNotStore: [
      "queue artist surface is not a permanent profile",
      "queue track presence is not broadcast memory",
      "TikTok handle is not Discord identity",
      "Priority Signal status is not payment fact",
      "public dossier summary is not private dossier seed",
      "website read model is public temporary context",
      "simulation/test tracks are excluded",
      "no private payment/contact/upload/admin data",
    ],
  };
}

const rules = {
  allowedUse: [
    "public-safe BNL context",
    "R&D reference",
    "public replies when relevant",
    "queue/session awareness",
    "artist/track awareness from public queue snapshot",
    "simulation/test tracks are excluded from this read model",
    "operatorLanes are hints, not actions",
    "broadcastMemoryCandidates are drafts only",
    "recapCandidates are possible recap items only",
    "dossierSeedCandidates are possible seeds only",
    "temporaryRuntimeContext should not be stored",
    "BNL must not treat this endpoint as private access",
  ],
  disallowedUse: [
    "private user identity",
    "payment facts",
    "Stripe/session details",
    "contact emails",
    "submitter tokens",
    "private upload URLs",
    "private queue notes",
    "account profiles",
    "Discord identity merging",
    "automatic canon creation",
    "claiming public dossiers exist when not implemented",
    "treating admin simulation data as live/public context",
  ],
  sourceAuthority: {
    queue: "public runtime snapshot with simulation/test filtering",
    artists: "queue-derived public artist surface, not profiles",
    dossiers: "public dossier/database entries only if clearance is PUBLIC",
    operatorLanes: "deterministic public-safe lane hints, not automatic actions",
    sourceContext: "static public site context",
    simulationData: "BNL must treat this read model as live/public context only, not admin simulation data",
  },
};

export async function GET() {
  const liveQueue = await readPublicLiveQueueForBnl();
  const dossiers = publicDossiers();

  return NextResponse.json(
    {
      ok: true,
      version: 1,
      schemaRevision: "1.1",
      generatedAt: new Date().toISOString(),
      scope: "bnl_public_read_model",
      source: "barcode-network-site",
      publicOnly: true,
      sections: {
        sourceContext,
        queue: liveQueue.queue,
        artists: liveQueue.artists,
        dossiers,
        operatorLanes: buildOperatorLanes(liveQueue.queue, dossiers),
        rules,
      },
    },
    {
      headers: {
        "Cache-Control": CACHE_CONTROL,
      },
    },
  );
}
