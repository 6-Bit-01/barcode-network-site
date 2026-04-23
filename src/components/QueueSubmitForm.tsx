"use client";

import { useState, useEffect } from "react";
import { TIERS } from "@/lib/queue-types";
import type { QueueTier } from "@/lib/queue-types";

export function QueueSubmitForm() {
  const [tier, setTier] = useState<QueueTier>("free");
  const [artist, setArtist] = useState("");
  const [title, setTitle] = useState("");
  const [link, setLink] = useState("");
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [freeSuccess, setFreeSuccess] = useState(false);
  const [cutoff, setCutoff] = useState<{ isCutoff: boolean; message: string } | null>(null);

  // Check cutoff status on mount and every 60s
  useEffect(() => {
    async function checkCutoff() {
      try {
        const res = await fetch("/api/queue/cutoff");
        if (res.ok) setCutoff(await res.json());
      } catch { /* silent */ }
    }
    checkCutoff();
    const interval = setInterval(checkCutoff, 60_000);
    return () => clearInterval(interval);
  }, []);

  const isCutoff = cutoff?.isCutoff ?? false;
  const isPaid = tier !== "free";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFreeSuccess(false);

    if (!artist.trim() || !title.trim() || !link.trim()) {
      setError("All fields are required.");
      return;
    }

    try {
      new URL(link);
    } catch {
      setError("Link must be a valid URL (e.g. https://soundcloud.com/...)");
      return;
    }

    setSubmitting(true);

    try {
      if (isPaid) {
        // Paid tier → Stripe checkout
        const res = await fetch("/api/queue/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tier, artist: artist.trim(), title: title.trim(), link: link.trim() }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Checkout failed");

        // Redirect to Stripe
        window.location.href = data.url;
      } else {
        // Free tier → direct submit
        const res = await fetch("/api/queue/free", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ artist: artist.trim(), title: title.trim(), link: link.trim() }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Submission failed");

        // Success — reset form
        setArtist("");
        setTitle("");
        setLink("");
        setConsent(false);
        setFreeSuccess(true);
        setSubmitting(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSubmitting(false);
    }
  }

  const tierOrder: QueueTier[] = ["free", "featured", "fastlane", "frontrow"];

  const tierStyles: Record<QueueTier, { active: string; badge: string }> = {
    free: { active: "border-muted bg-muted/5", badge: "text-muted" },
    featured: { active: "border-accent bg-accent/10", badge: "text-accent" },
    fastlane: { active: "border-[#ffaa00] bg-[#ffaa00]/10", badge: "text-[#ffaa00]" },
    frontrow: { active: "border-danger bg-danger/10", badge: "text-danger" },
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Cutoff Notice */}
      {isCutoff && (
        <div className="border border-danger/40 bg-danger/5 px-4 py-4 text-center">
          <p className="text-sm font-bold text-danger uppercase tracking-wider mb-1">
            &#x25CF; Paid Submissions Closed
          </p>
          <p className="text-xs text-muted">
            {cutoff?.message || "Paid submissions are closed after 11 PM PST. Free submissions still accepted. Queue resets at midnight."}
          </p>
        </div>
      )}

      {/* Free Success Message */}
      {freeSuccess && (
        <div className="border border-accent/40 bg-accent/5 px-4 py-4 text-center">
          <p className="text-sm font-bold text-accent uppercase tracking-wider mb-1">
            ✓ Track Queued
          </p>
          <p className="text-xs text-muted">
            Your free submission is in the queue. Want to skip the line? Upgrade your tier below.
          </p>
        </div>
      )}

      {/* Tier Selection — 4 tiers */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {tierOrder.map((key) => {
          const config = TIERS[key];
          const style = tierStyles[key];
          const isActive = tier === key;
          const isDisabled = key !== "free" && isCutoff;

          return (
            <button
              key={key}
              type="button"
              onClick={() => !isDisabled && setTier(key)}
              disabled={isDisabled}
              className={`relative border p-4 text-left transition-all ${
                isDisabled
                  ? "border-border/30 bg-surface/30 opacity-40 cursor-not-allowed"
                  : isActive
                    ? style.active
                    : "border-border hover:border-accent/30 bg-surface"
              }`}
            >
              {isActive && (
                <span className={`absolute top-2 right-2 w-2 h-2 rounded-full ${style.badge.replace("text-", "bg-")} animate-status-blink`} />
              )}
              <span className={`text-xs font-mono tracking-wider ${style.badge}`}>
                {config.icon}
              </span>
              <h4 className="text-sm font-bold text-foreground mt-1">
                {config.name}
              </h4>
              <p className="text-xs text-muted mt-1 leading-relaxed">{config.description}</p>
              <span className={`text-lg font-bold mt-2 block ${style.badge}`}>
                {config.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Form Fields */}
      <div className="space-y-4">
        <div>
          <label className="block text-xs uppercase tracking-[0.2em] text-muted mb-2">
            Artist Name
          </label>
          <input
            type="text"
            value={artist}
            onChange={(e) => setArtist(e.target.value)}
            placeholder="e.g. 6 Bit"
            maxLength={100}
            className="w-full bg-surface border border-border px-4 py-3 text-sm text-foreground font-mono placeholder:text-muted/40 focus:border-accent focus:outline-none transition-colors"
          />
        </div>

        <div>
          <label className="block text-xs uppercase tracking-[0.2em] text-muted mb-2">
            Track Title
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Late Night"
            maxLength={200}
            className="w-full bg-surface border border-border px-4 py-3 text-sm text-foreground font-mono placeholder:text-muted/40 focus:border-accent focus:outline-none transition-colors"
          />
        </div>

        <div>
          <label className="block text-xs uppercase tracking-[0.2em] text-muted mb-2">
            Link
          </label>
          <input
            type="url"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://soundcloud.com/..."
            className="w-full bg-surface border border-border px-4 py-3 text-sm text-foreground font-mono placeholder:text-muted/40 focus:border-accent focus:outline-none transition-colors"
          />
          <p className="text-xs text-muted/40 mt-1">
            SoundCloud, Spotify, YouTube, or direct link
          </p>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      {/* Consent */}
      <label className="flex items-start gap-3 cursor-pointer group">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5 accent-accent w-4 h-4 shrink-0"
        />
        <span className="text-xs text-muted leading-relaxed group-hover:text-foreground/70 transition-colors">
          {isPaid
            ? "I understand this is a novelty entertainment service. Paid requests are non-refundable. Paid requests that aren't played will carry over to the next stream."
            : "I understand free submissions play only when no paid requests are in the queue, and may be cleared at nightly reset."}
        </span>
      </label>

      {/* Submit */}
      <button
        type="submit"
        disabled={submitting || (isPaid && isCutoff) || !consent}
        className={`w-full inline-flex items-center justify-center gap-3 px-6 py-4 text-sm uppercase tracking-widest font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
          isPaid
            ? "bg-accent text-background hover:bg-accent-dim"
            : "bg-surface border border-accent text-accent hover:bg-accent hover:text-background"
        }`}
      >
        {submitting ? (
          <>Processing...</>
        ) : isPaid && isCutoff ? (
          <>Paid Submissions Closed</>
        ) : isPaid ? (
          <>
            Checkout — {TIERS[tier].label}
          </>
        ) : (
          <>Submit Free Request</>
        )}
      </button>
    </form>
  );
}