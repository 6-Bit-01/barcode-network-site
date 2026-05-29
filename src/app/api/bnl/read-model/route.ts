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
>;

function publicTrack(track: QueuePublicTrack | null | undefined): BnlQueueTrack | null {
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
  };
}

function isRealQueueEntry(entry: QueueEntry | null | undefined): entry is QueueEntry {
  return Boolean(entry && entry.isTestTrack !== true);
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
      nowPlaying: publicTrack(nowPlaying),
      upNext: publicTrack(upNext),
      queue: publicQueueTracks.map(publicTrack).filter((track): track is BnlQueueTrack => Boolean(track)),
      completed: publicCompletedTracks.map(publicTrack).filter((track): track is BnlQueueTrack => Boolean(track)),
    },
    artists: artistsFromTracks(nowPlaying, upNext, publicQueueTracks, publicCompletedTracks),
  };
}

function normalizeArtistName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
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
    }));

  if (publicEntries.length === 0) {
    return {
      implemented: false,
      public: [],
      note: "Public dossier runtime is not implemented yet.",
    };
  }

  return {
    implemented: true,
    public: publicEntries,
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

const rules = {
  allowedUse: [
    "public-safe BNL context",
    "R&D reference",
    "public replies when relevant",
    "queue/session awareness",
    "artist/track awareness from public queue snapshot",
    "simulation/test tracks are excluded from this read model",
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
    queue: "public runtime snapshot with read-model-only simulation/test filtering",
    artists: "derived from read-model-filtered public queue fields",
    dossiers: "public dossier runtime only if implemented",
    sourceContext: "static public site context",
    simulationData: "BNL must treat this read model as live/public context only, not admin simulation data",
  },
};

export async function GET() {
  const liveQueue = await readPublicLiveQueueForBnl();

  return NextResponse.json(
    {
      ok: true,
      version: 1,
      generatedAt: new Date().toISOString(),
      scope: "bnl_public_read_model",
      source: "barcode-network-site",
      publicOnly: true,
      sections: {
        sourceContext,
        queue: liveQueue.queue,
        artists: liveQueue.artists,
        dossiers: publicDossiers(),
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
