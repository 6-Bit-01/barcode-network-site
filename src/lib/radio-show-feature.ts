import { broadcastArchiveArtistHref, broadcastArchiveShowHref } from "./broadcast-archive";
import type { QueuePublicShowStats, QueuePublicStats } from "./queue-types";

export interface RadioFeaturedShow {
  title: string;
  showDate: string;
  href: string;
  tracksPlayed: number;
  artistsHeard: number;
  wheelSpins: number;
  durationSeconds: number | null;
  artists: Array<{ name: string; href: string }>;
}

export interface RadioShowFeature {
  schemaVersion: "radio_show_feature_v1";
  mode: "live" | "archive";
  submissionsOpen: boolean;
  queueHref: string | null;
  show: RadioFeaturedShow | null;
}

export function buildRadioShowFeature(stats: QueuePublicStats, now = Date.now()): RadioShowFeature {
  const empty: RadioShowFeature = {
    schemaVersion: "radio_show_feature_v1", mode: "archive", submissionsOpen: false, queueHref: null, show: null,
  };
  // This feature accepts only the same public, actually-played projection as
  // the Archive. A Finish outcome or a private preview is not an alternative.
  if (stats.visibility !== "public_safe" || stats.catalogScope !== "played_broadcast") return empty;
  const current = stats.currentShow && stats.currentShow.status !== "archived" && stats.currentShow.broadcastPhase !== "ended"
    ? stats.currentShow : null;
  const live = current?.broadcastPhase === "broadcast_active";
  const archived = stats.latestShow?.status === "archived" ? stats.latestShow : null;
  const show = live ? current : archived;
  return {
    ...empty,
    mode: live ? "live" : "archive",
    submissionsOpen: Boolean(current?.submissionsOpen),
    queueHref: current ? `/queue/${encodeURIComponent(current.sessionId)}` : null,
    show: show ? summarizeShow(show, live, now) : null,
  };
}

function summarizeShow(show: QueuePublicShowStats, live: boolean, now: number): RadioFeaturedShow {
  const tracks = [...new Map(show.trackRoster
    .filter((track) => track.sessionId === show.sessionId && !track.isSimulation)
    .map((track) => [track.trackId, track])).values()];
  const artists = [...new Map(tracks.map((track) => [track.projectKey, track.projectLabel])).values()];
  const events = [...new Map(show.milestones
    .filter((event) => event.sessionId === show.sessionId)
    .map((event) => [event.eventId, event])).values()];
  const timestamps = (type: "broadcast_started" | "session_archived") => events
    .filter((event) => event.eventType === type)
    .map((event) => Date.parse(event.occurredAt)).filter(Number.isFinite);
  const starts = timestamps("broadcast_started");
  const ends = timestamps("session_archived");
  const start = starts.length ? Math.min(...starts) : null;
  const end = live ? now : ends.length ? Math.max(...ends) : null;
  return {
    title: show.title,
    showDate: show.showDate,
    href: live ? "/radio/deck" : broadcastArchiveShowHref(show.sessionId),
    tracksPlayed: tracks.length,
    artistsHeard: artists.length,
    wheelSpins: events.filter((event) => event.eventType === "wheel_spun").length,
    durationSeconds: start !== null && end !== null && end >= start ? Math.floor((end - start) / 1000) : null,
    artists: artists.slice(0, 4).map((name) => ({ name, href: broadcastArchiveArtistHref(name) })),
  };
}

export function radioShowDate(value: string): string {
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(date)
    : value;
}

export function radioShowDuration(seconds: number | null): string {
  if (seconds === null) return "—";
  const minutes = Math.floor(seconds / 60);
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;
}
