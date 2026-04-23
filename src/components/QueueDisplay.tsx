"use client";

import { useQueue } from "./useQueue";
import { TIERS, normalizeTier } from "@/lib/queue-types";
import type { QueueEntry, QueueTier } from "@/lib/queue-types";

function TierBadge({ tier: rawTier }: { tier: QueueTier }) {
  const tier = normalizeTier(rawTier);
  const config = TIERS[tier];
  const colors: Record<QueueTier, string> = {
    free: "border-muted/30 text-muted",
    featured: "border-accent/40 text-accent",
    fastlane: "border-[#ffaa00]/40 text-[#ffaa00]",
    frontrow: "border-danger/40 text-danger",
  };

  return (
    <span
      className={`text-xs uppercase tracking-wider px-2 py-0.5 border font-mono ${colors[tier]}`}
    >
      {config.icon} {config.name}
    </span>
  );
}

function NowPlayingCard({ entry }: { entry: QueueEntry }) {
  return (
    <div className="border border-accent/40 bg-accent/5 p-6 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-0.5 bg-accent animate-glow-breathe" />
      <div className="flex items-center gap-3 mb-3">
        <span className="relative flex h-3 w-3">
          <span className="absolute inline-flex h-full w-full rounded-full bg-accent opacity-75 animate-ping" />
          <span className="relative inline-flex rounded-full h-3 w-3 bg-accent" />
        </span>
        <span className="text-xs uppercase tracking-[0.3em] text-accent font-bold">
          Now Playing
        </span>
      </div>
      <h3 className="text-lg font-bold text-foreground">{entry.title}</h3>
      <p className="text-sm text-muted mt-1">by {entry.artist}</p>
      <div className="flex items-center gap-3 mt-3">
        <TierBadge tier={entry.tier} />
        {entry.link && (
          <a
            href={entry.link}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-accent/60 hover:text-accent transition-colors uppercase tracking-wider"
          >
            Source →
          </a>
        )}
      </div>
    </div>
  );
}

function QueueRow({ entry, position }: { entry: QueueEntry; position: number }) {
  return (
    <div className="flex items-center gap-4 border border-border bg-surface px-4 py-3 hover:border-accent/20 transition-colors">
      <span className="text-lg font-bold text-muted/30 w-8 text-right font-mono">
        {String(position).padStart(2, "0")}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-foreground truncate">
            {entry.title}
          </span>
          <TierBadge tier={entry.tier} />
        </div>
        <span className="text-xs text-muted">{entry.artist}</span>
      </div>
    </div>
  );
}

function HistoryRow({ entry }: { entry: QueueEntry }) {
  return (
    <div className="flex items-center gap-4 border border-border/50 bg-surface/50 px-4 py-2 opacity-50">
      <span className="text-xs text-muted/40 font-mono">✓</span>
      <div className="flex-1 min-w-0">
        <span className="text-xs text-muted truncate">
          {entry.artist} — {entry.title}
        </span>
      </div>
      <span className="text-xs text-muted/40 font-mono">
        {entry.playedAt
          ? new Date(entry.playedAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })
          : ""}
      </span>
    </div>
  );
}

export function QueueDisplay() {
  const { state, loading, error } = useQueue();

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="border border-border bg-surface p-6 animate-pulse">
          <div className="h-4 bg-muted/10 rounded w-1/3 mb-3" />
          <div className="h-6 bg-muted/10 rounded w-2/3 mb-2" />
          <div className="h-4 bg-muted/10 rounded w-1/4" />
        </div>
        {[1, 2, 3].map((i) => (
          <div key={i} className="border border-border bg-surface p-4 animate-pulse">
            <div className="h-4 bg-muted/10 rounded w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  if (error || !state) {
    return (
      <div className="border border-danger/30 bg-danger/5 p-6 text-center">
        <p className="text-sm text-danger">
          {error || "Queue unavailable"}
        </p>
        <p className="text-xs text-muted mt-2">
          Queue data will appear here when the system is connected.
        </p>
      </div>
    );
  }

  const { nowPlaying, queue, history, totalPlayed, streamStatus } = state;

  return (
    <div className="space-y-8">
      {/* Stream Status */}
      <div className="flex items-center gap-3">
        <span
          className={`relative flex h-2.5 w-2.5 ${
            streamStatus === "online" ? "" : ""
          }`}
        >
          {streamStatus === "online" && (
            <span className="absolute inline-flex h-full w-full rounded-full bg-accent opacity-75 animate-ping" />
          )}
          <span
            className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
              streamStatus === "online" ? "bg-accent" : "bg-muted/30"
            }`}
          />
        </span>
        <span
          className={`text-xs uppercase tracking-[0.3em] font-bold ${
            streamStatus === "online"
              ? "text-accent text-glow"
              : "text-muted/50"
          }`}
        >
          AI Stream — {streamStatus === "online" ? "LIVE" : "OFFLINE"}
        </span>
        {totalPlayed > 0 && (
          <span className="text-xs text-muted/40 font-mono ml-auto">
            {totalPlayed} played
          </span>
        )}
      </div>

      {/* Now Playing */}
      {nowPlaying ? (
        <NowPlayingCard entry={nowPlaying} />
      ) : (
        <div className="border border-border bg-surface p-6 text-center">
          <p className="text-sm text-muted/50 uppercase tracking-wider">
            {streamStatus === "online"
              ? "Waiting for next track..."
              : "No track playing"}
          </p>
        </div>
      )}

      {/* Queue */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-status-blink" />
          <h3 className="text-xs uppercase tracking-[0.3em] text-accent font-bold">
            Up Next
          </h3>
          <span className="text-xs text-muted/40 font-mono ml-auto">
            {queue.length} in queue
          </span>
        </div>

        {queue.length > 0 ? (
          <div className="space-y-2">
            {queue.map((entry, i) => (
              <QueueRow key={entry.id} entry={entry} position={i + 1} />
            ))}
          </div>
        ) : (
          <div className="border border-border bg-surface p-4 text-center">
            <p className="text-xs text-muted/40 uppercase tracking-wider">
              Queue empty — submit a request
            </p>
          </div>
        )}
      </div>

      {/* History */}
      {history.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <h3 className="text-xs uppercase tracking-[0.3em] text-muted/50">
              Recently Played
            </h3>
          </div>
          <div className="space-y-1">
            {history.slice(0, 10).map((entry) => (
              <HistoryRow key={entry.id} entry={entry} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}