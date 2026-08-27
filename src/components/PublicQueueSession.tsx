/* eslint-disable react-hooks/exhaustive-deps, @next/next/no-img-element */
"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import { RadioQueueForm } from "@/components/RadioQueueForm";
import { useLiveStatus } from "@/components/LiveStatusProvider";
import { externalLinks } from "@/content";
import { estimateExistingTrackTiming, estimatePriorityImpact } from "@/lib/queue-timing";
import { clearPriorityCheckoutOwnerToken, getOrCreatePriorityCheckoutOwnerToken, getPriorityCheckoutOwnerToken } from "@/lib/priority-checkout-client";
import { clearSignalHoldCheckoutOwnerToken, getOrCreateSignalHoldCheckoutOwnerToken, getSignalHoldCheckoutOwnerToken } from "@/lib/signal-hold-checkout-client";
import { broadcastArchiveArtistHref } from "@/lib/broadcast-archive";
import { confirmedPriorityPurchaseDisplay, formatRuntime, isSignalHoldCheckoutNearFront, PRIORITY_DISCLOSURE_TEXT, PRIORITY_GIFT_ATTRIBUTION_DISCLOSURE_TEXT, PRIORITY_GIFT_ATTRIBUTION_VERSION, PRIORITY_GIFT_NAME_MAX_LENGTH, PRIORITY_TERMS_VERSION, SIGNAL_HOLD_DISCLOSURE_TEXT, SIGNAL_HOLD_NEXT_TWO_UNAVAILABLE_MESSAGE, SIGNAL_HOLD_TERMS_VERSION } from "@/lib/queue-types";
import { displayEstimate, buildQueueTimingDisplay, priorityDisplayFromImpact, publicTrackDurationLabel, queueTimingInputFromPublicSnapshot, type QueueTimingDisplaySummary, type PriorityTimingDisplay } from "@/lib/queue-timing-display";
import type { QueuePublicSnapshot, QueuePublicTrack } from "@/lib/queue-types";
import { PUBLIC_QUEUE_POLL_INTERVAL_MS } from "@/lib/redis-polling-budget";
import { hasActiveQueueSession, startSessionBoundPolling } from "@/lib/session-bound-polling";

type QueueView = "active" | "recent";
type ActivityTone = "red" | "amber" | "gold" | "cyan" | "archive" | "danger";
type QueueActivity = { id: string; text: string; detail: string; tone: ActivityTone; createdAt: number };
type ResidueMap = Record<string, { tone: ActivityTone; nonce: number }>;
type PublicSubmissionReceipt = { artist: string; title: string; sessionTitle: string; sessionDate: string; trackCode: string };

const PRIORITY_SIGNAL_LABEL = "Priority Signal";
const MIN_PRIORITY_ACTIVE_DEPTH = 2;

function stableHash(seed: string): number {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  return hash;
}

function stableVariant<T>(seed: string, variants: T[]): T {
  return variants[stableHash(seed) % variants.length] ?? variants[0];
}

function pressureLevel(summary: QueueTimingDisplaySummary | null): "low" | "medium" | "high" {
  if (!summary || !summary.pressureSummary.isLive) return "low";
  if (summary.pressureSummary.level === "critical" || summary.pressureSummary.level === "high") return "high";
  if (summary.pressureSummary.level === "medium") return "medium";
  return "low";
}

type PublicActionVariant = { label: string; detail: string; mode: string; kind: "intake" | "payment" };

function actionVariant(seed: string, kind: "intake" | "upgrade" | "resume"): PublicActionVariant {
  const variants: Record<"intake" | "upgrade" | "resume", PublicActionVariant[]> = {
    intake: [
      { label: "SUBMIT TRACK", detail: "SEND YOUR SONG INTO THE FREE QUEUE", mode: "INTAKE READY", kind: "intake" },
      { label: "SUBMIT TRACK", detail: "FREE SUBMISSION INTO THE BARCODE QUEUE", mode: "INTAKE READY", kind: "intake" },
      { label: "SUBMIT TRACK", detail: "SEND YOUR SONG INTO THE FREE QUEUE", mode: "INTAKE READY", kind: "intake" },
    ],
    upgrade: [
      { label: "PRIORITY SIGNAL", detail: "PAID SKIP · CHECKOUT STARTED", mode: "SKIP ACTIVE AFTER PAYMENT CLEARS", kind: "payment" },
      { label: "PRIORITY SIGNAL", detail: "PAID SKIP · CHECKOUT STARTED", mode: "SKIP ACTIVE AFTER PAYMENT CLEARS", kind: "payment" },
    ],
    resume: [
      { label: "RESUME PRIORITY PAYMENT", detail: "FINISH CHECKOUT TO ACTIVATE YOUR SKIP", mode: "SKIP ACTIVE AFTER PAYMENT CLEARS", kind: "payment" },
      { label: "RESUME PRIORITY PAYMENT", detail: "FINISH CHECKOUT TO ACTIVATE YOUR SKIP", mode: "SKIP ACTIVE AFTER PAYMENT CLEARS", kind: "payment" },
    ],
  };
  return stableVariant(`${seed}:${kind}`, variants[kind]);
}
function formatPrice(cents: number, currency = "usd"): string { return `${new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(Math.max(0, cents) / 100)} ${currency.toUpperCase()}`; }
function snapshotBroadcastActive(snapshot: QueuePublicSnapshot | null): boolean {
  return Boolean(snapshot?.nowPlaying || snapshot?.session?.broadcastPhase === "broadcast_active" || snapshot?.session?.showStarted);
}


type GhostRect = { left: number; top: number; width: number; height: number };
type FlipTrackRect = { rect: DOMRect; zone: string; tone: ActivityTone; artist: string; title: string; routeLabel: string };
type RoutingGhost = { id: string; trackId: string; artist: string; title: string; routeLabel: string; tone: ActivityTone; zone: string; from: GhostRect; to: GhostRect; duration: number };

function trackFlipTone(track: QueuePublicTrack, zone: string): ActivityTone {
  if (zone === "now") return "gold";
  if (zone === "next") return trackTone(track);
  if (zone === "completed") return "archive";
  return trackTone(track);
}

function collectVisibleTrackRects(): Map<string, FlipTrackRect> {
  const rects = new Map<string, FlipTrackRect>();
  document.querySelectorAll<HTMLElement>("[data-track-card='true'][data-track-id]").forEach((node) => {
    const trackId = node.dataset.trackId;
    if (!trackId) return;
    const rect = node.getBoundingClientRect();
    const isVisible = rect.width > 0 && rect.height > 0 && rect.bottom >= 0 && rect.top <= window.innerHeight;
    if (!isVisible) return;
    const tone = (node.dataset.trackTone ?? "red") as ActivityTone;
    rects.set(trackId, {
      rect,
      zone: node.dataset.trackZone ?? "queue",
      tone,
      artist: node.dataset.trackArtist ?? "BARCODE signal",
      title: node.dataset.trackTitle ?? "Submission packet",
      routeLabel: node.dataset.trackLabel ?? node.dataset.trackZone ?? "Signal route",
    });
  });
  return rects;
}

function rectToGhostRect(rect: DOMRect): GhostRect {
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

function useFlipTrackMovement(snapshotKey: string, emitGhost: (ghost: Omit<RoutingGhost, "id">) => void): () => void {
  const previousRectsRef = useRef<Map<string, FlipTrackRect>>(new Map());
  const primedRef = useRef(false);

  const captureTrackRects = () => {
    if (typeof window === "undefined") return;
    const rects = collectVisibleTrackRects();
    previousRectsRef.current = rects;
    primedRef.current = rects.size > 0;
  };

  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const previousRects = previousRectsRef.current;
    const currentRects = collectVisibleTrackRects();

    if (!reducedMotion && primedRef.current) {
      const currentNodes = new Map<string, HTMLElement>();
      document.querySelectorAll<HTMLElement>("[data-track-card='true'][data-track-id]").forEach((node) => {
        if (node.dataset.trackId) currentNodes.set(node.dataset.trackId, node);
      });
      currentRects.forEach((current, trackId) => {
        const previous = previousRects.get(trackId);
        const node = currentNodes.get(trackId);
        if (!node) return;
        const moved = previous && (Math.abs(previous.rect.left - current.rect.left) > 2 || Math.abs(previous.rect.top - current.rect.top) > 2);
        node.dataset.routeTone = current.tone;
        node.dataset.routeZone = current.zone;
        if (moved) {
          const dx = previous.rect.left - current.rect.left;
          const dy = previous.rect.top - current.rect.top;
          const sameZone = previous.zone === current.zone;
          const distance = Math.hypot(dx, dy);
          node.dataset.routeMotion = sameZone ? "reorder" : "transfer";
          const routeDuration = current.zone === "now" ? 980 : current.zone === "next" ? 900 : 820;
          if (!sameZone && distance > 2) {
            emitGhost({
              trackId,
              artist: current.artist || previous.artist,
              title: current.title || previous.title,
              routeLabel: current.routeLabel,
              tone: current.tone,
              zone: current.zone,
              from: rectToGhostRect(previous.rect),
              to: rectToGhostRect(current.rect),
              duration: routeDuration,
            });
            window.setTimeout(() => node.classList.add("route-arrival"), Math.max(180, routeDuration - 280));
          }
          node.style.transition = "none";
          node.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
          node.style.zIndex = "30";
          node.classList.add("flip-routing");
          window.requestAnimationFrame(() => {
            node.style.transition = "transform 720ms cubic-bezier(.16,1,.3,1), filter 720ms ease, box-shadow 720ms ease";
            node.style.transform = "translate3d(0, 0, 0)";
          });
          window.setTimeout(() => {
            node.classList.remove("flip-routing", "route-arrival");
            node.removeAttribute("data-route-motion");
            node.style.transition = "";
            node.style.transform = "";
            node.style.zIndex = "";
          }, sameZone ? 760 : routeDuration + 160);
          return;
        }
        if (!previous) {
          node.dataset.routeMotion = "landing";
          node.classList.add("flip-landing", "route-arrival");
          window.setTimeout(() => {
            node.classList.remove("flip-landing", "route-arrival");
            node.removeAttribute("data-route-motion");
          }, 860);
        }
      });
    }

    previousRectsRef.current = currentRects;
    primedRef.current = true;
  }, [snapshotKey]);

  return captureTrackRects;
}

function sourceTypeLabel(track: QueuePublicTrack): string {
  if (track.sourceType === "upload") return "Uploaded audio packet";
  if (track.sourceType === "spotify") return "Spotify";
  if (track.sourceType === "soundcloud") return "SoundCloud";
  if (track.sourceType === "youtube") return "YouTube";
  if (track.sourceType === "tiktok") return "TikTok";
  return track.sourceType ? track.sourceType.toUpperCase() : "Track link";
}

export function PublicQueueSession({ sessionId, snapshotEndpoint = "/api/queue" }: { sessionId: string; snapshotEndpoint?: string }) {
  const [snapshot, setSnapshot] = useState<QueuePublicSnapshot | null>(null);
  const { streamUrl } = useLiveStatus();
  const [submitOpen, setSubmitOpen] = useState(false);
  const [intakeScrollLocked, setIntakeScrollLocked] = useState(false);
  const [lastSubmittedTrackId, setLastSubmittedTrackId] = useState<string | null>(null);
  const [submitterToken, setSubmitterToken] = useState("");
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [view, setView] = useState<QueueView>("active");
  const [mounted, setMounted] = useState(false);
  const [priorityModalTrack, setPriorityModalTrack] = useState<QueuePublicTrack | null>(null);
  const [priorityRequestPending, setPriorityRequestPending] = useState(false);
  const [priorityRequestMessage, setPriorityRequestMessage] = useState<string | null>(null);
  const [priorityCheckoutOwnerTrackIds, setPriorityCheckoutOwnerTrackIds] = useState<Set<string>>(() => new Set());
  const [signalHoldModalTrack, setSignalHoldModalTrack] = useState<PublicTrackSummary | null>(null);
  const [signalHoldRequestPending, setSignalHoldRequestPending] = useState(false);
  const [signalHoldRequestMessage, setSignalHoldRequestMessage] = useState<string | null>(null);
  const [signalHoldCheckoutOwnerTrackIds, setSignalHoldCheckoutOwnerTrackIds] = useState<Set<string>>(() => new Set());
  const [checkoutNotice, setCheckoutNotice] = useState<string | null>(null);
  const [actionTransition, setActionTransition] = useState<PublicActionVariant | null>(null);
  const [activity, setActivity] = useState<QueueActivity[]>([]);
  const [activityToast, setActivityToast] = useState<QueueActivity | null>(null);
  const [residueMap, setResidueMap] = useState<ResidueMap>({});
  const [broadcastStartPulse, setBroadcastStartPulse] = useState(false);
  const [wheelUnlockPulse, setWheelUnlockPulse] = useState(false);
  const [routingGhosts, setRoutingGhosts] = useState<RoutingGhost[]>([]);
  const [publicHudMinimized, setPublicHudMinimized] = useState(false);
  const [acceptedReceipt, setAcceptedReceipt] = useState<PublicSubmissionReceipt | null>(null);
  const previousSnapshotRef = useRef<QueuePublicSnapshot | null>(null);
  const snapshotMovementKey = useMemo(() => publicSnapshotMovementKey(snapshot), [snapshot]);
  function emitRoutingGhost(ghost: Omit<RoutingGhost, "id">) {
    const id = `${Date.now()}:${ghost.trackId}:${ghost.zone}`;
    setRoutingGhosts((current) => [...current, { ...ghost, id }].slice(-5));
    window.setTimeout(() => setRoutingGhosts((current) => current.filter((item) => item.id !== id)), ghost.duration + 180);
  }
  useEffect(() => {
    if (!acceptedReceipt) return;
    const timer = window.setTimeout(() => setAcceptedReceipt(null), 18000);
    return () => window.clearTimeout(timer);
  }, [acceptedReceipt]);

  const captureTrackRects = useFlipTrackMovement(snapshotMovementKey, emitRoutingGhost);

  function triggerResidue(trackId: string | null | undefined, tone: ActivityTone) {
    if (!trackId) return;
    const nonce = Date.now();
    setResidueMap((current) => ({ ...current, [trackId]: { tone, nonce } }));
    window.setTimeout(() => {
      setResidueMap((current) => current[trackId]?.nonce === nonce ? Object.fromEntries(Object.entries(current).filter(([id]) => id !== trackId)) as ResidueMap : current);
    }, 1050);
  }

  function pushActivities(items: Omit<QueueActivity, "id" | "createdAt">[]) {
    if (items.length === 0) return;
    const createdAt = Date.now();
    const nextItems = items.map((item, index) => ({ ...item, id: `${createdAt}:${index}:${item.text}`, createdAt }));
    setActivity((current) => [...nextItems, ...current].slice(0, 4));
    setActivityToast(nextItems[0] ?? null);
    window.setTimeout(() => setActivityToast((current) => current?.id === nextItems[0]?.id ? null : current), 3200);
  }

  function processSnapshotChanges(previous: QueuePublicSnapshot | null, next: QueuePublicSnapshot) {
    if (!previous) return;
    const changes: Omit<QueueActivity, "id" | "createdAt">[] = [];
    if (!snapshotBroadcastActive(previous) && snapshotBroadcastActive(next)) {
      changes.push({ text: "HOST BAND LOCKED", detail: "BROADCAST PROTOCOL ONLINE", tone: "gold" });
      setBroadcastStartPulse(true);
      window.setTimeout(() => setBroadcastStartPulse(false), 1800);
      triggerResidue(next.nowPlaying?.id, next.nowPlaying ? trackTone(next.nowPlaying) : "gold");
      triggerResidue(next.upNext?.id, next.upNext ? trackTone(next.upNext) : "gold");
    }
    const previousTracks = publicTrackStateMap(previous);
    const previousWheelSpinsOwed = previous.session?.wheelSpinsOwed ?? 0;
    const nextWheelSpinsOwed = next.session?.wheelSpinsOwed ?? 0;
    if (nextWheelSpinsOwed > previousWheelSpinsOwed) {
      changes.push({ text: "10K Tap Wheel Unlocked", detail: "Wheel Spins Unlocked count increased.", tone: "cyan" });
      setWheelUnlockPulse(true);
      window.setTimeout(() => setWheelUnlockPulse(false), 1500);
    }
    if (previous.status.isOpen !== next.status.isOpen) {
      changes.push(next.status.isOpen ? { text: "Submissions opened", detail: "Intake corridor unlocked.", tone: "red" } : { text: "Submissions closed", detail: "Intake gate sealed.", tone: "danger" });
    }
    if (previous.nowPlaying?.id !== next.nowPlaying?.id && next.nowPlaying) {
      changes.push({ text: "Now Playing updated", detail: "Host loaded a song.", tone: trackTone(next.nowPlaying) });
      triggerResidue(next.nowPlaying.id, trackTone(next.nowPlaying));
    }
    if (previous.upNext?.id !== next.upNext?.id && next.upNext) {
      changes.push({ text: "Next In Line updated", detail: "Coming up next.", tone: trackTone(next.upNext) });
      triggerResidue(next.upNext.id, trackTone(next.upNext));
    }
    for (const track of next.queue) {
      const before = previousTracks.get(track.id);
      if (!before) {
        changes.push({ text: "Submission Accepted", detail: "Song entered the free queue.", tone: "red" });
        triggerResidue(track.id, "red");
        continue;
      }
      if (before.lane !== track.lane && track.lane === "wheel") {
        changes.push({ text: "Wheel Chosen", detail: "Picked from the 10K tap wheel.", tone: "cyan" });
        triggerResidue(track.id, "cyan");
      }
    }
    for (const track of publicTrackStateMap(next).values()) {
      const before = previousTracks.get(track.id);
      if (!before) continue;
      if (before.priorityUpgradeStatus !== track.priorityUpgradeStatus) {
        if (track.priorityUpgradeStatus === "checkout_pending") {
          changes.push({ text: "Payment Processing", detail: "Checkout started. Skip is not active yet.", tone: "amber" });
          triggerResidue(track.id, "amber");
        }
        if (track.priorityUpgradeStatus === "paid_needs_attention") {
          changes.push({ text: "Priority payment needs attention", detail: "Payment cleared, but Priority is not active.", tone: "danger" });
          triggerResidue(track.id, "danger");
        } else if (isActivePublicPriority(track)) {
          const purchase = confirmedPriorityPurchaseDisplay(track);
          changes.push({ text: purchase?.text ?? "Priority Signal confirmed", detail: purchase ? "Payment cleared. Priority Signal active." : "Manual Priority Signal active.", tone: "gold" });
          triggerResidue(track.id, "gold");
        }
        if (track.priorityUpgradeStatus === "failed" || track.priorityUpgradeStatus === "refunded") {
          changes.push({ text: "Priority Signal not completed", detail: "Payment was not completed. Your song stays in the free queue if still active.", tone: "danger" });
          triggerResidue(track.id, "danger");
        }
      }
    }
    const previousCompleted = new Set(previous.completed.map((track) => track.id));
    for (const track of next.completed) {
      if (!previousCompleted.has(track.id)) {
        changes.push({ text: "Played Tonight", detail: "Song already played.", tone: "archive" });
        triggerResidue(track.id, "archive");
      }
    }
    const previousActive = new Set([previous.nowPlaying?.id, previous.upNext?.id, ...previous.queue.map((track) => track.id)].filter(Boolean));
    const nextKnown = new Set([next.nowPlaying?.id, next.upNext?.id, ...next.queue.map((track) => track.id), ...next.completed.map((track) => track.id)].filter(Boolean));
    const removedCountIncreased = (next.session?.removedCount ?? 0) > (previous.session?.removedCount ?? 0);
    if (removedCountIncreased && [...previousActive].some((id) => !nextKnown.has(id))) {
      changes.push({ text: "Removed from active queue", detail: "Submission no longer active.", tone: "danger" });
    }
    pushActivities(dedupeActivities(changes).slice(0, 4));
  }

  async function load() {
    const params = new URLSearchParams({ sessionId });
    if (submitterToken) params.set("submitterToken", submitterToken);
    const endpoint = new URL(snapshotEndpoint, window.location.origin);
    params.forEach((value, key) => endpoint.searchParams.set(key, value));
    const res = await fetch(`${endpoint.pathname}${endpoint.search}`, { cache: "no-store" });
    if (res.ok) {
      const next = await res.json() as QueuePublicSnapshot;
      captureTrackRects();
      processSnapshotChanges(previousSnapshotRef.current, next);
      previousSnapshotRef.current = next;
      setSnapshot(next);
      return hasActiveQueueSession(next);
    }
    return null;
  }

  useEffect(() => {
    setMounted(true);
    setSubmitterToken(window.localStorage.getItem("barcode-radio-submitter-token") ?? "");
    const priorityResult = new URLSearchParams(window.location.search).get("priority");
    if (priorityResult === "cancelled") setCheckoutNotice("Payment was not completed. Your song stays in the free queue if still active.");
    if (priorityResult === "processing") setCheckoutNotice("Checkout started. Skip is not active yet.");
    const signalHoldResult = new URLSearchParams(window.location.search).get("signalHold");
    if (signalHoldResult === "cancelled") setCheckoutNotice("Signal Hold payment was not completed. Your track remains unprotected.");
    if (signalHoldResult === "processing") setCheckoutNotice("Checkout started. Signal Hold is not active yet.");
  }, []);
  useEffect(() => startSessionBoundPolling({ intervalMs: PUBLIC_QUEUE_POLL_INTERVAL_MS, poll: load }), [sessionId, snapshotEndpoint, submitterToken]);
  useEffect(() => { const interval = window.setInterval(() => setClockNow(Date.now()), 1_000); return () => window.clearInterval(interval); }, []);
  useEffect(() => {
    if (!snapshot) return;
    const ownerTrackIds = new Set(
      uniqueActiveTracks(snapshot)
        .filter((track) => Boolean(getPriorityCheckoutOwnerToken(sessionId, track.id)))
        .map((track) => track.id),
    );
    setPriorityCheckoutOwnerTrackIds(ownerTrackIds);
    const signalHoldOwnerTrackIds = new Set(
      uniqueActiveTracks(snapshot)
        .filter((track) => Boolean(getSignalHoldCheckoutOwnerToken(sessionId, track.id)))
        .map((track) => track.id),
    );
    setSignalHoldCheckoutOwnerTrackIds(signalHoldOwnerTrackIds);
  }, [sessionId, snapshot?.revision]);
  useEffect(() => {
    if (!submitOpen || !intakeScrollLocked) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [submitOpen, intakeScrollLocked]);

  const lanes = useMemo(() => {
    const hidden = new Set([snapshot?.nowPlaying?.id, snapshot?.upNext?.id].filter(Boolean));
    const queue = (snapshot?.queue ?? []).filter((track) => !hidden.has(track.id));
    const paidPriority = (track: typeof queue[number]) => track.lane === "priority" && (track.priorityUpgradeStatus === "paid" || track.priorityUpgradeStatus === "manual");
    return {
      priority: queue.filter(paidPriority),
      wheel: queue.filter((track) => track.lane === "wheel"),
      regular: queue.filter((track) => track.lane === "regular" || (track.lane === "priority" && !paidPriority(track))),
    };
  }, [snapshot]);

  const isOpen = snapshot?.status.isOpen ?? false;
  const isEnded = snapshot?.session?.status === "archived" || snapshot?.session?.broadcastPhase === "ended";
  const isBroadcastActive = snapshotBroadcastActive(snapshot);
  const isFull = Boolean(snapshot?.status.isFull || (snapshot && (snapshot.status.acceptedCount ?? snapshot.status.activeCount) >= snapshot.status.capacity));
  const submitterRemaining = snapshot?.submitterStatus?.remaining;
  const isSubmitLimitReached = typeof submitterRemaining === "number" && submitterRemaining <= 0;
  const canSubmitFromHud = !isEnded && isOpen && !isFull && (!snapshot?.submitterStatus || !isSubmitLimitReached);
  const hudSubmitLabel = !isOpen ? "Submissions Closed" : isFull ? "Queue Full" : isSubmitLimitReached ? "Submission Limit Reached" : "Submit Track";
  const viewerSubmittedTrackIds = useMemo(() => {
    const ids = new Set<string>();
    if (lastSubmittedTrackId) ids.add(lastSubmittedTrackId);
    (snapshot?.submitterStatus?.submitted ?? []).forEach((track) => ids.add(track.id));
    return ids;
  }, [lastSubmittedTrackId, snapshot?.submitterStatus?.submitted]);
  const completedRuntime = snapshot?.session?.completedRuntimeSeconds ?? 0;
  const priorityUpgradeEnabled = snapshot?.session?.priorityUpgradesEnabled === true;
  const priorityPaymentsEnabled = snapshot?.session?.priorityUpgradePaymentsEnabled === true && (snapshot?.session?.priorityUpgradePriceCents ?? 0) > 0;
  const priorityPaymentsAvailable = priorityUpgradeEnabled && priorityPaymentsEnabled;
  const priorityUpgradeAvailable = priorityPaymentsAvailable && (snapshot?.status.activeCount ?? 0) >= MIN_PRIORITY_ACTIVE_DEPTH;
  const priorityPriceCents = snapshot?.session?.priorityUpgradePriceCents ?? 0;
  const priorityCurrency = snapshot?.session?.priorityUpgradeCurrency ?? "usd";
  const signalHoldEnabled = snapshot?.session?.signalHoldEnabled === true;
  const signalHoldPaymentsEnabled = snapshot?.session?.signalHoldPaymentsEnabled === true && (snapshot?.session?.signalHoldPriceCents ?? 0) > 0;
  const signalHoldPaymentsAvailable = signalHoldEnabled && signalHoldPaymentsEnabled && !isEnded;
  const signalHoldPriceCents = snapshot?.session?.signalHoldPriceCents ?? 0;
  const signalHoldCurrency = snapshot?.session?.signalHoldCurrency ?? "usd";
  const timingInput = useMemo(() => queueTimingInputFromPublicSnapshot(snapshot), [snapshot]);
  const timingSummary = useMemo(() => buildQueueTimingDisplay(timingInput, { priorityEligible: priorityUpgradeAvailable, now: new Date(clockNow) }), [timingInput, priorityUpgradeAvailable, clockNow]);
  const sponsorBreakRunning = snapshot?.session?.sponsorBreakStatus === "running";

  const frontEdgeFreeTrackId = lanes.priority.length === 0 && lanes.wheel.length === 0 ? lanes.regular[0]?.id ?? null : null;

  function canShowPriorityUpgrade(track: QueuePublicTrack): boolean {
    if (!priorityUpgradeAvailable || isEnded || snapshot?.session?.status !== "open") return false;
    if (track.lane !== "regular") return false;
    if (track.id === snapshot?.nowPlaying?.id || track.id === snapshot?.upNext?.id) return false;
    if (track.id === frontEdgeFreeTrackId) return false;
    return track.priorityUpgradeStatus === undefined || track.priorityUpgradeStatus === "none" || track.priorityUpgradeStatus === "failed" || track.priorityUpgradeStatus === "refunded";
  }

  function canResumePriorityPayment(track: QueuePublicTrack): boolean {
    if (!priorityPaymentsAvailable || isEnded || snapshot?.session?.status !== "open") return false;
    return track.priorityUpgradeStatus === "checkout_pending" && priorityCheckoutOwnerTrackIds.has(track.id);
  }

  function runPublicActionTransition(transition: PublicActionVariant, action: () => void, delay = 1200) {
    setActionTransition(transition);
    window.setTimeout(() => {
      setActionTransition(null);
      action();
    }, delay);
  }

  function openIntakeCorridor() {
    runPublicActionTransition(actionVariant(sessionId, "intake"), () => { setIntakeScrollLocked(true); setSubmitOpen(true); });
  }

  function requestPriorityUpgrade(track: QueuePublicTrack) {
    runPublicActionTransition(actionVariant(`${sessionId}:${track.id}`, "upgrade"), () => {
      setPriorityModalTrack(track);
      setPriorityRequestMessage(null);
      if (!priorityUpgradeAvailable) setPriorityRequestMessage("Priority Signal upgrades unavailable.");
    });
  }

  async function beginPriorityCheckout(track: QueuePublicTrack, priorityGiftSupporterName = "") {
    if (track.priorityUpgradeStatus !== "checkout_pending" && !priorityUpgradeAvailable) {
      setPriorityRequestMessage("Priority Signal upgrades unavailable.");
      return;
    }
    if (track.priorityUpgradeStatus === "checkout_pending" && !priorityPaymentsAvailable) {
      setPriorityRequestMessage("Priority Signal upgrades unavailable.");
      return;
    }
    setPriorityRequestPending(true);
    const checkoutOwnerToken = getOrCreatePriorityCheckoutOwnerToken(sessionId, track.id);
    const priorityGift = !viewerSubmittedTrackIds.has(track.id);
    const res = await fetch("/api/queue/priority-checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trackId: track.id, sessionId, submitterToken, checkoutOwnerToken, acceptedPriorityTerms: true, priorityTermsVersion: PRIORITY_TERMS_VERSION, priorityDisclosureText: PRIORITY_DISCLOSURE_TEXT, priorityGift, priorityGiftSupporterName: priorityGift ? priorityGiftSupporterName : "", priorityGiftAttributionVersion: PRIORITY_GIFT_ATTRIBUTION_VERSION, priorityGiftAttributionDisclosureText: PRIORITY_GIFT_ATTRIBUTION_DISCLOSURE_TEXT }) });
    const payload = await res.json().catch(() => ({}));
    setPriorityRequestPending(false);
    if (res.ok && typeof payload.url === "string") {
      setPriorityRequestMessage(payload.message ?? "Checkout started. Skip is not active yet.");
      window.location.href = payload.url;
      return;
    }
    if (payload.code === "checkout_owned_elsewhere") {
      clearPriorityCheckoutOwnerToken(sessionId, track.id);
      setPriorityCheckoutOwnerTrackIds((current) => {
        const next = new Set(current);
        next.delete(track.id);
        return next;
      });
    }
    setPriorityRequestMessage(payload.error ?? "Priority Signal checkout is not available right now.");
    await load();
  }

  async function resumePriorityPayment(track: QueuePublicTrack) {
    setPriorityModalTrack(null);
    setPriorityRequestMessage(null);
    setActionTransition(actionVariant(`${sessionId}:${track.id}`, "resume"));
    window.setTimeout(() => setActionTransition(null), 1200);
    await new Promise((resolve) => window.setTimeout(resolve, 1200));
    await beginPriorityCheckout(track);
  }

  function isSignalHoldTrackActive(track: PublicTrackSummary): boolean {
    return snapshot?.upNext?.id === track.id || (snapshot?.queue ?? []).some((queued) => queued.id === track.id);
  }

  function isSignalHoldCheckoutBlocked(track: PublicTrackSummary): boolean {
    return isSignalHoldCheckoutNearFront(track.id, { upNext: snapshot?.upNext, queue: snapshot?.queue });
  }

  function canPurchaseSignalHold(track: PublicTrackSummary): boolean {
    if (!signalHoldPaymentsAvailable || !viewerSubmittedTrackIds.has(track.id) || !isSignalHoldTrackActive(track) || isSignalHoldCheckoutBlocked(track)) return false;
    return track.signalHoldStatus === "none" || track.signalHoldStatus === "failed" || track.signalHoldStatus === "refunded";
  }

  function canResumeSignalHoldPayment(track: PublicTrackSummary): boolean {
    return signalHoldPaymentsAvailable
      && viewerSubmittedTrackIds.has(track.id)
      && isSignalHoldTrackActive(track)
      && !isSignalHoldCheckoutBlocked(track)
      && track.signalHoldStatus === "checkout_pending"
      && signalHoldCheckoutOwnerTrackIds.has(track.id);
  }

  function requestSignalHold(track: PublicTrackSummary) {
    if (isSignalHoldCheckoutBlocked(track)) {
      setSignalHoldRequestMessage(SIGNAL_HOLD_NEXT_TWO_UNAVAILABLE_MESSAGE);
      return;
    }
    setSignalHoldModalTrack(track);
    setSignalHoldRequestMessage(signalHoldPaymentsAvailable ? null : "Signal Hold is not available for this show.");
  }

  async function beginSignalHoldCheckout(track: PublicTrackSummary) {
    if (isSignalHoldCheckoutBlocked(track)) {
      setSignalHoldRequestMessage(SIGNAL_HOLD_NEXT_TWO_UNAVAILABLE_MESSAGE);
      return;
    }
    if (track.signalHoldStatus === "checkout_pending" ? !canResumeSignalHoldPayment(track) : !canPurchaseSignalHold(track)) {
      setSignalHoldRequestMessage("Signal Hold is not available for this track.");
      return;
    }
    setSignalHoldRequestPending(true);
    const checkoutOwnerToken = getOrCreateSignalHoldCheckoutOwnerToken(sessionId, track.id);
    const res = await fetch("/api/queue/signal-hold-checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trackId: track.id, sessionId, submitterToken, checkoutOwnerToken, acceptedSignalHoldTerms: true, signalHoldTermsVersion: SIGNAL_HOLD_TERMS_VERSION, signalHoldDisclosureText: SIGNAL_HOLD_DISCLOSURE_TEXT }) });
    const payload = await res.json().catch(() => ({}));
    setSignalHoldRequestPending(false);
    if (res.ok && typeof payload.url === "string") {
      setSignalHoldRequestMessage(payload.message ?? "Checkout started. Signal Hold is not active yet.");
      window.location.href = payload.url;
      return;
    }
    if (payload.code === "checkout_owned_elsewhere") {
      clearSignalHoldCheckoutOwnerToken(sessionId, track.id);
      setSignalHoldCheckoutOwnerTrackIds((current) => {
        const next = new Set(current);
        next.delete(track.id);
        return next;
      });
    }
    setSignalHoldRequestMessage(payload.error ?? "Signal Hold checkout is not available right now.");
    await load();
  }

  async function resumeSignalHoldPayment(track: PublicTrackSummary) {
    setSignalHoldModalTrack(track);
    setSignalHoldRequestMessage(null);
    await beginSignalHoldCheckout(track);
  }

  const liveShowHref = streamUrl || externalLinks.tiktokLive;
  const showWatchLiveLink = Boolean(snapshot && !isEnded && liveShowHref);
  const contentOffsetClass = publicHudMinimized ? "pt-[2.25rem] sm:pt-[2.75rem]" : "pt-[4.25rem] sm:pt-[4.75rem]";

  if (snapshot && !snapshot.session) {
    return <section className="border border-border bg-surface p-6"><p className="text-xs uppercase tracking-[0.35em] text-muted">NO ACTIVE QUEUE</p><h2 className="mt-3 text-2xl font-bold text-foreground">No BARCODE Radio session exists</h2><p className="mt-2 text-sm text-muted">The queue service is online and waiting for the next session.</p></section>;
  }

  if (isEnded) {
    return <div className="space-y-6"><ReceiverHudPortal snapshot={snapshot} submissionsOpen={false} isBroadcastActive={false} pulse={false} mounted={mounted} minimized={false} onToggleMinimized={() => {}} canSubmit={false} submitLabel="Submissions Closed" onSubmit={() => {}} /><PersonalSignalStatusBar snapshot={snapshot} mounted={mounted} timingSummary={timingSummary} minimized={false} onToggleMinimized={() => {}} canSubmit={false} submitLabel="Submissions Closed" onSubmit={() => {}} /><div className={contentOffsetClass}><SessionPhasePanel snapshot={snapshot} submissionsOpen={false} canSubmit={false} isBroadcastActive={false} /><section className="border border-border bg-surface p-6 space-y-4"><p className="text-xs uppercase tracking-[0.35em] text-danger">SESSION ENDED</p><h2 className="text-3xl font-bold text-foreground">{snapshot?.session?.title ?? "BARCODE Radio"}</h2><p className="text-sm text-muted">This song window has collapsed. Temporal alignment for this broadcast has expired. Review the completed signal log below.</p><div className="grid gap-3 sm:grid-cols-3 text-sm"><div className="border border-border p-3"><p className="text-xs text-muted">Show date</p><p>{snapshot?.session?.showDate ?? "—"}</p></div><div className="border border-border p-3"><p className="text-xs text-muted">Completed tracks</p><p>{snapshot?.session?.completedCount ?? snapshot?.completed.length ?? 0}</p></div><div className="border border-border p-3"><p className="text-xs text-muted">Completed runtime</p><p>{snapshot ? formatRuntime(completedRuntime) : "—"}</p></div></div></section><PublicLane title="Completed Signal Log" tracks={snapshot?.completed ?? []} lastSubmittedTrackId={null} viewerSubmittedTrackIds={viewerSubmittedTrackIds} canPriorityUpgrade={() => false} canResumePriorityPayment={() => false} priorityPriceCents={0} priorityCurrency="usd" onPriorityUpgrade={() => {}} onPriorityPayment={() => {}} /></div></div>;
  }

  return (
    <div className={`space-y-6 ${sponsorBreakRunning ? "sponsor-mode" : ""}`}>
      <ReceiverHudPortal snapshot={snapshot} submissionsOpen={isOpen} isBroadcastActive={isBroadcastActive} pulse={broadcastStartPulse} mounted={mounted} minimized={publicHudMinimized} onToggleMinimized={() => setPublicHudMinimized((current) => !current)} canSubmit={canSubmitFromHud} submitLabel={hudSubmitLabel} onSubmit={openIntakeCorridor} />

      <PersonalSignalStatusBar snapshot={snapshot} mounted={mounted} timingSummary={timingSummary} minimized={publicHudMinimized} onToggleMinimized={() => setPublicHudMinimized((current) => !current)} canSubmit={canSubmitFromHud} submitLabel={hudSubmitLabel} onSubmit={openIntakeCorridor} />
      <div className={`space-y-6 ${contentOffsetClass}`}>
        <section className="border-b border-border/70 pb-4">
          <p className="text-xs uppercase tracking-[0.35em] text-muted">{"//"} BARCODE RADIO</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl"><span className="text-accent text-glow">Broadcast</span> Queue</h1>
          <p className="mt-2 text-sm text-muted">Current BARCODE Radio session monitor.</p>
          <div className="mt-4 border border-[#ffaa00]/40 bg-[#ffaa00]/5 p-3">
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#ffaa00]">Done submitting—or just watching?</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">Open the Broadcast Deck to follow Now Playing, the queue route, Wheel movement, and show activity. Song submissions stay here in the queue.</p>
            <div className="mt-3 flex flex-wrap gap-2"><a href="/radio/deck" className="border border-[#ffaa00]/55 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-[#ffaa00] hover:bg-[#ffaa00] hover:text-background">Open Broadcast Deck</a><a href="/radio/archive" className="border border-cyan-200/45 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-cyan-200 hover:bg-cyan-200 hover:text-background">Broadcast Archive</a></div>
          </div>
        </section>
        {sponsorBreakRunning && <section className="sponsor-mode-banner border border-[#ffaa00]/45 bg-[#ffaa00]/8 p-3" role="status" aria-live="polite"><p className="text-xs font-bold uppercase tracking-[0.34em] text-[#ffaa00]">A WORD FROM OUR SPONSOR</p><p className="mt-1 text-sm text-muted">The 11:00 sponsor break is in progress. The queue, submissions, status, and navigation stay live.</p></section>}
        {showWatchLiveLink && (
        <div className="-mt-2 mb-1 flex justify-start">
          <a
            href={liveShowHref}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex cursor-pointer items-center gap-2 border border-[#ffaa00]/60 bg-[#ffaa00] font-bold uppercase tracking-[0.18em] text-background transition-colors hover:bg-[#ffb733] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ffaa00]/70 ${sponsorBreakRunning ? "sponsor-live-cta px-6 py-3 text-sm shadow-[0_0_34px_rgba(255,170,0,0.30)]" : "px-3 py-1.5 text-xs"}`}
          >
            <span aria-hidden="true">📺</span>
            <span>WATCH ON TIKTOK</span>
          </a>
        </div>
      )}
        {checkoutNotice && <div className="border border-[#ffaa00]/40 bg-[#ffaa00]/5 p-3 text-sm text-[#ffaa00]">{checkoutNotice}</div>}
        {acceptedReceipt && <div className="relative z-20 border border-accent/80 bg-accent/15 p-3 text-sm text-foreground shadow-[0_0_30px_rgba(255,0,0,0.18)]"><div className="flex items-start justify-between gap-3"><div><p className="font-bold uppercase tracking-[0.18em] text-accent">Submission accepted</p><p className="mt-1">{acceptedReceipt.artist} — {acceptedReceipt.title}</p><p className="text-xs text-muted">{acceptedReceipt.sessionTitle} · {acceptedReceipt.sessionDate}</p><p className="text-xs">Confirmation: {acceptedReceipt.trackCode}</p><a href="/radio/deck" className="mt-3 inline-flex border border-[#ffaa00]/60 bg-[#ffaa00]/10 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-[#ffaa00] hover:bg-[#ffaa00] hover:text-background">Submission complete · follow the show on the Deck</a></div><button type="button" onClick={() => setAcceptedReceipt(null)} className="border border-border px-2 py-1 text-[10px] uppercase tracking-widest text-muted">Close</button></div></div>}

        <SessionPhasePanel snapshot={snapshot} timingSummary={timingSummary} submissionsOpen={isOpen} canSubmit={canSubmitFromHud} isBroadcastActive={isBroadcastActive} />

        <SubmissionActivity items={activity} />

        <div data-live={isBroadcastActive ? "true" : "false"} data-pulse={broadcastStartPulse ? "true" : undefined} className="queue-live-system relative space-y-6 overflow-hidden">
        {broadcastStartPulse && <div className="broadcast-start-banner border border-[#ffaa00]/55 bg-[#ffaa00]/10 p-3 text-center shadow-[0_0_46px_rgba(255,170,0,0.18)]" role="status" aria-live="polite"><p className="text-xs uppercase tracking-[0.38em] text-[#ffaa00]">HOST BAND LOCKED</p><p className="mt-1 text-sm font-bold uppercase tracking-[0.24em] text-foreground">BROADCAST PROTOCOL ONLINE</p></div>}

      <section className="space-y-4">
        <div id="broadcast-queue-top"><NowPlaying title="Now Playing" track={snapshot?.nowPlaying ?? null} domId="now-playing-slot" viewerSubmittedTrackIds={viewerSubmittedTrackIds} residue={snapshot?.nowPlaying?.id ? residueMap[snapshot.nowPlaying.id] : undefined} /></div>
        <div className="grid gap-4 md:grid-cols-2">
          <NowPlaying title="Up Next" track={snapshot?.upNext ?? null} compact domId="up-next-slot" viewerSubmittedTrackIds={viewerSubmittedTrackIds} residue={snapshot?.upNext?.id ? residueMap[snapshot.upNext.id] : undefined} />
          <WheelSpinsWaitingPanel snapshot={snapshot} pulse={wheelUnlockPulse} />
        </div>
        <SubmitterOutlookPanel snapshot={snapshot} canSubmit={canSubmitFromHud} isFull={isFull} submitLimitReached={isSubmitLimitReached} timingSummary={timingSummary} onSubmit={openIntakeCorridor} />
      </section>

      {isFull && <p className="border border-danger/40 bg-danger/5 p-3 text-sm text-danger">This broadcast queue is full for new songs.</p>}

      <QueueMechanicsInfo />

      <SignalHoldOwnerPanel snapshot={snapshot} paymentsAvailable={signalHoldPaymentsAvailable} priceCents={signalHoldPriceCents} currency={signalHoldCurrency} isCheckoutBlocked={isSignalHoldCheckoutBlocked} canPurchase={canPurchaseSignalHold} canResume={canResumeSignalHoldPayment} onPurchase={requestSignalHold} onResume={resumeSignalHoldPayment} />

      <div className="flex gap-2 border-b border-border">
        <button type="button" onClick={() => setView("active")} className={`cursor-pointer px-4 py-3 text-xs uppercase tracking-widest transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${view === "active" ? "border-b border-accent text-accent" : "text-muted hover:text-foreground"}`}>Active Queue</button>
        <button type="button" onClick={() => setView("recent")} className={`px-4 py-3 text-xs uppercase tracking-widest ${view === "recent" ? "border-b border-accent text-accent" : "text-muted"}`}>Recently Played</button>
      </div>

      {view === "active" ? <div id="active-queue-panel" className="space-y-3"><PublicLane title="Priority Signal" tracks={lanes.priority} lastSubmittedTrackId={lastSubmittedTrackId} viewerSubmittedTrackIds={viewerSubmittedTrackIds} collapsible domId="priority-lane" canPriorityUpgrade={() => false} canResumePriorityPayment={canResumePriorityPayment} priorityPriceCents={priorityPriceCents} priorityCurrency={priorityCurrency} onPriorityUpgrade={requestPriorityUpgrade} onPriorityPayment={resumePriorityPayment} residueMap={residueMap} getPriorityImpact={() => null} /><PublicLane title="Wheel Chosen" subtitle="Tracks selected by the 10K tap wheel." tracks={lanes.wheel} lastSubmittedTrackId={lastSubmittedTrackId} viewerSubmittedTrackIds={viewerSubmittedTrackIds} collapsible domId="wheel-lane" canPriorityUpgrade={() => false} canResumePriorityPayment={canResumePriorityPayment} priorityPriceCents={priorityPriceCents} priorityCurrency={priorityCurrency} onPriorityUpgrade={requestPriorityUpgrade} onPriorityPayment={resumePriorityPayment} residueMap={residueMap} getPriorityImpact={() => null} /><PublicLane title="Free Transmissions" tracks={lanes.regular} lastSubmittedTrackId={lastSubmittedTrackId} viewerSubmittedTrackIds={viewerSubmittedTrackIds} domId="free-transmissions-lane" canPriorityUpgrade={canShowPriorityUpgrade} canResumePriorityPayment={canResumePriorityPayment} priorityPriceCents={priorityPriceCents} priorityCurrency={priorityCurrency} onPriorityUpgrade={requestPriorityUpgrade} onPriorityPayment={resumePriorityPayment} residueMap={residueMap} getPriorityImpact={(track) => priorityDisplayFromImpact(estimatePriorityImpactForTrack(timingSummary, track))} /></div> : <PublicLane title="Recently Played" tracks={snapshot?.completed ?? []} lastSubmittedTrackId={null} viewerSubmittedTrackIds={viewerSubmittedTrackIds} canPriorityUpgrade={() => false} canResumePriorityPayment={() => false} priorityPriceCents={priorityPriceCents} priorityCurrency={priorityCurrency} onPriorityUpgrade={requestPriorityUpgrade} onPriorityPayment={resumePriorityPayment} residueMap={residueMap} getPriorityImpact={() => null} />}
        <style jsx>{`
          .queue-live-system{border:1px solid transparent;padding:0;transition:border-color .5s ease,box-shadow .5s ease,filter .5s ease}
          .sponsor-mode{background:linear-gradient(180deg,rgba(255,170,0,.035),transparent 24rem)}
          .sponsor-mode-banner{box-shadow:0 0 30px rgba(255,170,0,.09)}
          .sponsor-live-cta{animation:sponsor-live-pulse 1.8s ease-in-out infinite}
          @keyframes sponsor-live-pulse{0%,100%{transform:scale(1);box-shadow:0 0 22px rgba(255,170,0,.20)}50%{transform:scale(1.025);box-shadow:0 0 42px rgba(255,170,0,.42)}}
          .queue-live-system[data-live="true"]{border-color:rgba(255,170,0,.16);box-shadow:0 0 44px rgba(255,170,0,.06);padding:.35rem}
          .queue-live-system[data-pulse="true"]{animation:queue-broadcast-lock 1.55s ease-out}
          .queue-live-system[data-pulse="true"]::before{content:"";position:absolute;inset:0;z-index:2;pointer-events:none;background:linear-gradient(90deg,transparent,rgba(255,170,0,.32),rgba(255,255,255,.22),transparent);animation:broadcast-sweep 1.1s ease-out forwards}
          .broadcast-start-banner{animation:broadcast-banner-lock .9s ease-out}
          .queue-live-system[data-live="true"] :global(#now-playing-slot){box-shadow:0 0 48px rgba(255,170,0,.20)}
          .queue-live-system[data-live="true"] :global(#up-next-slot){box-shadow:0 0 34px rgba(255,0,0,.14)}
          :global([data-track-card="true"].flip-routing),:global([data-track-card="true"].flip-landing){will-change:transform,filter;filter:brightness(1.22) saturate(1.12)}
          :global([data-track-card="true"].flip-landing){animation:route-card-slam .82s cubic-bezier(.16,1,.3,1)}
          :global([data-track-card="true"].route-arrival){filter:brightness(1.42) saturate(1.18)}
          :global([data-track-card="true"].flip-routing)::after,:global([data-track-card="true"].flip-landing)::after{content:"";position:absolute;inset:-4px;z-index:1;pointer-events:none;border:2px solid currentColor;opacity:.9;mix-blend-mode:screen;box-shadow:0 0 34px currentColor,inset 0 0 26px currentColor}
          :global([data-track-card="true"].route-arrival)::after{animation:route-arrival-impact .58s ease-out forwards}
          :global([data-track-card="true"].flip-routing[data-route-tone="red"]),:global([data-track-card="true"].flip-landing[data-route-tone="red"]){color:#ff2a2a;box-shadow:0 0 34px rgba(255,0,0,.28),inset 0 0 26px rgba(255,255,255,.055)}
          :global([data-track-card="true"].flip-routing[data-route-tone="red"]::after),:global([data-track-card="true"].flip-landing[data-route-tone="red"]::after){background:linear-gradient(90deg,transparent 0 8%,rgba(255,255,255,.34) 18%,rgba(255,0,0,.42) 31%,transparent 46%),repeating-linear-gradient(0deg,transparent 0 5px,rgba(255,255,255,.055) 5px 6px);animation:route-free-ripple .58s ease-out forwards}
          :global(.queue-track-card.flip-routing[data-route-tone="red"] .packet-trail),:global(.queue-track-card.flip-landing[data-route-tone="red"] .packet-trail){height:2px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.8),rgba(255,0,0,.7),transparent);animation:route-free-packet .62s ease-out forwards}
          :global([data-track-card="true"].flip-routing[data-route-tone="cyan"]),:global([data-track-card="true"].flip-landing[data-route-tone="cyan"]){color:#67e8f9;box-shadow:0 0 42px rgba(103,232,249,.34),inset 0 0 30px rgba(103,232,249,.08)}
          :global([data-track-card="true"].flip-routing[data-route-tone="cyan"]::after),:global([data-track-card="true"].flip-landing[data-route-tone="cyan"]::after){border-radius:999px;background:radial-gradient(circle at 82% 50%,transparent 0 1.05rem,rgba(103,232,249,.78) 1.12rem 1.18rem,transparent 1.28rem),conic-gradient(from 90deg at 82% 50%,transparent,rgba(103,232,249,.42),transparent 42%,rgba(103,232,249,.30),transparent 72%);animation:route-wheel-radar .86s ease-out forwards}
          :global(.queue-track-card.flip-routing[data-route-tone="cyan"] .packet-trail),:global(.queue-track-card.flip-landing[data-route-tone="cyan"] .packet-trail){height:2px;background:radial-gradient(circle,rgba(103,232,249,.95) 0 2px,transparent 3px) 0 50%/18px 8px repeat-x;animation:route-wheel-packet .74s ease-out forwards}
          :global(.queue-track-card.flip-routing[data-route-tone="cyan"] .mini-aperture),:global(.queue-track-card.flip-landing[data-route-tone="cyan"] .mini-aperture){border-radius:999px;transform:rotate(18deg);box-shadow:0 0 26px rgba(103,232,249,.30)}
          :global([data-track-card="true"].flip-routing[data-route-tone="amber"]),:global([data-track-card="true"].flip-landing[data-route-tone="amber"]){color:#ffaa00;box-shadow:0 0 34px rgba(255,170,0,.24),inset 0 0 24px rgba(255,170,0,.06);filter:brightness(1.08) saturate(.98)}
          :global([data-track-card="true"].flip-routing[data-route-tone="amber"]::after),:global([data-track-card="true"].flip-landing[data-route-tone="amber"]::after){border-style:dashed;background:repeating-linear-gradient(90deg,transparent 0 10px,rgba(255,170,0,.54) 10px 15px,transparent 15px 24px) 50% 50%/100% 2px no-repeat,linear-gradient(90deg,transparent,rgba(255,170,0,.09),transparent);animation:route-pending-handshake .95s steps(3,end) forwards}
          :global(.queue-track-card.flip-routing[data-route-tone="amber"] .packet-trail),:global(.queue-track-card.flip-landing[data-route-tone="amber"] .packet-trail){height:2px;background:repeating-linear-gradient(90deg,rgba(255,170,0,.75) 0 6px,transparent 6px 12px);animation:route-pending-dots .82s steps(5,end) forwards}
          :global([data-track-card="true"].flip-routing[data-route-tone="gold"]),:global([data-track-card="true"].flip-landing[data-route-tone="gold"]){color:#ffaa00;box-shadow:0 0 52px rgba(255,170,0,.42),inset 0 0 34px rgba(255,255,255,.07);filter:brightness(1.26) saturate(1.16)}
          :global([data-track-card="true"].flip-routing[data-route-tone="gold"]::after),:global([data-track-card="true"].flip-landing[data-route-tone="gold"]::after){background:linear-gradient(135deg,transparent 0 36%,rgba(255,255,255,.42) 43%,rgba(255,170,0,.72) 48%,transparent 58%),radial-gradient(circle at 88% 16%,rgba(255,255,255,.46),transparent 18%);animation:route-priority-relay .78s cubic-bezier(.16,1,.3,1) forwards}
          :global(.queue-track-card.flip-routing[data-route-tone="gold"] .packet-trail),:global(.queue-track-card.flip-landing[data-route-tone="gold"] .packet-trail){left:14%;right:10%;top:28%;height:2px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.95),rgba(255,170,0,.88),transparent);transform:rotate(-8deg);animation:route-priority-line .72s ease-out forwards}
          :global([data-track-card="true"].flip-routing[data-route-tone="archive"]),:global([data-track-card="true"].flip-landing[data-route-tone="archive"]){color:#b7b7b7;box-shadow:0 0 30px rgba(183,183,183,.20);filter:saturate(.72) brightness(.96)}
          :global([data-track-card="true"].flip-routing[data-route-tone="archive"]::after),:global([data-track-card="true"].flip-landing[data-route-tone="archive"]::after){border-style:double;background:radial-gradient(circle at 18% 32%,rgba(183,183,183,.28) 0 1px,transparent 2px),radial-gradient(circle at 62% 68%,rgba(183,183,183,.22) 0 1px,transparent 2px),repeating-linear-gradient(0deg,transparent 0 7px,rgba(183,183,183,.07) 7px 8px);animation:route-archive-dust .9s ease-out forwards}
          :global([data-track-card="true"].flip-routing[data-route-tone="danger"]),:global([data-track-card="true"].flip-landing[data-route-tone="danger"]){color:#ff3b3b;box-shadow:0 0 42px rgba(255,0,0,.36),inset 0 0 28px rgba(255,0,0,.08);filter:saturate(.85) brightness(.98)}
          :global([data-track-card="true"].flip-routing[data-route-tone="danger"]::after),:global([data-track-card="true"].flip-landing[data-route-tone="danger"]::after){background:linear-gradient(90deg,rgba(255,0,0,.52),transparent 34%),repeating-linear-gradient(90deg,transparent 0 12px,rgba(255,0,0,.26) 12px 14px,transparent 14px 22px);animation:route-danger-wipe .68s ease-out forwards}
          :global(.queue-track-card.flip-routing[data-route-tone="danger"] .packet-trail),:global(.queue-track-card.flip-landing[data-route-tone="danger"] .packet-trail){height:8px;background:repeating-linear-gradient(90deg,rgba(255,0,0,.65) 0 8px,transparent 8px 14px);animation:route-danger-fragments .62s ease-out forwards}
          :global([data-track-card="true"][data-route-motion="reorder"]){filter:brightness(1.06);box-shadow:0 0 14px currentColor}
          :global([data-track-card="true"][data-route-motion="reorder"]::after){inset:auto .75rem .55rem auto;width:2.8rem;height:2px;border:0;background:currentColor;opacity:.72;animation:route-reorder-tick .5s ease-out forwards}
          :global([data-track-card="true"][data-route-motion="landing"]::after){animation-duration:.82s}
          :global([data-track-card="true"].flip-routing[data-route-zone="next"]),:global([data-track-card="true"].flip-landing[data-route-zone="next"]){box-shadow:0 0 32px currentColor,inset 0 0 28px rgba(255,255,255,.04)}
          :global([data-track-card="true"].flip-routing[data-route-zone="next"]::after),:global([data-track-card="true"].flip-landing[data-route-zone="next"]::after){background:linear-gradient(90deg,currentColor 0 10px,transparent 10px calc(100% - 10px),currentColor calc(100% - 10px)),linear-gradient(0deg,currentColor 0 10px,transparent 10px calc(100% - 10px),currentColor calc(100% - 10px));animation:route-next-clamp .78s ease-out forwards}
          :global([data-track-card="true"].flip-routing[data-route-zone="now"]),:global([data-track-card="true"].flip-landing[data-route-zone="now"]){color:#fff6d8;box-shadow:0 0 52px rgba(255,170,0,.34),0 0 24px rgba(255,255,255,.18);filter:brightness(1.34) saturate(1.2)}
          :global([data-track-card="true"].flip-routing[data-route-zone="now"]::after),:global([data-track-card="true"].flip-landing[data-route-zone="now"]::after){border-color:rgba(255,255,255,.85);background:repeating-linear-gradient(90deg,rgba(255,170,0,.34) 0 3px,transparent 3px 10px) 50% 78%/70% 28px no-repeat,linear-gradient(180deg,rgba(255,255,255,.24),transparent 28%,rgba(255,170,0,.12));animation:route-now-monitor .9s ease-out forwards}
          @keyframes queue-broadcast-lock{0%{filter:brightness(1);transform:translateY(0)}26%{filter:brightness(1.55);transform:translateY(-2px)}100%{filter:brightness(1);transform:translateY(0)}}
          @keyframes broadcast-sweep{0%{transform:translateX(-120%);opacity:0}20%{opacity:1}100%{transform:translateX(120%);opacity:0}}
          @keyframes broadcast-banner-lock{0%{opacity:0;transform:scale(.98);filter:brightness(1.8)}100%{opacity:1;transform:scale(1);filter:brightness(1)}}
          @keyframes route-card-slam{0%{transform:scale(.975);filter:brightness(1.9)}42%{transform:scale(1.018);filter:brightness(1.45)}100%{transform:scale(1);filter:brightness(1)}}
          @keyframes route-arrival-impact{0%{opacity:0;transform:scale(.965)}30%{opacity:.96;transform:scale(1)}100%{opacity:0;transform:scale(1.03)}}
          @keyframes route-free-ripple{0%{opacity:0;transform:translateX(-9%)}35%{opacity:.72}100%{opacity:0;transform:translateX(9%)}}
          @keyframes route-free-packet{0%{transform:translateX(-38%) scaleX(.28);opacity:.15}42%{opacity:.9}100%{transform:translateX(38%) scaleX(.62);opacity:0}}
          @keyframes route-wheel-radar{0%{opacity:0;transform:scale(.72) rotate(-34deg)}45%{opacity:.86}100%{opacity:0;transform:scale(1.16) rotate(105deg)}}
          @keyframes route-wheel-packet{0%{background-position:-28px 50%;opacity:.1}45%{opacity:.92}100%{background-position:42px 50%;opacity:0}}
          @keyframes route-pending-handshake{0%,100%{opacity:.24;filter:brightness(.9)}33%{opacity:.82;filter:brightness(1.35)}66%{opacity:.42;filter:brightness(.78)}}
          @keyframes route-pending-dots{0%{transform:translateX(-18px);opacity:.2}55%{opacity:.88}100%{transform:translateX(18px);opacity:0}}
          @keyframes route-priority-relay{0%{opacity:0;transform:translateY(9px) scale(.985)}38%{opacity:.92}100%{opacity:0;transform:translateY(-8px) scale(1.025)}}
          @keyframes route-priority-line{0%{transform:translateY(14px) rotate(-8deg) scaleX(.22);opacity:.2}55%{opacity:1}100%{transform:translateY(-10px) rotate(-8deg) scaleX(1);opacity:0}}
          @keyframes route-archive-dust{0%{opacity:0;transform:scale(1.02)}35%{opacity:.52}100%{opacity:0;transform:scale(.985)}}
          @keyframes route-danger-wipe{0%{opacity:0;transform:translateX(-35%);clip-path:inset(0 88% 0 0)}44%{opacity:.86;clip-path:inset(0 18% 0 0)}100%{opacity:0;transform:translateX(28%);clip-path:inset(0 0 0 70%)}}
          @keyframes route-danger-fragments{0%{transform:translateX(-20px) scaleY(.4);opacity:.15}42%{opacity:.92}100%{transform:translateX(18px) scaleY(.12);opacity:0}}
          @keyframes route-reorder-tick{0%{transform:translateX(-10px) scaleX(.3);opacity:.18}55%{opacity:.82}100%{transform:translateX(8px) scaleX(.55);opacity:0}}
          @keyframes route-next-clamp{0%{opacity:0;clip-path:inset(48% 48% 48% 48%)}38%{opacity:.82;clip-path:inset(0 0 0 0)}100%{opacity:0;clip-path:inset(8% 8% 8% 8%)}}
          @keyframes route-now-monitor{0%{opacity:0;transform:scale(.985);filter:brightness(1.7)}35%{opacity:.96}100%{opacity:0;transform:scale(1.02);filter:brightness(1)}}
          @media (prefers-reduced-motion: reduce){
            .queue-live-system[data-pulse="true"],.queue-live-system[data-pulse="true"]::before,.broadcast-start-banner,.sponsor-live-cta,:global([data-track-card="true"].flip-routing),:global([data-track-card="true"].flip-landing),:global([data-track-card="true"].flip-routing)::after,:global([data-track-card="true"].flip-landing)::after,:global([data-track-card="true"].flip-routing .packet-trail),:global([data-track-card="true"].flip-landing .packet-trail){animation:none!important;transition:none!important}
            .queue-live-system[data-pulse="true"]::before,:global([data-track-card="true"].flip-routing)::after,:global([data-track-card="true"].flip-landing)::after{display:none}
          }
        `}</style>
      </div>

      <DiscordQueueCTA />

      </div>

      {mounted && activityToast && createPortal(<QueueUpdateToast item={activityToast} />, document.body)}

      {mounted && routingGhosts.length > 0 && createPortal(<RoutingGhostLayer ghosts={routingGhosts} />, document.body)}

      {mounted && broadcastStartPulse && createPortal(<BroadcastStartOverlay />, document.body)}

      {mounted && actionTransition && createPortal(<NavigationTransition {...actionTransition} />, document.body)}

      {mounted && priorityModalTrack && createPortal(<PriorityUpgradeModal track={priorityModalTrack} price={formatPrice(priorityPriceCents, priorityCurrency)} priorityImpact={priorityDisplayFromImpact(estimatePriorityImpactForTrack(timingSummary, priorityModalTrack))} isOwnTrack={viewerSubmittedTrackIds.has(priorityModalTrack.id)} pending={priorityRequestPending} message={priorityRequestMessage} onConfirm={(supporterName) => beginPriorityCheckout(priorityModalTrack, supporterName)} onClose={() => setPriorityModalTrack(null)} />, document.body)}

      {mounted && signalHoldModalTrack && createPortal(<SignalHoldModal track={signalHoldModalTrack} price={formatPrice(signalHoldPriceCents, signalHoldCurrency)} pending={signalHoldRequestPending} message={signalHoldRequestMessage} onConfirm={() => beginSignalHoldCheckout(signalHoldModalTrack)} onClose={() => setSignalHoldModalTrack(null)} />, document.body)}

      {mounted && submitOpen && createPortal(<div className="fixed inset-0 z-[10000] grid place-items-center overscroll-contain bg-black/75 p-2 backdrop-blur-md"><div className="flex max-h-[calc(100dvh-1rem)] w-full max-w-[920px] flex-col overflow-hidden border border-accent/50 bg-background/95 p-3 shadow-[0_0_70px_rgba(255,0,0,0.22)]"><div className="mb-2 flex shrink-0 items-center justify-between gap-3"><div><p className="text-xs uppercase tracking-[0.35em] text-accent">Submission Intake</p><p className="mt-0.5 text-[11px] text-muted">Send your song into the free queue.</p></div><button type="button" onClick={() => { setSubmitOpen(false); setIntakeScrollLocked(false); }} className="cursor-pointer border border-border px-3 py-2 text-xs uppercase tracking-widest text-muted transition-colors hover:border-foreground/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-muted/50">Collapse Intake</button></div><div className="overflow-y-auto pr-1"><RadioQueueForm sessionId={sessionId} snapshotEndpoint={snapshotEndpoint} onCancel={() => { setSubmitOpen(false); setIntakeScrollLocked(false); }} onAcceptedReceipt={(receipt) => setAcceptedReceipt(receipt)} onSubmitted={(trackId, phase, targetId) => { setLastSubmittedTrackId(trackId ?? null); setSubmitterToken(window.localStorage.getItem("barcode-radio-submitter-token") ?? ""); setView("active"); if (phase === "resolved") { setIntakeScrollLocked(false); load(); window.setTimeout(() => document.getElementById(targetId ?? "active-queue-panel")?.scrollIntoView({ behavior: "smooth", block: "center" }), 250); } if (phase === "complete") { setSubmitOpen(false); setIntakeScrollLocked(false); load(); } }} /></div></div></div>, document.body)}
    </div>
  );
}

function ReceiverHudPortal({ snapshot, submissionsOpen, isBroadcastActive, pulse, mounted, minimized, onToggleMinimized, canSubmit, submitLabel, onSubmit }: { snapshot: QueuePublicSnapshot | null; submissionsOpen: boolean; isBroadcastActive: boolean; pulse: boolean; mounted: boolean; minimized: boolean; onToggleMinimized: () => void; canSubmit: boolean; submitLabel: string; onSubmit: () => void }) {
  const counts = publicQueueCounts(snapshot);
  const nowPlaying = snapshot?.nowPlaying ?? null;
  const upNext = snapshot?.upNext ?? null;
  const hud = (
    <section data-live={isBroadcastActive ? "true" : "false"} data-pulse={pulse ? "true" : undefined} data-minimized={minimized ? "true" : undefined} className="receiver-hud fixed inset-x-3 z-[9000] border border-border bg-background/95 p-2 shadow-[0_0_28px_rgba(255,0,0,0.10)] backdrop-blur-md sm:inset-x-4" aria-label="BARCODE receiver status">
      <div className="receiver-hud-scan pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="receiver-hud-packet pointer-events-none absolute right-2 top-2 h-2 w-2 border border-accent bg-accent/60 shadow-[0_0_14px_rgba(255,0,0,0.55)]" aria-hidden="true" />
      <div className="relative space-y-2 text-[10px] uppercase tracking-[0.18em] text-muted">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-bold text-foreground">BARCODE RECEIVER</span>
          <span className={`${isBroadcastActive ? "text-[#ffaa00]" : "text-muted"}`}>Broadcast: {isBroadcastActive ? "Active" : "Standby"}</span>
          <span className={`${submissionsOpen ? "text-accent" : "text-muted"}`}>Submissions: {submissionsOpen ? "Open" : "Closed"}</span>
          {!minimized && <span>Remaining: {counts.remaining}</span>}
          {!minimized && counts.pending > 0 && <span className="text-[#ffaa00]">Payment Processing: {counts.pending}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!minimized && canSubmit && <button type="button" onClick={onSubmit} className="border border-accent/60 bg-accent/10 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-accent hover:bg-accent hover:text-background">Submit Track</button>}
          {!minimized && !canSubmit && <span className="border border-border px-2.5 py-1.5 text-[10px]">{submitLabel}</span>}
          <button type="button" onClick={onToggleMinimized} className="border border-border px-2.5 py-1.5 text-[10px] uppercase tracking-[0.2em] text-muted hover:text-foreground">{minimized ? "Expand" : "Minimize"}</button>
          {!minimized && nowPlaying && <span className="min-w-[9rem] truncate text-[#ffaa00]">Now: {nowPlaying.submittedArtistName} — {nowPlaying.submittedSongTitle}</span>}
          {!minimized && upNext && <span className="hidden min-w-[9rem] truncate text-accent sm:inline">Next: {upNext.submittedArtistName} — {upNext.submittedSongTitle}</span>}
        </div>
      </div>
      {pulse && <div className="receiver-hud-banner mt-2 border border-[#ffaa00]/40 bg-[#ffaa00]/10 px-2 py-1 text-center text-[10px] font-bold uppercase tracking-[0.28em] text-[#ffaa00]">HOST BAND LOCKED · BROADCAST PROTOCOL ONLINE</div>}
    </section>
  );
  return <>{mounted && createPortal(hud, document.body)}<style jsx>{`.receiver-hud{top:calc(10.75rem + env(safe-area-inset-top));overflow:visible;transition:top .2s ease,padding .2s ease}.receiver-hud[data-minimized="true"]{top:calc(8.2rem + env(safe-area-inset-top));padding:.35rem .55rem}.receiver-hud-scan{background:linear-gradient(transparent 50%,rgba(255,255,255,.055) 50%);background-size:100% 6px;opacity:.12}.receiver-hud[data-live="true"]{border-color:rgba(255,170,0,.42);box-shadow:0 0 34px rgba(255,170,0,.14)}.receiver-hud[data-pulse="true"]{animation:receiver-hud-lock 1.2s ease-out}.receiver-hud-packet{animation:receiver-hud-packet 1.4s ease-in-out infinite}.receiver-hud-banner{animation:receiver-hud-banner .9s ease-out}@keyframes receiver-hud-lock{0%{filter:brightness(1)}28%{filter:brightness(1.6)}100%{filter:brightness(1)}}@keyframes receiver-hud-banner{0%{opacity:0;transform:translateY(-4px)}100%{opacity:1;transform:translateY(0)}}@keyframes receiver-hud-packet{0%,100%{opacity:.45;transform:scale(.85)}50%{opacity:1;transform:scale(1.18)}}@media (min-width: 900px){.receiver-hud{top:calc(11.5rem + env(safe-area-inset-top))}.receiver-hud[data-minimized="true"]{top:calc(8.4rem + env(safe-area-inset-top))}}@media (prefers-reduced-motion: reduce){.receiver-hud,.receiver-hud[data-pulse="true"],.receiver-hud-banner,.receiver-hud-packet{animation:none;transition:none}}`}</style></>;
}

function BroadcastStartOverlay() {
  return <div className="broadcast-start-overlay fixed inset-0 z-[9900] grid place-items-center bg-black/82 p-4 text-center backdrop-blur-sm" role="status" aria-live="polite"><div className="broadcast-sweep-lines pointer-events-none absolute inset-0" aria-hidden="true">{Array.from({ length: 12 }).map((_, index) => <span key={index} />)}</div><div className="broadcast-lock-panel relative w-full max-w-2xl overflow-hidden border border-[#ffaa00]/60 bg-background/90 p-7 shadow-[0_0_110px_rgba(255,170,0,0.30)]"><div className="broadcast-lock-wave mx-auto mb-5 flex h-20 max-w-md items-center justify-center gap-1" aria-hidden="true">{Array.from({ length: 28 }).map((_, index) => <span key={index} style={{ animationDelay: `${index * 28}ms` }} />)}</div><p className="text-xs uppercase tracking-[0.45em] text-[#ffaa00]">HOST BAND LOCKED</p><h2 className="mt-3 text-3xl font-bold uppercase tracking-[0.18em] text-foreground">BROADCAST PROTOCOL ONLINE</h2><p className="mt-3 text-xs uppercase tracking-[0.25em] text-muted">PUBLIC RECEIVER LOCK STABLE</p></div><style jsx>{`.broadcast-start-overlay{animation:broadcast-overlay-in .22s ease-out forwards}.broadcast-sweep-lines span{position:absolute;left:50%;top:50%;width:70vw;height:1px;background:linear-gradient(90deg,transparent,rgba(255,170,0,.52),rgba(255,255,255,.32),transparent);transform-origin:left center;animation:broadcast-sweep-line 1.05s ease-out forwards}.broadcast-sweep-lines span:nth-child(1){transform:rotate(0deg)}.broadcast-sweep-lines span:nth-child(2){transform:rotate(15deg)}.broadcast-sweep-lines span:nth-child(3){transform:rotate(30deg)}.broadcast-sweep-lines span:nth-child(4){transform:rotate(45deg)}.broadcast-sweep-lines span:nth-child(5){transform:rotate(60deg)}.broadcast-sweep-lines span:nth-child(6){transform:rotate(75deg)}.broadcast-sweep-lines span:nth-child(7){transform:rotate(90deg)}.broadcast-sweep-lines span:nth-child(8){transform:rotate(105deg)}.broadcast-sweep-lines span:nth-child(9){transform:rotate(120deg)}.broadcast-sweep-lines span:nth-child(10){transform:rotate(135deg)}.broadcast-sweep-lines span:nth-child(11){transform:rotate(150deg)}.broadcast-sweep-lines span:nth-child(12){transform:rotate(165deg)}.broadcast-lock-panel{animation:broadcast-panel-lock 1.05s ease-out forwards}.broadcast-lock-wave span{width:4px;background:rgba(255,170,0,.86);box-shadow:0 0 16px rgba(255,170,0,.42);animation:broadcast-wave-lock 620ms ease-in-out infinite}@keyframes broadcast-overlay-in{from{opacity:0}to{opacity:1}}@keyframes broadcast-sweep-line{0%{opacity:0;transform:scaleX(.05)}35%{opacity:.95;transform:scaleX(1.1)}100%{opacity:0;transform:scaleX(.08)}}@keyframes broadcast-panel-lock{0%{transform:scale(.96);filter:brightness(1.7)}100%{transform:scale(1);filter:brightness(1)}}@keyframes broadcast-wave-lock{0%,100%{height:18%;opacity:.48}50%{height:100%;opacity:1}}@media (prefers-reduced-motion: reduce){.broadcast-start-overlay,.broadcast-sweep-lines span,.broadcast-lock-panel,.broadcast-lock-wave span{animation:none}}`}</style></div>;
}

function NavigationTransition({ label, detail, mode, kind }: PublicActionVariant) {
  return <div data-kind={kind} className="nav-action-overlay fixed inset-0 z-[9900] grid place-items-center bg-black/86 p-4 text-center backdrop-blur-sm" role="status" aria-live="polite"><div className="nav-action-lines pointer-events-none absolute inset-0" aria-hidden="true">{Array.from({ length: 10 }).map((_, index) => <span key={index} />)}</div><div className="nav-action-panel relative w-full max-w-xl overflow-hidden border border-accent/50 bg-background/92 p-6 shadow-[0_0_90px_rgba(255,0,0,0.24)]"><div className="nav-action-aperture mx-auto mb-5" aria-hidden="true"><span /><span /><span /></div><p className="text-xs uppercase tracking-[0.4em] text-accent">{label}</p><h2 className="mt-3 text-2xl font-bold text-foreground">{detail}</h2><p className="mt-2 text-xs uppercase tracking-[0.25em] text-muted">{mode} · {kind === "payment" ? "SECURE RELAY APERTURE" : "INTAKE CORRIDOR HANDOFF"}</p>{kind === "payment" && <p className="mt-2 text-[11px] uppercase tracking-[0.18em] text-[#ffaa00]">Payment confirmation required before Priority is confirmed.</p>}<div className="mt-5 grid grid-cols-8 gap-1" aria-hidden="true">{Array.from({ length: 16 }).map((_, index) => <span key={index} className="nav-action-bit h-8 border border-accent/30 bg-accent/10" />)}</div></div><style jsx>{`.nav-action-overlay{animation:nav-action-fade .18s ease-out}.nav-action-lines span{position:absolute;left:50%;top:50%;width:58vw;height:1px;background:linear-gradient(90deg,transparent,rgba(255,0,0,.45),transparent);transform-origin:left center;animation:nav-line-converge .72s ease-in forwards}.nav-action-lines span:nth-child(1){transform:rotate(0deg)}.nav-action-lines span:nth-child(2){transform:rotate(18deg)}.nav-action-lines span:nth-child(3){transform:rotate(36deg)}.nav-action-lines span:nth-child(4){transform:rotate(54deg)}.nav-action-lines span:nth-child(5){transform:rotate(72deg)}.nav-action-lines span:nth-child(6){transform:rotate(90deg)}.nav-action-lines span:nth-child(7){transform:rotate(108deg)}.nav-action-lines span:nth-child(8){transform:rotate(126deg)}.nav-action-lines span:nth-child(9){transform:rotate(144deg)}.nav-action-lines span:nth-child(10){transform:rotate(162deg)}.nav-action-panel{animation:nav-action-enter .72s ease-out}.nav-action-aperture{position:relative;width:9rem;height:5rem;border:1px solid rgba(255,0,0,.45);box-shadow:0 0 42px rgba(255,0,0,.22),inset 0 0 24px rgba(255,255,255,.06);animation:nav-aperture-open .72s ease-out}.nav-action-aperture span{position:absolute;inset:18%;border:1px solid rgba(255,255,255,.20);animation:nav-aperture-ring 1.1s ease-in-out infinite}.nav-action-overlay[data-kind="payment"] .nav-action-lines span{background:linear-gradient(90deg,transparent,rgba(255,170,0,.52),transparent)}.nav-action-overlay[data-kind="payment"] .nav-action-aperture{border-color:rgba(255,170,0,.55);box-shadow:0 0 46px rgba(255,170,0,.26),inset 0 0 24px rgba(255,255,255,.06)}.nav-action-bit{animation:nav-action-bit .62s ease-in-out forwards}.nav-action-bit:nth-child(even){animation-delay:.04s}@keyframes nav-action-fade{from{opacity:0}to{opacity:1}}@keyframes nav-action-enter{0%{transform:scale(.98);filter:brightness(1.7)}100%{transform:scale(1);filter:brightness(1)}}@keyframes nav-line-converge{0%{opacity:0;transform:scaleX(1.2)}60%{opacity:.9}100%{opacity:0;transform:scaleX(.06)}}@keyframes nav-aperture-open{0%{transform:scale(.55);filter:brightness(1.8)}100%{transform:scale(1);filter:brightness(1)}}@keyframes nav-aperture-ring{0%,100%{transform:scale(.9);opacity:.35}50%{transform:scale(1.08);opacity:.95}}@keyframes nav-action-bit{0%{transform:scaleY(.25);opacity:.35}55%{transform:scaleY(1);opacity:1}100%{transform:scaleY(.45);opacity:.72}}@media (prefers-reduced-motion: reduce){.nav-action-overlay,.nav-action-lines span,.nav-action-panel,.nav-action-aperture,.nav-action-aperture span,.nav-action-bit{animation:none}}`}</style></div>;
}

function SourceArt({ track, className = "h-full w-full" }: { track: QueuePublicTrack | null; className?: string }) {
  const [failed, setFailed] = useState(false);
  const artworkUrl = track?.sourceArtworkUrl ?? null;
  const artwork = artworkUrl && !failed
    ? <img src={artworkUrl} alt="" className={`${className} object-cover`} onError={() => setFailed(true)} />
    : <div className={`${className} flex items-center justify-center bg-[radial-gradient(circle_at_center,rgba(255,0,0,0.25),transparent_60%)] text-4xl text-accent`}>▦</div>;
  if (!track) return artwork;
  return <a href={broadcastArchiveArtistHref(track.submittedArtistName)} aria-label={`Open ${track.submittedArtistName} in the Broadcast Archive`} className="group relative block h-full w-full overflow-hidden">{artwork}<span className="absolute inset-x-0 bottom-0 bg-black/85 px-2 py-1 text-center text-[8px] font-bold uppercase tracking-[0.16em] text-cyan-200 opacity-90 transition group-hover:bg-cyan-200 group-hover:text-background">Artist Archive ↗</span></a>;
}

function tiktokHref(handle?: string | null): string | null { const cleaned = (handle ?? "").trim().replace(/^@+/, "").split(/[/?#]/)[0]?.replace(/[^a-zA-Z0-9._-]/g, ""); return cleaned ? `https://www.tiktok.com/@${cleaned}` : null; }
function TikTokLink({ handle }: { handle?: string | null }) { const href = tiktokHref(handle); if (!href || !handle) return null; return <a href={href} target="_blank" rel="noreferrer" className="text-accent underline-offset-2 hover:underline">{handle.startsWith("@") ? handle : `@${handle}`}</a>; }
function usefulDetected(track: QueuePublicTrack): string | null { const artist = track.detectedArtistName?.trim(); const title = track.detectedSongTitle?.trim() || track.providerTitle?.trim(); if (!artist && !title) return null; const submitted = `${track.submittedArtistName} ${track.submittedSongTitle}`.toLowerCase(); const detected = `${artist ?? ""} ${title ?? ""}`.trim(); return detected && !submitted.includes(detected.toLowerCase()) ? detected : null; }


function estimatePriorityImpactForTrack(timingSummary: QueueTimingDisplaySummary | null, track: QueuePublicTrack | null): ReturnType<typeof estimatePriorityImpact> | null {
  if (!timingSummary || !track) return null;
  const target = timingSummary.input.queue?.find((item) => item.id === track.id);
  if (!target) return null;
  return estimatePriorityImpact(timingSummary.input, target);
}

function publicSnapshotMovementKey(snapshot: QueuePublicSnapshot | null): string {
  if (!snapshot) return "empty";
  const encodeTrack = (track: QueuePublicTrack | null | undefined, zone: string) => track ? `${zone}:${track.id}:${track.lane}:${track.priorityUpgradeStatus ?? "none"}` : `${zone}:empty`;
  return [
    encodeTrack(snapshot.nowPlaying, "now"),
    encodeTrack(snapshot.upNext, "next"),
    ...snapshot.queue.map((track, index) => `${index}:${encodeTrack(track, "queue")}`),
    ...snapshot.completed.map((track, index) => `done:${index}:${track.id}`),
    `removed:${snapshot.session?.removedCount ?? 0}`,
  ].join("|");
}

function publicTrackStateMap(snapshot: QueuePublicSnapshot): Map<string, QueuePublicTrack> {
  const map = new Map<string, QueuePublicTrack>();
  for (const track of [snapshot.nowPlaying, snapshot.upNext, ...snapshot.queue, ...snapshot.completed]) {
    if (track) map.set(track.id, track);
  }
  return map;
}

function isActivePublicPriority(track: Pick<QueuePublicTrack, "lane" | "priorityUpgradeStatus">): boolean {
  return track.lane === "priority" && (track.priorityUpgradeStatus === "paid" || track.priorityUpgradeStatus === "manual");
}

function trackTone(track: QueuePublicTrack): ActivityTone {
  if (track.priorityUpgradeStatus === "checkout_pending") return "amber";
  if (isActivePublicPriority(track)) return "gold";
  if (track.lane === "wheel") return "cyan";
  if (track.priorityUpgradeStatus === "paid_needs_attention" || track.priorityUpgradeStatus === "failed" || track.priorityUpgradeStatus === "refunded") return "danger";
  return "red";
}

function dedupeActivities(items: Omit<QueueActivity, "id" | "createdAt">[]): Omit<QueueActivity, "id" | "createdAt">[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.text}:${item.detail}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}


function toneClass(tone: ActivityTone): string {
  if (tone === "gold") return "border-[#ffaa00]/45 text-[#ffaa00]";
  if (tone === "cyan") return "border-cyan-200/40 text-cyan-200";
  if (tone === "amber") return "border-[#ffaa00]/35 text-[#ffaa00]";
  if (tone === "archive") return "border-border text-muted";
  if (tone === "danger") return "border-danger/40 text-danger";
  return "border-accent/30 text-accent";
}

function QueueUpdateToast({ item }: { item: QueueActivity }) {
  return <div className={`queue-toast fixed right-4 top-20 z-[9500] w-[min(24rem,calc(100vw-2rem))] border bg-background/95 p-3 shadow-[0_0_42px_rgba(255,0,0,0.22)] ${toneClass(item.tone)}`} role="status" aria-live="polite"><p className="text-[10px] uppercase tracking-[0.3em]">Queue Updated</p><p className="mt-1 text-sm font-bold text-foreground">{item.text}</p><p className="mt-1 text-xs text-muted">{item.detail}</p><style jsx>{`.queue-toast{animation:queue-toast-in .28s ease-out}@keyframes queue-toast-in{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}@media (prefers-reduced-motion: reduce){.queue-toast{animation:none}}`}</style></div>;
}


function RoutingGhostLayer({ ghosts }: { ghosts: RoutingGhost[] }) {
  return <div className="routing-ghost-layer fixed inset-0 z-[9600] pointer-events-none" aria-hidden="true">{ghosts.map((ghost) => {
    const viewportWidth = typeof window === "undefined" ? 1200 : window.innerWidth;
    const minWidth = viewportWidth < 640 ? 240 : 320;
    const maxWidth = Math.min(viewportWidth - 24, viewportWidth < 640 ? 360 : 640);
    const sourceWeighted = ghost.from.width * 0.92;
    const destinationWeighted = ghost.to.width * (ghost.zone === "now" ? 0.58 : 0.86);
    const width = Math.min(maxWidth, Math.max(minWidth, sourceWeighted, destinationWeighted));
    const height = Math.min(176, Math.max(104, ghost.from.height * 0.76, ghost.to.height * (ghost.zone === "now" ? 0.34 : 0.58)));
    const fromLeft = Math.max(12, Math.min(viewportWidth - width - 12, ghost.from.left + ((ghost.from.width - width) / 2)));
    const toLeft = Math.max(12, Math.min(viewportWidth - width - 12, ghost.to.left + ((ghost.to.width - width) / 2)));
    const fromTop = ghost.from.top + ((ghost.from.height - height) / 2);
    const toTop = ghost.to.top + ((ghost.to.height - height) / 2);
    const tx = toLeft - fromLeft;
    const ty = toTop - fromTop;
    return <div key={ghost.id} className="routing-ghost" data-tone={ghost.tone} data-zone={ghost.zone} style={{ left: fromLeft, top: fromTop, width, minHeight: height, "--tx": `${tx}px`, "--ty": `${ty}px`, "--duration": `${ghost.duration}ms` } as CSSProperties}><div className="ghost-scan" /><div className="ghost-trail" /><div className="ghost-clamp" /><p className="ghost-label">{ghost.routeLabel}</p><p className="ghost-artist">{ghost.artist}</p><p className="ghost-title">{ghost.title}</p></div>;
  })}<style jsx>{`
    .routing-ghost-layer{overflow:visible}
    .routing-ghost{position:fixed;overflow:hidden;border:2px solid currentColor;background:rgba(6,6,7,.92);padding:1rem 1.1rem;box-shadow:0 0 52px currentColor, inset 0 0 34px rgba(255,255,255,.07);animation:ghost-route var(--duration) cubic-bezier(.16,1,.3,1) forwards;transform:translate3d(0,0,0);will-change:transform,opacity,filter;color:#ff2a2a}
    .ghost-scan{position:absolute;inset:0;background:repeating-linear-gradient(0deg,transparent 0 5px,rgba(255,255,255,.07) 5px 6px);opacity:.38;mix-blend-mode:screen}
    .ghost-trail{position:absolute;left:0;right:0;top:50%;height:2px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.85),currentColor,transparent);animation:ghost-free-trail var(--duration) ease-out forwards}
    .ghost-clamp{position:absolute;inset:4px;border:1px solid transparent;opacity:0}
    .ghost-label{position:relative;text-transform:uppercase;letter-spacing:.32em;font-size:11px;font-weight:800;color:currentColor}
    .ghost-artist{position:relative;margin-top:.45rem;font-size:clamp(1rem,2.3vw,1.55rem);font-weight:900;color:#fff;line-height:1.05;text-shadow:0 0 18px currentColor}
    .ghost-title{position:relative;margin-top:.3rem;font-size:clamp(.82rem,1.7vw,1.05rem);font-weight:700;color:rgba(255,255,255,.82);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .routing-ghost[data-tone="cyan"]{color:#67e8f9;border-radius:.85rem;box-shadow:0 0 46px rgba(103,232,249,.42),inset 0 0 28px rgba(103,232,249,.08)}
    .routing-ghost[data-tone="cyan"] .ghost-trail{height:100%;top:0;background:radial-gradient(circle at 78% 50%,transparent 0 1.05rem,currentColor 1.11rem 1.18rem,transparent 1.28rem),conic-gradient(from 0deg at 78% 50%,transparent,currentColor,transparent 36%,rgba(103,232,249,.35),transparent 72%);animation:ghost-wheel-trail var(--duration) ease-out forwards}
    .routing-ghost[data-tone="amber"]{color:#ffaa00;border-style:dashed;box-shadow:0 0 32px rgba(255,170,0,.24),inset 0 0 18px rgba(255,170,0,.07);animation-name:ghost-route-pending}
    .routing-ghost[data-tone="amber"] .ghost-trail{background:repeating-linear-gradient(90deg,currentColor 0 7px,transparent 7px 14px);animation:ghost-pending-trail var(--duration) steps(6,end) forwards}
    .routing-ghost[data-tone="gold"]{color:#ffaa00;box-shadow:0 0 54px rgba(255,170,0,.48),0 0 22px rgba(255,255,255,.18),inset 0 0 28px rgba(255,255,255,.08)}
    .routing-ghost[data-tone="gold"] .ghost-trail{left:-12%;right:-12%;top:30%;height:3px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.96),currentColor,transparent);transform:rotate(-9deg);animation:ghost-priority-trail var(--duration) ease-out forwards}
    .routing-ghost[data-tone="archive"]{color:#b7b7b7;box-shadow:0 0 24px rgba(183,183,183,.18);filter:saturate(.72)}
    .routing-ghost[data-tone="archive"] .ghost-trail{height:100%;top:0;background:radial-gradient(circle at 22% 38%,currentColor 0 1px,transparent 2px),radial-gradient(circle at 68% 62%,currentColor 0 1px,transparent 2px),repeating-linear-gradient(0deg,transparent 0 7px,rgba(183,183,183,.10) 7px 8px);animation:ghost-archive-dust var(--duration) ease-out forwards}
    .routing-ghost[data-tone="danger"]{color:#ff3b3b;box-shadow:0 0 42px rgba(255,0,0,.38),inset 0 0 24px rgba(255,0,0,.08);filter:saturate(.82)}
    .routing-ghost[data-tone="danger"] .ghost-trail{height:100%;top:0;background:linear-gradient(90deg,rgba(255,0,0,.54),transparent 36%),repeating-linear-gradient(90deg,transparent 0 10px,rgba(255,0,0,.32) 10px 13px,transparent 13px 20px);animation:ghost-danger-break var(--duration) ease-out forwards}
    .routing-ghost[data-zone="next"] .ghost-clamp{opacity:.9;border-color:currentColor;animation:ghost-clamp-lock var(--duration) ease-out forwards}
    .routing-ghost[data-zone="now"]{color:#fff6d8;box-shadow:0 0 68px rgba(255,170,0,.55),0 0 32px rgba(255,255,255,.24)}
    .routing-ghost[data-zone="now"] .ghost-clamp{opacity:.95;border-color:rgba(255,255,255,.85);background:repeating-linear-gradient(90deg,rgba(255,170,0,.38) 0 3px,transparent 3px 10px) 50% 80%/72% 26px no-repeat;animation:ghost-monitor-lock var(--duration) ease-out forwards}
    @keyframes ghost-route{0%{opacity:0;transform:translate3d(0,0,0) scale(.98);filter:brightness(1.7)}10%{opacity:.98}76%{opacity:.95}100%{opacity:0;transform:translate3d(var(--tx),var(--ty),0) scale(.94);filter:brightness(1)}}
    @keyframes ghost-route-pending{0%{opacity:0;transform:translate3d(0,0,0) scale(.98);filter:brightness(1.35)}20%{opacity:.92}45%{opacity:.52}70%{opacity:.96}100%{opacity:0;transform:translate3d(var(--tx),var(--ty),0) scale(.94);filter:brightness(.82)}}
    @keyframes ghost-free-trail{0%{transform:translateX(-38%) scaleX(.3);opacity:.2}45%{opacity:1}100%{transform:translateX(48%) scaleX(1.05);opacity:0}}
    @keyframes ghost-wheel-trail{0%{opacity:0;transform:scale(.72) rotate(-32deg)}40%{opacity:.82}100%{opacity:0;transform:scale(1.18) rotate(130deg)}}
    @keyframes ghost-pending-trail{0%{background-position:-32px 0;opacity:.25}50%{opacity:.85}100%{background-position:36px 0;opacity:0}}
    @keyframes ghost-priority-trail{0%{transform:translateY(18px) rotate(-9deg) scaleX(.18);opacity:.18}48%{opacity:1}100%{transform:translateY(-18px) rotate(-9deg) scaleX(1.1);opacity:0}}
    @keyframes ghost-archive-dust{0%{opacity:0;transform:scale(1.04)}44%{opacity:.54}100%{opacity:0;transform:scale(.94)}}
    @keyframes ghost-danger-break{0%{opacity:0;clip-path:inset(0 90% 0 0)}42%{opacity:.9;clip-path:inset(0 18% 0 0)}100%{opacity:0;clip-path:inset(0 0 0 72%)}}
    @keyframes ghost-clamp-lock{0%{clip-path:inset(48% 48% 48% 48%)}48%{clip-path:inset(0)}100%{clip-path:inset(10%);opacity:0}}
    @keyframes ghost-monitor-lock{0%{transform:scale(.96);filter:brightness(1.8)}44%{transform:scale(1);filter:brightness(1.35)}100%{transform:scale(1.03);opacity:0;filter:brightness(1)}}
    @media (prefers-reduced-motion: reduce){.routing-ghost,.ghost-trail,.ghost-clamp{animation:none!important;display:none}}
  `}</style></div>;
}

function SubmissionActivity({ items }: { items: QueueActivity[] }) {
  return <section className="activity-console relative overflow-hidden border border-border bg-surface p-4"><div className="activity-bus pointer-events-none absolute inset-x-0 top-10 h-px bg-accent/25" aria-hidden="true" /><div className="flex items-center justify-between gap-3"><p className="text-xs uppercase tracking-[0.3em] text-muted">Submission Activity</p><span className="text-[10px] uppercase tracking-widest text-muted">Portal event log · Public snapshot</span></div>{items.length === 0 ? <p className="mt-3 text-xs text-muted">Queue changes detected during this visit will appear here as packet route events.</p> : <div className="mt-3 grid gap-2">{items.slice(0, 4).map((item) => <article key={item.id} className={`activity-item relative overflow-hidden border bg-background/45 p-3 ${toneClass(item.tone)}`}><span className="activity-node" aria-hidden="true" /><p className="text-sm font-bold text-foreground">{item.text}</p><p className="mt-1 text-xs text-muted">{item.detail}</p></article>)}</div>}<style jsx>{`.activity-console::before{content:"";position:absolute;inset:0;background:linear-gradient(90deg,transparent,rgba(255,0,0,.06),transparent);pointer-events:none}.activity-bus{box-shadow:0 0 16px rgba(255,0,0,.22)}.activity-item{animation:activity-land .55s ease-out}.activity-node{position:absolute;left:.7rem;top:50%;width:.4rem;height:.4rem;border:1px solid currentColor;background:currentColor;box-shadow:0 0 14px currentColor;transform:translateY(-50%)}.activity-item p{padding-left:1rem}@keyframes activity-land{from{opacity:0;transform:translateX(-8px)}to{opacity:1;transform:translateX(0)}}@media (prefers-reduced-motion: reduce){.activity-item{animation:none}}`}</style></section>;
}

function SignalResidue({ tone, seed }: { tone: ActivityTone; seed: string }) {
  const color = tone === "gold" ? "#ffaa00" : tone === "cyan" ? "#67e8f9" : tone === "amber" ? "#ffaa00" : tone === "archive" ? "#b7b7b7" : tone === "danger" ? "#ff3b3b" : "#ff2a2a";
  return <div className="signal-residue pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true"><div className="residue-aperture" style={{ color }} />{Array.from({ length: 14 }).map((_, index) => { const hash = stableHash(`${seed}:${index}:${tone}`); const dx = ((hash % 90) - 45); const dy = (((hash >> 5) % 70) - 35); return <span key={index} style={{ left: "50%", top: "50%", color, animationDelay: `${index * 34}ms`, "--dx": `${dx}px`, "--dy": `${dy}px` } as CSSProperties} />; })}<style jsx>{`.residue-aperture{position:absolute;inset:.35rem;border:2px solid currentColor;box-shadow:0 0 34px currentColor,inset 0 0 24px currentColor;animation:residue-aperture .86s ease-out forwards}.signal-residue span{position:absolute;width:3px;height:3px;background:currentColor;box-shadow:0 0 10px currentColor;animation:signal-residue-route .9s ease-out forwards}.signal-residue span:nth-child(3n){width:1px;height:10px}.signal-residue span:nth-child(4n){width:8px;height:1px}.signal-residue span:nth-child(5n){width:2px;height:2px;border:1px solid currentColor;background:transparent}@keyframes residue-aperture{0%{opacity:0;transform:scale(.94);filter:brightness(1.8)}32%{opacity:.92}100%{opacity:0;transform:scale(1.025);filter:brightness(1)}}@keyframes signal-residue-route{0%{opacity:0;transform:translate3d(0,0,0) scale(.5)}25%{opacity:.95}100%{opacity:0;transform:translate3d(var(--dx),var(--dy),0) scale(1)}}@media (prefers-reduced-motion: reduce){.residue-aperture,.signal-residue span{animation:none;opacity:.42}}`}</style></div>;
}

function TrackTitleLink({ track }: { track: QueuePublicTrack }) {
  if (!track.publicSourceUrl) return <p className="mt-1 text-lg text-foreground/90">{track.submittedSongTitle}</p>;
  return <a href={track.publicSourceUrl} target="_blank" rel="noreferrer" className="mt-1 block text-lg text-foreground/90 underline-offset-2 hover:text-accent hover:underline">{track.submittedSongTitle}</a>;
}



type PublicSessionPhase = "syncing" | "empty" | "archived" | "closed" | "open" | "liveOpen" | "liveClosed";

function publicSessionPhase(snapshot: QueuePublicSnapshot | null, submissionsOpen: boolean, isBroadcastActive: boolean): PublicSessionPhase {
  if (!snapshot) return "syncing";
  if (!snapshot.session) return "empty";
  if (snapshot.session.status === "archived" || snapshot.session.broadcastPhase === "ended") return "archived";
  if (isBroadcastActive) return submissionsOpen ? "liveOpen" : "liveClosed";
  return submissionsOpen ? "open" : "closed";
}

function uniqueActiveTracks(snapshot: QueuePublicSnapshot | null): QueuePublicTrack[] {
  if (!snapshot?.session || snapshot.session.status === "archived" || snapshot.session.broadcastPhase === "ended") return [];
  const seen = new Set<string>();
  return [snapshot.nowPlaying, snapshot.upNext, ...snapshot.queue].filter((track): track is QueuePublicTrack => {
    if (!track || seen.has(track.id)) return false;
    seen.add(track.id);
    return true;
  });
}

function publicQueueCounts(snapshot: QueuePublicSnapshot | null) {
  const activeTracks = uniqueActiveTracks(snapshot);
  const completed = snapshot?.session?.completedCount ?? snapshot?.completed.length ?? 0;
  const removed = snapshot?.session?.removedCount ?? 0;
  return {
    active: activeTracks.length,
    remaining: activeTracks.length,
    waiting: snapshot?.queue.length ?? 0,
    completed,
    total: activeTracks.length + completed + removed,
    pending: activeTracks.filter((track) => track.priorityUpgradeStatus === "checkout_pending").length,
    priority: activeTracks.filter((track) => track.lane === "priority" && (track.priorityUpgradeStatus === "paid" || track.priorityUpgradeStatus === "manual")).length,
    wheel: activeTracks.filter((track) => track.lane === "wheel").length,
  };
}

function sessionReadouts(snapshot: QueuePublicSnapshot | null, counts: ReturnType<typeof publicQueueCounts>, pressure: ReturnType<typeof pressureLevel>): string[] {
  const lines = [
    counts.active > 0 ? `${counts.active} songs still waiting or coming up.` : "No songs still waiting or coming up.",
    counts.waiting > 0 ? `${counts.waiting} waiting below Now Playing and Next In Line.` : "Waiting queue clear.",
  ];
  if (counts.pending > 0) lines.push(`${counts.pending} Payment Processing: checkout started. Skip is not active yet.`);
  if ((snapshot?.queue ?? []).some((track) => track.lane === "wheel")) lines.push("Wheel Chosen: picked from the 10K tap wheel.");
  if ((snapshot?.queue ?? []).some((track) => track.lane === "priority" && (track.priorityUpgradeStatus === "paid" || track.priorityUpgradeStatus === "manual"))) lines.push("Priority Signal active.");
  if (counts.completed > 0) lines.push(`${counts.completed} songs already played.`);
  const seed = `${snapshot?.session?.sessionId ?? "sync"}:${counts.total}:${pressure}`;
  const flavor = ["BNL-01 receiver trace stabilized.", "Host band interference cleared.", "Corridor alignment corrected.", "Signal anomaly contained."];
  if (stableHash(seed) % 13 === 0) lines.push(stableVariant(seed, flavor));
  return lines.slice(0, 5);
}

function phaseVisual(phase: PublicSessionPhase) {
  if (phase === "syncing") return { eyebrow: "SYNCING PUBLIC SIGNAL", title: "QUEUE TERMINAL HANDSHAKE", body: "Reading the current BARCODE Radio queue before opening the monitor.", tone: "text-muted", border: "border-border", meter: "bg-muted/60", gate: "SIGNAL SEARCH" };
  if (phase === "empty") return { eyebrow: "NO ACTIVE QUEUE", title: "RECEIVER STANDBY", body: "The queue service is online, but no BARCODE Radio session currently exists.", tone: "text-muted", border: "border-border", meter: "bg-muted/60", gate: "NO SESSION" };
  if (phase === "archived") return { eyebrow: "BROADCAST ENDED", title: "SESSION ARCHIVED", body: "SUBMISSIONS CLOSED. No active BARCODE Radio session is currently accepting songs.", tone: "text-danger", border: "border-danger/35", meter: "bg-danger/60", gate: "ARCHIVE SEAL" };
  if (phase === "closed") return { eyebrow: "SESSION ONLINE", title: "SUBMISSION GATE CLOSED", body: "The broadcast corridor is powered on, but new songs are not currently being accepted. Stand by for intake.", tone: "text-cyan-200", border: "border-cyan-200/30", meter: "bg-cyan-200/60", gate: "INTAKE BARRIER SEALED" };
  if (phase === "open") return { eyebrow: "SUBMISSIONS OPEN", title: "SUBMIT YOUR TRACK NOW", body: "Free queue submissions are open. Priority Signal is a paid skip after payment clears.", tone: "text-accent", border: "border-accent/50", meter: "bg-accent/70", gate: "SUBMIT TRACK" };
  if (phase === "liveClosed") return { eyebrow: "BROADCAST ACTIVE", title: "HOST PROTOCOL INITIALIZED", body: "The live monitor remains locked while the intake gate is resealed. Submissions are closed; the broadcast is not ended.", tone: "text-[#ffaa00]", border: "border-[#ffaa00]/50", meter: "bg-[#ffaa00]/70", gate: "LIVE SIGNAL / INTAKE CLOSED" };
  return { eyebrow: "BROADCAST ACTIVE", title: "HOST PROTOCOL INITIALIZED", body: "Now Playing is live. Submissions remain open while the show is running.", tone: "text-[#ffaa00]", border: "border-[#ffaa00]/50", meter: "bg-[#ffaa00]/70", gate: "LIVE SIGNAL / INTAKE OPEN" };
}

function SessionPortalAperture({ phase, counts, intakeWindow, isBroadcastActive, canSubmit }: { phase: PublicSessionPhase; counts: ReturnType<typeof publicQueueCounts>; intakeWindow: string | null; isBroadcastActive: boolean; canSubmit: boolean }) {
  const isOpen = phase === "open" || phase === "liveOpen";
  return (
    <div className="session-portal mt-4 overflow-hidden border border-border bg-background/50 p-3" data-phase={phase}>
      <div className="session-aperture relative aspect-[16/10] min-h-56 overflow-hidden border border-border/70 bg-black/35">
        <div className="session-tunnel absolute inset-0" aria-hidden="true" />
        <div className="session-grid absolute inset-0" aria-hidden="true" />
        <div className="session-rings absolute inset-0" aria-hidden="true"><span /><span /><span /></div>
        <div className="session-wave absolute inset-x-8 top-1/2 h-20 -translate-y-1/2" aria-hidden="true">{Array.from({ length: 24 }).map((_, index) => <span key={index} style={{ animationDelay: `${index * 42}ms` }} />)}</div>
        <div className="session-packets absolute inset-0" aria-hidden="true">{Array.from({ length: Math.min(8, Math.max(2, counts.active + counts.pending + counts.wheel)) }).map((_, index) => <span key={index} style={{ animationDelay: `${index * 150}ms` }} />)}</div>
        <div className="session-scene-core absolute inset-0" aria-hidden="true"><span /><span /></div>
        <div className="session-archive-vault absolute inset-0" aria-hidden="true"><span className="vault-shell" /><span className="vault-spool left" /><span className="vault-spool right" /></div>
        <div className="session-gate-latches absolute inset-0" aria-hidden="true"><span /><span /><span /><span /></div>
        <div className="session-intake-fragments absolute inset-0" aria-hidden="true">{Array.from({ length: 14 }).map((_, index) => <span key={index} style={{ animationDelay: `${index * 88}ms` }} />)}</div>
        <div className="session-monitor-reticle absolute inset-0" aria-hidden="true"><span /><span /><span /></div>
        <div className="session-live-bars absolute bottom-12 left-1/2 flex h-16 -translate-x-1/2 items-end gap-1" aria-hidden="true">{Array.from({ length: 20 }).map((_, index) => <span key={index} style={{ animationDelay: `${index * 32}ms` }} />)}</div>
        {counts.pending > 0 && <div className="session-handshake absolute right-3 top-3 border border-[#ffaa00]/45 bg-[#ffaa00]/10 px-2 py-1 text-[10px] uppercase tracking-widest text-[#ffaa00]">{counts.pending} payment processing</div>}
        {counts.priority > 0 && <div className="session-relay absolute left-0 right-0 top-7 h-px bg-[#ffaa00]/60" aria-hidden="true" />}
        {counts.wheel > 0 && <div className="session-wheel absolute bottom-9 left-6 right-6 h-px bg-cyan-200/60" aria-hidden="true" />}
        <div className="session-shutters absolute inset-0" aria-hidden="true"><span /><span /></div>
        {phase === "archived" && <div className="session-archive-seal absolute inset-0 grid place-items-center"><span>ARCHIVE SEAL</span></div>}
        <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-3 text-[10px] uppercase tracking-[0.22em]">
          <span className={isBroadcastActive ? "text-[#ffaa00]" : isOpen ? "text-accent" : "text-muted"}>{isBroadcastActive ? "Broadcast monitor lock" : isOpen ? "Intake corridor open" : phase === "syncing" ? "Receiver tuning" : "Submission gate closed"}</span>
          {intakeWindow && canSubmit && <span className="submission-window border border-accent/40 bg-accent/10 px-2 py-1 text-accent">{intakeWindow} window</span>}
        </div>
      </div>
      <style jsx>{`.session-archive-vault,.session-gate-latches,.session-intake-fragments,.session-monitor-reticle,.session-live-bars{opacity:0;transition:opacity .45s ease}.session-scene-core span{position:absolute;left:50%;top:50%;border:1px solid rgba(255,255,255,.18);transform:translate(-50%,-50%);box-shadow:0 0 28px rgba(255,255,255,.08)}.session-scene-core span:first-child{width:34%;height:28%;animation:session-scene-core-pulse 2.8s ease-in-out infinite}.session-scene-core span:last-child{width:16%;height:12%;animation:session-scene-core-pulse 2.8s ease-in-out infinite reverse}.session-archive-vault{background:radial-gradient(circle at center,rgba(255,0,0,.08),transparent 32%),repeating-linear-gradient(0deg,transparent 0 9px,rgba(255,255,255,.025) 9px 10px)}.session-portal[data-phase="archived"] .session-archive-vault{opacity:1}.session-portal[data-phase="archived"] .session-scene-core span{width:10%;height:7%;border-color:rgba(255,0,0,.38);animation:session-archive-core 4.8s ease-in-out infinite}.vault-shell{position:absolute;left:22%;right:22%;top:24%;bottom:24%;border:1px solid rgba(183,183,183,.18);background:linear-gradient(90deg,rgba(255,255,255,.03),rgba(255,0,0,.045),rgba(255,255,255,.02));box-shadow:inset 0 0 28px rgba(255,0,0,.06)}.vault-spool{position:absolute;top:42%;width:3rem;height:3rem;border:1px solid rgba(183,183,183,.22);border-radius:999px;box-shadow:0 0 18px rgba(255,255,255,.06);animation:session-vault-spool 7s linear infinite}.vault-spool.left{left:28%}.vault-spool.right{right:28%;animation-direction:reverse}.session-portal[data-phase="closed"] .session-gate-latches,.session-portal[data-phase="liveClosed"] .session-gate-latches{opacity:1}.session-gate-latches span{position:absolute;left:14%;right:14%;height:2px;background:linear-gradient(90deg,transparent,rgba(103,232,249,.56),transparent);box-shadow:0 0 16px rgba(103,232,249,.18);animation:session-gate-lock-sweep 1.9s ease-in-out infinite}.session-gate-latches span:nth-child(1){top:28%}.session-gate-latches span:nth-child(2){top:42%;animation-delay:.2s}.session-gate-latches span:nth-child(3){top:58%;animation-delay:.4s}.session-gate-latches span:nth-child(4){top:72%;animation-delay:.6s}.session-portal[data-phase="open"] .session-intake-fragments,.session-portal[data-phase="liveOpen"] .session-intake-fragments{opacity:1}.session-intake-fragments span{position:absolute;left:10%;top:50%;width:8px;height:2px;background:#fff;box-shadow:0 0 12px rgba(255,0,0,.75);animation:session-intake-fragment 1.18s ease-in-out infinite}.session-intake-fragments span:nth-child(3n){background:#ff2a2a}.session-intake-fragments span:nth-child(even){left:auto;right:10%;animation-name:session-intake-fragment-reverse}.session-portal[data-phase="liveOpen"] .session-monitor-reticle,.session-portal[data-phase="liveClosed"] .session-monitor-reticle,.session-portal[data-phase="liveOpen"] .session-live-bars,.session-portal[data-phase="liveClosed"] .session-live-bars{opacity:1}.session-monitor-reticle span{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);border:1px solid rgba(255,170,0,.42);box-shadow:0 0 30px rgba(255,170,0,.18);animation:session-monitor-lock 1.8s ease-in-out infinite}.session-monitor-reticle span:nth-child(1){width:52%;height:58%}.session-monitor-reticle span:nth-child(2){width:32%;height:34%;animation-delay:.2s}.session-monitor-reticle span:nth-child(3){width:68%;height:2px;border-left:0;border-right:0}.session-live-bars span{width:4px;background:rgba(255,170,0,.82);box-shadow:0 0 14px rgba(255,170,0,.32);animation:session-live-bar 720ms ease-in-out infinite}.session-portal[data-phase="liveClosed"] .session-intake-fragments{opacity:.16}.session-portal[data-phase="liveClosed"] .session-packets{opacity:.18}@keyframes session-scene-core-pulse{0%,100%{opacity:.36;transform:translate(-50%,-50%) scale(.92)}50%{opacity:.86;transform:translate(-50%,-50%) scale(1.08)}}@keyframes session-archive-core{0%,100%{opacity:.25;filter:brightness(.8)}50%{opacity:.55;filter:brightness(1.2)}}@keyframes session-vault-spool{to{transform:rotate(360deg)}}@keyframes session-gate-lock-sweep{0%,100%{opacity:.18;transform:scaleX(.25)}45%{opacity:.85;transform:scaleX(1)}}@keyframes session-intake-fragment{0%{opacity:0;transform:translateX(-10vw) translateY(-20px) scaleX(.4)}40%{opacity:1}100%{opacity:0;transform:translateX(34vw) translateY(0) scaleX(.05)}}@keyframes session-intake-fragment-reverse{0%{opacity:0;transform:translateX(10vw) translateY(20px) scaleX(.4)}40%{opacity:1}100%{opacity:0;transform:translateX(-34vw) translateY(0) scaleX(.05)}}@keyframes session-monitor-lock{0%,100%{opacity:.45;transform:translate(-50%,-50%) scale(.96)}50%{opacity:1;transform:translate(-50%,-50%) scale(1.02)}}@keyframes session-live-bar{0%,100%{height:18%;opacity:.45}50%{height:100%;opacity:1}}@media (prefers-reduced-motion: reduce){.session-scene-core span,.vault-spool,.session-gate-latches span,.session-intake-fragments span,.session-monitor-reticle span,.session-live-bars span{animation:none}}`}</style>
    </div>
  );
}

function SessionPhasePanel({ snapshot, timingSummary = null, submissionsOpen, canSubmit, isBroadcastActive }: { snapshot: QueuePublicSnapshot | null; timingSummary?: QueueTimingDisplaySummary | null; submissionsOpen: boolean; canSubmit: boolean; isBroadcastActive: boolean }) {
  const [nowMs, setNowMs] = useState(0);
  const [transitionPhase, setTransitionPhase] = useState<PublicSessionPhase | null>(null);
  const phaseRef = useRef<PublicSessionPhase>("syncing");
  useEffect(() => {
    setNowMs(Date.now());
    const interval = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);
  const phase = publicSessionPhase(snapshot, submissionsOpen, isBroadcastActive);
  useEffect(() => {
    if (phaseRef.current === phase) return;
    phaseRef.current = phase;
    setTransitionPhase(phase);
    const timer = window.setTimeout(() => setTransitionPhase(null), 1400);
    return () => window.clearTimeout(timer);
  }, [phase]);
  const session = snapshot?.session;
  const intakeClock = session?.preShowEndsAt ? new Date(session.preShowEndsAt).getTime() - nowMs : 0;
  const intakeWindow = Number.isFinite(intakeClock) && intakeClock > 0 ? `${Math.floor(intakeClock / 60000)}:${Math.floor((intakeClock % 60000) / 1000).toString().padStart(2, "0")}` : null;
  const copy = phaseVisual(phase);
  const counts = publicQueueCounts(snapshot);
  const pressure = pressureLevel(timingSummary);
  const readouts = sessionReadouts(snapshot, counts, pressure);
  const routePulses = pressure === "high" ? 5 : pressure === "medium" ? 4 : 3;

  return <section data-phase={phase} data-pressure={pressure} data-transition={transitionPhase ?? undefined} className={`session-machine relative overflow-hidden border bg-surface p-5 ${copy.border}`}><div className="phase-scan pointer-events-none absolute inset-0" /><div className="phase-routes pointer-events-none absolute inset-0">{Array.from({ length: routePulses }).map((_, index) => <span key={index} style={{ top: `${26 + index * (48 / Math.max(1, routePulses - 1))}%`, animationDelay: `${index * 130}ms` }} />)}</div><div className="relative grid gap-5 lg:grid-cols-[1fr_1fr]"><div><p className={`text-xs uppercase tracking-[0.35em] ${copy.tone}`}>{copy.eyebrow}</p><h2 className={`mt-2 text-2xl font-bold ${copy.tone}`}>{copy.title}</h2><p className="mt-3 max-w-3xl text-sm text-muted">{copy.body}</p><div className="mt-4 grid gap-2 border border-border/60 bg-background/40 p-3 text-xs text-muted">{readouts.map((line) => <p key={line} className="font-mono uppercase tracking-[0.16em]">{line}</p>)}</div><div className="mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4"><PhaseChip label="Broadcast" value={isBroadcastActive ? "Active" : "Standby"} active={isBroadcastActive} /><PhaseChip label="Submissions" value={submissionsOpen ? "Open" : "Closed"} active={submissionsOpen} /><PhaseChip label="Session" value={snapshot ? session?.status ?? "Syncing" : "Syncing"} active={Boolean(snapshot && session?.status !== "archived")} /><PhaseChip label="Gate" value={copy.gate} active={phase === "open" || phase === "liveOpen"} /></div></div><SessionPortalAperture phase={phase} counts={counts} intakeWindow={intakeWindow} isBroadcastActive={isBroadcastActive} canSubmit={canSubmit} /></div><style jsx>{`.session-machine{transition:border-color .7s ease,box-shadow .7s ease,filter .7s ease;min-height:28rem}.phase-scan{background:linear-gradient(transparent 50%,rgba(255,255,255,.075) 50%);background-size:100% 6px;animation:phase-scan 3s linear infinite;opacity:.16}.phase-routes span{position:absolute;left:10%;right:10%;height:1px;background:linear-gradient(90deg,transparent,rgba(255,0,0,.48),transparent);animation:phase-route 2.4s ease-in-out infinite}.session-machine[data-pressure="low"] .phase-scan{animation-duration:4.6s;opacity:.09}.session-machine[data-pressure="low"] .phase-routes span{animation-duration:3.8s;opacity:.42}.session-machine[data-pressure="medium"] .phase-scan{animation-duration:3s;opacity:.16}.session-machine[data-pressure="high"] .phase-scan{animation-duration:1.75s;opacity:.26}.session-machine[data-pressure="high"] .phase-routes span{animation-duration:1.5s;box-shadow:0 0 14px rgba(255,170,0,.25)}.session-machine[data-phase="archived"]{filter:saturate(.55)}.session-machine[data-phase="archived"] .phase-scan{opacity:.07;animation-duration:5s}.session-machine[data-transition]{animation:session-mode-swap 1.15s ease-out}.submission-window{animation:submission-window-in .85s ease-out}.session-aperture{box-shadow:inset 0 0 34px rgba(255,255,255,.05)}.session-tunnel{background:radial-gradient(ellipse at center,rgba(255,255,255,.08),transparent 18%,rgba(255,0,0,.13) 30%,transparent 54%),repeating-linear-gradient(90deg,transparent 0 7%,rgba(255,255,255,.055) 7% calc(7% + 1px),transparent calc(7% + 1px) 14%);animation:session-breathe 3s ease-in-out infinite}.session-grid{background:linear-gradient(115deg,transparent 46%,rgba(255,0,0,.20) 50%,transparent 54%),linear-gradient(65deg,transparent 46%,rgba(255,255,255,.12) 50%,transparent 54%);clip-path:polygon(10% 0,90% 0,58% 100%,42% 100%);opacity:.62;animation:session-grid 2.6s linear infinite}.session-rings span{position:absolute;inset:17%;border:1px solid rgba(255,255,255,.16);box-shadow:0 0 28px rgba(255,0,0,.18);animation:session-ring 2.5s ease-in-out infinite}.session-rings span:nth-child(2){inset:27%;border-color:rgba(255,0,0,.42);animation-delay:.22s}.session-rings span:nth-child(3){inset:39%;border-color:rgba(255,255,255,.28);animation-delay:.44s}.session-wave{display:flex;align-items:center;justify-content:center;gap:4px}.session-wave span{width:3px;height:18%;background:rgba(255,170,0,.78);box-shadow:0 0 14px rgba(255,170,0,.35);animation:session-wave 900ms ease-in-out infinite}.session-packets span{position:absolute;left:8%;top:50%;width:22%;height:1px;background:linear-gradient(90deg,transparent,rgba(255,0,0,.85),#fff);transform-origin:right center;animation:session-packet 1.55s ease-in-out infinite}.session-packets span:nth-child(even){left:auto;right:8%;background:linear-gradient(270deg,transparent,rgba(255,0,0,.85),#fff);transform-origin:left center}.session-shutters span{position:absolute;left:8%;right:8%;height:44%;border:1px solid rgba(255,255,255,.12);background:linear-gradient(rgba(0,0,0,.72),rgba(255,255,255,.04));transition:transform .7s ease,opacity .7s ease}.session-shutters span:first-child{top:0}.session-shutters span:last-child{bottom:0}.session-portal[data-phase="open"] .session-shutters span,.session-portal[data-phase="liveOpen"] .session-shutters span{transform:translateY(-76%);opacity:.36}.session-portal[data-phase="open"] .session-shutters span:last-child,.session-portal[data-phase="liveOpen"] .session-shutters span:last-child{transform:translateY(76%)}.session-portal[data-phase="liveClosed"] .session-shutters span:first-child{transform:translateY(-54%);opacity:.44}.session-portal[data-phase="liveClosed"] .session-shutters span:last-child{transform:translateY(54%);opacity:.44}.session-portal[data-phase="closed"] .session-rings span{border-color:rgba(103,232,249,.22);box-shadow:0 0 24px rgba(103,232,249,.12)}.session-portal[data-phase="syncing"] .session-aperture{animation:receiver-tune .9s steps(2,end) infinite}.session-portal[data-phase="archived"] .session-tunnel,.session-portal[data-phase="archived"] .session-grid,.session-portal[data-phase="archived"] .session-packets{opacity:.12;animation-duration:6s}.session-archive-seal span{border:1px solid rgba(255,0,0,.45);background:rgba(0,0,0,.72);padding:.75rem 1rem;color:#ff3b3b;font-size:.7rem;letter-spacing:.32em;transform:rotate(-8deg);box-shadow:0 0 34px rgba(255,0,0,.14)}.session-handshake{animation:session-handshake 1s steps(2,end) infinite}.session-relay{box-shadow:0 0 18px rgba(255,170,0,.55)}.session-wheel{box-shadow:0 0 18px rgba(103,232,249,.55)}@keyframes phase-scan{from{background-position:0 0}to{background-position:0 48px}}@keyframes phase-route{0%,100%{opacity:.08;transform:scaleX(.15)}45%{opacity:.75;transform:scaleX(1)}}@keyframes session-mode-swap{0%{clip-path:inset(0 100% 0 0);filter:brightness(1.7)}38%{clip-path:inset(0 0 0 0);filter:brightness(1.25)}100%{filter:brightness(1)}}@keyframes submission-window-in{0%{opacity:0;transform:translateY(8px);box-shadow:0 0 0 rgba(255,0,0,0)}100%{opacity:1;transform:translateY(0);box-shadow:0 0 26px rgba(255,0,0,.16)}}@keyframes session-breathe{0%,100%{transform:scale(.94);opacity:.68}50%{transform:scale(1.02);opacity:1}}@keyframes session-grid{from{background-position:0 0}to{background-position:42px 0}}@keyframes session-ring{0%,100%{transform:scale(.92);opacity:.38}50%{transform:scale(1.06);opacity:.95}}@keyframes session-wave{0%,100%{height:16%;opacity:.45}50%{height:86%;opacity:1}}@keyframes session-packet{0%{opacity:0;transform:translateX(-30%) scaleX(.18)}45%{opacity:1}100%{opacity:0;transform:translateX(155%) scaleX(.04)}}@keyframes receiver-tune{0%,100%{filter:brightness(1) contrast(1)}50%{filter:brightness(1.8) contrast(1.35)}}@keyframes session-handshake{0%,100%{opacity:.55}50%{opacity:1}}@media (prefers-reduced-motion: reduce){.phase-scan,.phase-routes span,.session-machine[data-transition],.submission-window,.session-tunnel,.session-grid,.session-rings span,.session-wave span,.session-packets span,.session-handshake,.session-portal[data-phase="syncing"] .session-aperture{animation:none}.session-shutters span{transition:none}}`}</style></section>;
}

function PhaseChip({ label, value, active }: { label: string; value: string; active: boolean }) {
  return <div className={`border p-2 ${active ? "border-accent/40 bg-accent/5" : "border-border bg-background/45"}`}><p className="uppercase tracking-widest text-muted">{label}</p><p className={active ? "mt-1 text-accent" : "mt-1 text-muted"}>{value}</p></div>;
}

function PriorityPurchaseTag({ track, className = "" }: { track: QueuePublicTrack | null; className?: string }) {
  const purchase = track ? confirmedPriorityPurchaseDisplay(track) : null;
  if (!purchase) return null;
  return <p className={`inline-flex max-w-full flex-wrap border border-[#ffaa00]/70 bg-[#ffaa00]/15 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-[#ffaa00] ${className}`}>{purchase.text}</p>;
}

function CollaboratorLine({ names, className = "" }: { names?: string | null; className?: string }) {
  const value = names?.trim();
  if (!value) return null;
  return <p className={`text-sm font-bold text-accent ${className}`}><span className="uppercase tracking-widest">Featuring:</span> {value}</p>;
}

function NowPlaying({ title, track, compact = false, domId, viewerSubmittedTrackIds, residue }: { title: string; track: QueuePublicTrack | null; compact?: boolean; domId?: string; viewerSubmittedTrackIds: Set<string>; residue?: { tone: ActivityTone; nonce: number } }) {
  const detected = track ? usefulDetected(track) : null;
  const isMine = Boolean(track?.id && viewerSubmittedTrackIds.has(track.id));
  const isLanding = isMine;
  const isNowPlaying = title === "Now Playing";
  const tone = isNowPlaying ? "text-[#ffaa00]" : "text-accent";
  return <div id={domId} data-track-id={track?.id} data-track-card={track ? "true" : undefined} data-track-zone={isNowPlaying ? "now" : "next"} data-track-tone={track ? trackFlipTone(track, isNowPlaying ? "now" : "next") : undefined} data-track-artist={track?.submittedArtistName} data-track-title={track?.submittedSongTitle} data-track-label={isNowPlaying ? "Now Playing" : "Next In Line"} className={`broadcast-slot relative overflow-hidden border bg-surface p-4 transition-all ${isNowPlaying ? "broadcast-now border-[#ffaa00]/50 shadow-[0_0_34px_rgba(255,170,0,0.14)]" : "broadcast-next border-accent/40"} ${isLanding ? "packet-lock border-accent shadow-[0_0_44px_rgba(255,0,0,0.34)]" : ""} ${isMine ? "border-accent/70 shadow-[0_0_42px_rgba(255,0,0,0.26)]" : ""} ${compact ? "" : "min-h-[15rem]"}`}><div className="slot-scan pointer-events-none absolute inset-0" />{track && residue && <SignalResidue tone={residue.tone} seed={`${track.id}:${residue.nonce}`} />}<p className={`relative text-xs uppercase tracking-[0.35em] ${tone}`} title={isNowPlaying ? "Playing now." : "Coming up next."}>{title}</p>{isMine && <p className="relative mt-2 inline-flex border border-accent/55 bg-accent/15 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-accent">{isNowPlaying ? "YOUR TRACK IS PLAYING NOW" : "YOUR TRACK IS COMING UP NEXT"}</p>}<PriorityPurchaseTag track={track} className="relative mt-2" /><p className="relative mt-1 text-[11px] text-muted">{isNowPlaying ? "Playing now." : "Coming up next."}</p>{track ? <div className={`relative mt-3 grid gap-4 ${compact ? "grid-cols-[5.5rem_1fr]" : "sm:grid-cols-[12rem_1fr]"}`}><div className={`${compact ? "h-24" : "aspect-square max-h-56"} overflow-hidden border ${isNowPlaying ? "border-[#ffaa00]/45" : "border-accent/40"}`}><SourceArt track={track} /></div><div className="self-center"><h3 className={`${compact ? "text-xl" : "text-3xl"} font-bold text-foreground`}>{track.submittedArtistName}</h3><CollaboratorLine names={track.collaboratorNames} className="mt-1" /><TrackTitleLink track={track} /><div className="mt-3 grid gap-1 text-xs text-muted"><TikTokLink handle={track.tiktokHandle} />{detected && <p>Detected signal: {detected}</p>}{!track.durationIsEstimate && <p>Runtime locked: {track.durationLabel}</p>}</div>{isNowPlaying && <div className="live-meter mt-4 grid grid-cols-12 items-end gap-1" aria-hidden="true">{[20, 46, 32, 70, 38, 82, 28, 56, 44, 76, 34, 62].map((height, index) => <span key={index} className="bg-[#ffaa00]/70" style={{ height: `${height / 3}px`, animationDelay: `${index * 55}ms` }} />)}</div>}</div></div> : <div className="relative mt-3 grid gap-4 sm:grid-cols-[8rem_1fr]"><div className="h-32 overflow-hidden border border-accent/30"><SourceArt track={null} /></div><p className="self-center text-sm text-muted">No song is in this slot yet.</p></div>}<style jsx>{`.slot-scan{background:linear-gradient(transparent 50%,rgba(255,255,255,.06) 50%);background-size:100% 6px;opacity:.12}.broadcast-now .slot-scan{animation:slot-scan 2.2s linear infinite}.broadcast-next{animation:next-slot-pulse 2.8s ease-in-out infinite}.packet-lock{animation:packet-card-lock 900ms ease-out}.live-meter span{animation:live-meter 900ms ease-in-out infinite}@keyframes slot-scan{from{background-position:0 0}to{background-position:0 42px}}@keyframes next-slot-pulse{0%,100%{box-shadow:0 0 0 rgba(255,0,0,0)}50%{box-shadow:0 0 22px rgba(255,0,0,.12)}}@keyframes packet-card-lock{0%{transform:translateY(4px);filter:brightness(1.5)}100%{transform:translateY(0);filter:brightness(1)}}@keyframes live-meter{0%,100%{transform:scaleY(.45);opacity:.45}50%{transform:scaleY(1);opacity:1}}@media (prefers-reduced-motion: reduce){.broadcast-now .slot-scan,.broadcast-next,.packet-lock,.live-meter span{animation:none}}`}</style></div>;
}

function WheelSpinsWaitingPanel({ snapshot, pulse }: { snapshot: QueuePublicSnapshot | null; pulse: boolean }) {
  const wheelSpinsWaiting = snapshot?.session?.wheelSpinsOwed ?? 0;
  const active = wheelSpinsWaiting > 0;
  return <section data-active={active ? "true" : undefined} data-pulse={active && pulse ? "true" : undefined} className={`wheel-spins-waiting-panel relative overflow-hidden border p-4 ${active ? "border-cyan-200/55 bg-cyan-200/5 shadow-[0_0_34px_rgba(103,232,249,0.16)]" : "border-border bg-surface"}`} aria-label="Wheel Spins Unlocked" role="status" aria-live="polite"><div className="relative z-10 grid gap-3 sm:grid-cols-[auto_1fr]"><div><p className={`text-[10px] uppercase tracking-[0.34em] ${active ? "text-cyan-200" : "text-muted"}`}>Wheel Spins Unlocked</p><p className={`mt-2 text-5xl font-black leading-none ${active ? "text-cyan-200" : "text-foreground"}`}>{wheelSpinsWaiting}</p></div><div className="self-end"><p className="text-sm font-bold text-foreground">Wheel Spins Unlocked: {wheelSpinsWaiting}</p><p className="mt-1 text-xs leading-relaxed text-muted">This is the number of unlocked wheel spins.</p><p className="mt-2 text-[10px] uppercase tracking-[0.24em] text-muted">Wheel Chosen means the host selected a specific track.</p></div></div><span className="wheel-orbit wheel-orbit-outer" aria-hidden="true" /><span className="wheel-orbit wheel-orbit-inner" aria-hidden="true" /><span className="wheel-sweep" aria-hidden="true" /><style jsx>{`.wheel-spins-waiting-panel{min-height:8.5rem}.wheel-orbit{position:absolute;right:1rem;top:50%;border:1px solid rgba(103,232,249,.26);border-radius:999px;transform:translateY(-50%);pointer-events:none}.wheel-orbit-outer{width:6.4rem;height:6.4rem;opacity:.28}.wheel-orbit-inner{right:2.1rem;width:4.2rem;height:4.2rem;opacity:.22}.wheel-sweep{position:absolute;right:1.7rem;top:50%;width:5rem;height:1px;background:linear-gradient(90deg,transparent,rgba(103,232,249,.82),transparent);transform-origin:center;opacity:0;pointer-events:none}.wheel-spins-waiting-panel[data-active="true"] .wheel-orbit{border-color:rgba(103,232,249,.58);box-shadow:0 0 26px rgba(103,232,249,.16),inset 0 0 14px rgba(103,232,249,.08);opacity:.58}.wheel-spins-waiting-panel[data-active="true"] .wheel-sweep{opacity:.72;animation:wheel-panel-sweep 1.45s ease-out}.wheel-spins-waiting-panel[data-pulse="true"]{animation:wheel-panel-pulse 1.45s ease-out}@keyframes wheel-panel-pulse{0%{border-color:rgba(103,232,249,.24);box-shadow:0 0 0 rgba(103,232,249,0)}36%{border-color:rgba(103,232,249,.95);box-shadow:0 0 44px rgba(103,232,249,.30)}100%{border-color:rgba(103,232,249,.55);box-shadow:0 0 34px rgba(103,232,249,.16)}}@keyframes wheel-panel-sweep{0%{opacity:0;transform:rotate(-55deg)}35%{opacity:.8}100%{opacity:0;transform:rotate(145deg)}}@media (max-width:640px){.wheel-spins-waiting-panel{min-height:0}.wheel-orbit,.wheel-sweep{opacity:.12;right:.5rem}}@media (prefers-reduced-motion: reduce){.wheel-spins-waiting-panel,.wheel-spins-waiting-panel[data-active="true"] .wheel-sweep{animation:none}.wheel-sweep{display:none}}`}</style></section>;
}

function SubmitterOutlookPanel({ snapshot, canSubmit, isFull, submitLimitReached, timingSummary, onSubmit }: { snapshot: QueuePublicSnapshot | null; canSubmit: boolean; isFull: boolean; submitLimitReached: boolean; timingSummary: QueueTimingDisplaySummary | null; onSubmit: () => void }) {
  const counts = publicQueueCounts(snapshot);
  const songsAhead = timingSummary?.submitNowFreeEstimate?.songsAhead ?? counts.remaining;
  const estimate = canSubmit ? timingSummary?.submitNowFreeEstimate ?? null : null;
  const capacity = snapshot?.status.capacity;
  const acceptedCount = snapshot?.status.acceptedCount ?? snapshot?.status.activeCount;
  const queueSpace = typeof capacity === "number" && typeof acceptedCount === "number" && capacity > 0 ? Math.max(0, capacity - acceptedCount) : null;
  const statusLabel = canSubmit ? "SUBMISSIONS OPEN" : isFull ? "QUEUE FULL" : submitLimitReached ? "SUBMISSION LIMIT REACHED" : "SUBMISSIONS CLOSED";
  const statusTone = canSubmit ? "text-accent" : "text-danger";
  const lineFit = timingSummary?.lineFitCopy ?? "Timing updates as the line changes.";
  const liveCopy = "Timing updates as tracks finish, Priority clears, wheel spins happen, and removals shift the line.";
  const activeSession = Boolean(snapshot?.session && snapshot.session.status !== "archived" && snapshot.session.broadcastPhase !== "ended");
  const projectedShowTime = activeSession ? timingSummary?.showRuntimeSummary.publicProjectedLabel ?? null : null;
  const projectedShowTimeHelper = `${timingSummary?.showRuntimeSummary.publicTargetLabel ? `Target: ${timingSummary.showRuntimeSummary.publicTargetLabel}. ` : ""}Uses detected song lengths where available.`;
  const submissionLimit = snapshot?.submitterStatus?.limit ?? 3;

  const headline = canSubmit ? "Submit Your Track Now" : isFull ? "This broadcast queue is full for new songs." : submitLimitReached ? `You’ve used all ${submissionLimit} submission slots.` : "Public intake is sealed.";
  return <section className={`submitter-outlook border bg-surface p-5 ${canSubmit ? "border-accent/55 shadow-[0_0_34px_rgba(255,0,0,0.18)]" : "border-border"}`} aria-label="Submitter Outlook"><div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto]"><div><p className={`text-xs uppercase tracking-[0.34em] ${statusTone}`}>{statusLabel}</p><h2 className="mt-2 text-2xl font-black uppercase tracking-[0.12em] text-foreground">{headline}</h2>{canSubmit ? <p className="mt-2 text-sm text-muted">Join the free queue. The line updates live as Priority, wheel pulls, removals, and host decisions happen.</p> : submitLimitReached ? <p className="mt-2 text-sm text-muted">You’ve reached the {submissionLimit}-track limit for this session.</p> : <p className="mt-2 text-sm text-muted">Current line: {songsAhead} {songsAhead === 1 ? "song" : "songs"} still waiting or coming up.</p>}<p className="mt-3 border border-border/70 bg-background/45 p-3 text-sm font-bold text-foreground">{canSubmit && estimate ? `If you submit now: ${songsAhead} ${songsAhead === 1 ? "song" : "songs"} ahead · estimated wait ${estimate.label.toLowerCase()}.` : canSubmit ? `If you submit now: ${songsAhead} ${songsAhead === 1 ? "song" : "songs"} ahead.` : `Current line: ${songsAhead} ${songsAhead === 1 ? "song" : "songs"} still waiting or coming up.`}</p>{canSubmit && timingSummary?.publicNotes.length ? <div className="mt-2 space-y-1 text-xs text-muted">{timingSummary.publicNotes.map((note) => <p key={note}>{note}</p>)}</div> : null}</div>{canSubmit && <div className="flex items-end lg:min-w-[16rem]"><button type="button" onClick={onSubmit} className="intake-cta w-full border border-accent bg-accent/10 px-5 py-4 text-sm font-black uppercase tracking-[0.22em] text-accent shadow-[0_0_28px_rgba(255,0,0,0.22)] hover:bg-accent hover:text-background">Submit Track</button></div>}</div><div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><QueueStat label="Songs Ahead" value={songsAhead} helper="Songs currently ahead of a new submission." />{estimate && <QueueStat label="Estimated Wait" value={estimate.label} helper="A rough range, not an exact play time." accent="text-accent" />}{projectedShowTime && <QueueStat label="Projected Show Time" value={projectedShowTime} helper={projectedShowTimeHelper} accent="text-accent" />}<QueueStat label={timingSummary?.lineFitStatus && timingSummary.lineFitStatus !== "unknown" ? "Line Fit" : "Live Line"} value={lineFit} helper={liveCopy} accent="text-accent" />{queueSpace !== null && <QueueStat label="Queue Space" value={`${queueSpace} ${queueSpace === 1 ? "spot" : "spots"}`} helper="Room left in tonight’s submission line." accent={queueSpace > 0 ? "text-foreground" : "text-danger"} />}</div><style jsx>{`.intake-cta{animation:intake-cta-pulse 2.1s ease-in-out infinite}@keyframes intake-cta-pulse{0%,100%{box-shadow:0 0 16px rgba(255,0,0,.12)}50%{box-shadow:0 0 38px rgba(255,0,0,.34)}}@media (prefers-reduced-motion: reduce){.intake-cta{animation:none}}`}</style></section>;
}

function QueueStat({ label, value, helper, accent = "text-foreground" }: { label: string; value: number | string; helper: string; accent?: string }) {
  return <div className="border border-border bg-background/45 p-2"><p className="text-[10px] uppercase tracking-widest text-muted">{label}</p><p className={`mt-1 text-lg font-bold ${accent}`}>{value}</p><p className="mt-1 text-[10px] leading-snug text-muted">{helper}</p></div>;
}

type PublicTrackSummary = NonNullable<QueuePublicSnapshot["submitterStatus"]>["submitted"][number];
function submittedPublicTrack(snapshot: QueuePublicSnapshot | null, submitted: PublicTrackSummary): QueuePublicTrack | PublicTrackSummary {
  const active = [snapshot?.nowPlaying, snapshot?.upNext, ...(snapshot?.queue ?? []), ...(snapshot?.completed ?? [])].filter(Boolean) as QueuePublicTrack[];
  const publicTrack = active.find((track) => track.id === submitted.id);
  if (!publicTrack) return submitted;
  return {
    ...publicTrack,
    ...(submitted.signalHoldStatus ? {
      signalHoldStatus: submitted.signalHoldStatus,
      signalHoldApplicationCount: submitted.signalHoldApplicationCount ?? 0,
    } : {}),
  };
}
function pluralizeSongs(count: number): string { return `${count} ${count === 1 ? "song" : "songs"}`; }

function SignalHoldOwnerPanel({ snapshot, paymentsAvailable, priceCents, currency, isCheckoutBlocked, canPurchase, canResume, onPurchase, onResume }: { snapshot: QueuePublicSnapshot | null; paymentsAvailable: boolean; priceCents: number; currency: string; isCheckoutBlocked: (track: PublicTrackSummary) => boolean; canPurchase: (track: PublicTrackSummary) => boolean; canResume: (track: PublicTrackSummary) => boolean; onPurchase: (track: PublicTrackSummary) => void; onResume: (track: PublicTrackSummary) => void }) {
  const activeTrackIds = new Set([snapshot?.upNext?.id, ...(snapshot?.queue ?? []).map((track) => track.id)].filter(Boolean));
  const ownerTracks = (snapshot?.submitterStatus?.submitted ?? []).filter((track) => activeTrackIds.has(track.id));
  const visibleTracks = ownerTracks.filter((track) => paymentsAvailable || (track.signalHoldStatus ?? "none") !== "none");
  if (visibleTracks.length === 0) return null;
  return (
    <section className="border border-cyan-200/35 bg-cyan-200/5 p-5" aria-label="Signal Hold for your tracks">
      <p className="text-xs uppercase tracking-[0.3em] text-cyan-200">Signal Hold · Your Tracks Only</p>
      <h2 className="mt-2 text-xl font-bold text-foreground">Paid “I might leave” protection</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">If we call you and you are not here, Signal Hold moves your track to the bottom instead of removing it. It lasts only for this show. It does not hold your place or guarantee play.</p>
      <div className="mt-4 space-y-3">
        {visibleTracks.map((track) => {
          const status = track.signalHoldStatus ?? "none";
          const applicationCount = track.signalHoldApplicationCount ?? 0;
          const checkoutBlocked = isCheckoutBlocked(track);
          const statusCopy = status === "active"
            ? `Signal Hold Active${applicationCount > 0 ? ` · used ${applicationCount} ${applicationCount === 1 ? "time" : "times"}` : ""}`
            : status === "checkout_pending"
              ? "Signal Hold Payment Processing · checkout pending is not active protection"
              : status === "paid_needs_attention"
                ? "Signal Hold Needs Attention · payment confirmed but protection is not active"
                : status === "fulfilled"
                  ? "Signal Hold Fulfilled"
                  : status === "expired"
                    ? "Signal Hold Expired"
                    : status === "failed" || status === "refunded"
                      ? "Signal Hold payment was not completed · track is not protected"
                      : checkoutBlocked
                        ? "Signal Hold unavailable · this track is one of the next two to play"
                        : "Signal Hold available";
          return <article key={track.id} className="grid gap-3 border border-border bg-background/50 p-3 sm:grid-cols-[1fr_auto] sm:items-center"><div><p className="font-bold text-foreground">{track.submittedArtistName} — {track.submittedSongTitle}</p><p className={`mt-1 text-xs ${status === "active" ? "text-cyan-200" : status === "paid_needs_attention" || status === "failed" || status === "refunded" ? "text-danger" : status === "checkout_pending" ? "text-[#ffaa00]" : "text-muted"}`}>{statusCopy}</p></div><div className="sm:text-right">{canResume(track) ? <button type="button" onClick={() => onResume(track)} className="border border-[#ffaa00]/60 bg-[#ffaa00]/10 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-[#ffaa00] hover:bg-[#ffaa00] hover:text-background">Resume Signal Hold Payment</button> : canPurchase(track) ? <button type="button" onClick={() => onPurchase(track)} className="border border-cyan-200/60 bg-cyan-200/10 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-cyan-200 hover:bg-cyan-200 hover:text-background">Add Signal Hold · {formatPrice(priceCents, currency)}</button> : null}</div></article>;
        })}
      </div>
    </section>
  );
}

function PersonalSignalStatusBar({ snapshot, mounted, timingSummary, minimized, onToggleMinimized, canSubmit, submitLabel, onSubmit }: { snapshot: QueuePublicSnapshot | null; mounted: boolean; timingSummary: QueueTimingDisplaySummary | null; minimized: boolean; onToggleMinimized: () => void; canSubmit: boolean; submitLabel: string; onSubmit: () => void }) {
  const status = snapshot?.submitterStatus ?? null;
  let main = "No songs submitted yet.";
  let detail = "Submit a track to enter the free queue.";
  if (status && status.used > 0) {
    const submittedIds = new Set(status.submitted.map((track) => track.id));
    const allSubmitted = status.submitted.map((track) => submittedPublicTrack(snapshot, track));
    const nowPlaying = snapshot?.nowPlaying && submittedIds.has(snapshot.nowPlaying.id);
    const upNext = snapshot?.upNext && submittedIds.has(snapshot.upNext.id);
    const waiting = (snapshot?.queue ?? []).filter((track) => submittedIds.has(track.id));
    const played = (snapshot?.completed ?? []).filter((track) => submittedIds.has(track.id));
    const signalHoldNeedsAttention = allSubmitted.some((track) => "signalHoldStatus" in track && track.signalHoldStatus === "paid_needs_attention");
    const signalHoldCheckoutPending = allSubmitted.some((track) => "signalHoldStatus" in track && track.signalHoldStatus === "checkout_pending");
    const signalHoldActive = allSubmitted.some((track) => "signalHoldStatus" in track && track.signalHoldStatus === "active");
    const checkoutPending = allSubmitted.some((track) => "priorityUpgradeStatus" in track && track.priorityUpgradeStatus === "checkout_pending");
    const priorityActiveTrack = allSubmitted.find((track) => isActivePublicPriority(track));
    const paymentNotCompleted = allSubmitted.some((track) => "priorityUpgradeStatus" in track && (track.priorityUpgradeStatus === "failed" || track.priorityUpgradeStatus === "refunded"));
    const closestQueueTrack = (snapshot?.queue ?? []).find((track) => submittedIds.has(track.id)) ?? null;
    const closestEstimate = closestQueueTrack ? estimateExistingTrackForDisplay(timingSummary, closestQueueTrack.id) : null;
    main = `${pluralizeSongs(status.used)} submitted${status.used === 1 && waiting.length > 0 ? " · waiting in the free queue." : ""}`;
    detail = `${waiting.length} waiting · ${played.length} already played.`;
    if (nowPlaying) { main = "Your track is playing now."; detail = "Personal receiver locked to your submitted track."; }
    else if (upNext) { main = "Your track is coming up next."; detail = "One of your submitted tracks is Next In Line."; }
    else if (signalHoldNeedsAttention) { main = "Signal Hold needs attention."; detail = "Payment was confirmed, but protection is not active. BARCODE staff will review it."; }
    else if (signalHoldCheckoutPending) { main = "Signal Hold checkout started."; detail = "Checkout pending is not active protection."; }
    else if (signalHoldActive) { main = "Signal Hold active."; detail = "If you are absent when called, the host may move the protected track to the bottom instead of removing it."; }
    else if (checkoutPending) { main = "Checkout started."; detail = "Skip is not active yet."; }
    else if (priorityActiveTrack) { const estimate = estimateExistingTrackForDisplay(timingSummary, priorityActiveTrack.id); main = "Priority Signal active."; detail = estimate ? `Priority Signal active · estimated wait ${estimate.label.toLowerCase()}.` : "Confirmed skip is active."; }
    else if (paymentNotCompleted) { main = "Payment was not completed."; detail = "Song stays in the free queue if still active."; }
    else if (waiting.length === 0 && played.length > 0) { main = status.used === 1 ? "Your track already played tonight." : `${pluralizeSongs(status.used)} submitted · ${played.length} already played.`; detail = "Played songs remain visible in Recently Played while available."; }
    else if (closestEstimate) detail = `Closest track: ${closestEstimate.songsAhead} ${closestEstimate.songsAhead === 1 ? "song" : "songs"} away · ${closestEstimate.label.toLowerCase()}.`;
  }
  const band = <section data-minimized={minimized ? "true" : undefined} className="personal-signal-bar fixed inset-x-0 z-[9050] w-screen overflow-hidden border-b border-accent/35 border-t border-border/70 bg-black/95 font-mono text-white backdrop-blur-md" aria-label="Your Signal Status" role="status" aria-live="polite"><div className="personal-signal-scan pointer-events-none absolute inset-0" aria-hidden="true" /><div className="personal-signal-line pointer-events-none absolute inset-x-0 bottom-0 h-px bg-accent/55" aria-hidden="true" /><div className="relative mx-auto flex min-h-[5rem] max-w-7xl flex-col justify-center gap-2 px-3 py-3 sm:min-h-[6rem] sm:px-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-[10px] font-bold uppercase tracking-[0.34em] text-accent sm:text-xs">Your Signal Status</p>{!minimized && <p className="mt-1 truncate text-sm font-bold text-foreground sm:text-lg">{main}</p>}</div><div className="flex flex-wrap items-center gap-2">{!minimized && canSubmit && <button type="button" onClick={onSubmit} className="border border-accent/60 bg-accent/10 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-accent hover:bg-accent hover:text-background">Submit Track</button>}{!minimized && !canSubmit && <span className="border border-border px-2.5 py-1.5 text-[10px] uppercase tracking-[0.2em] text-muted">{submitLabel}</span>}<button type="button" onClick={onToggleMinimized} className="border border-border px-2.5 py-1.5 text-[10px] uppercase tracking-[0.2em] text-muted hover:text-foreground">{minimized ? "Expand" : "Minimize"}</button></div></div>{!minimized && <p className="line-clamp-2 text-[11px] leading-snug text-muted sm:text-sm">{detail}</p>}</div><style jsx>{`.personal-signal-bar{top:calc(5.375rem + env(safe-area-inset-top));transition:min-height .2s ease,padding .2s ease}.personal-signal-bar[data-minimized="true"] :global(.relative.mx-auto){min-height:2.5rem;padding-top:.35rem;padding-bottom:.35rem;gap:.25rem}.personal-signal-scan{background:linear-gradient(transparent 50%,rgba(255,255,255,.06) 50%);background-size:100% 6px;opacity:.14}@media (max-width:640px){.personal-signal-bar p{max-width:100%}}`}</style></section>;
  return <>{mounted && createPortal(band, document.body)}</>;
}

function estimateExistingTrackForDisplay(timingSummary: QueueTimingDisplaySummary | null, trackId: string) {
  if (!timingSummary) return null;
  return displayEstimate(estimateExistingTrackTiming(timingSummary.input, trackId));
}

function QueueMechanicsInfo() { return <details className="border border-accent/30 bg-accent/5 p-4 text-xs"><summary className="cursor-pointer uppercase tracking-[0.3em] text-accent">How does the queue work?</summary><ul className="mt-3 list-disc space-y-1 pl-4 leading-relaxed text-muted"><li>Submit Track sends your song into the free queue.</li><li>Priority Signal is a paid skip after payment clears.</li><li>Signal Hold is owner-only protection for one track in one show: if the artist is absent when called, the host may move it to the bottom instead of removing it. It does not preserve a place or guarantee play.</li><li>Wheel Chosen means the host picked it from the 10K tap wheel.</li><li>Next In Line means coming up next.</li><li>Now Playing means playing now.</li></ul></details>; }

function trackStatusStyle(track: QueuePublicTrack, isLanding: boolean, isCompleted: boolean): { card: string; stamp: string | null } {
  const purchase = confirmedPriorityPurchaseDisplay(track);
  const purchaseTag = purchase ? ` · ${purchase.text}` : "";
  if (isCompleted) return { card: "completed-stamp border-border opacity-85", stamp: `ALREADY PLAYED${purchaseTag}` };
  if (track.priorityUpgradeStatus === "checkout_pending") return { card: "payment-pending border-[#ffaa00]/45", stamp: "PAYMENT PROCESSING — SKIP NOT ACTIVE" };
  if (track.priorityUpgradeStatus === "paid_needs_attention") return { card: "removed-stamp border-danger/45", stamp: "PAYMENT CONFIRMED — PRIORITY NOT ACTIVE" };
  if (track.priorityUpgradeStatus === "failed" || track.priorityUpgradeStatus === "refunded") return { card: "removed-stamp border-danger/45", stamp: "PAYMENT NOT COMPLETED" };
  if (isActivePublicPriority(track)) return { card: "priority-lock border-[#ffaa00]/55", stamp: purchase ? `PAYMENT CLEARED · ${purchase.text}` : "PRIORITY SIGNAL ACTIVE" };
  if (track.priorityUpgradeStatus === "paid" || track.priorityUpgradeStatus === "manual") return { card: "border-border", stamp: purchase ? `PRIORITY PAYMENT RECORDED · POSITION NOT ACTIVE · ${purchase.text}` : "PRIORITY POSITION NOT ACTIVE" };
  if (track.lane === "wheel") return { card: "wheel-pulse border-cyan-200/45", stamp: "WHEEL CHOSEN" };
  if (isLanding) return { card: "packet-lock border-accent", stamp: "TRANSMISSION ACCEPTED" };
  return { card: "border-border", stamp: null };
}

function PublicLane({ title, tracks, subtitle, lastSubmittedTrackId, viewerSubmittedTrackIds, collapsible = false, domId, canPriorityUpgrade, canResumePriorityPayment, priorityPriceCents, priorityCurrency, onPriorityUpgrade, onPriorityPayment, residueMap = {}, getPriorityImpact = () => null }: { title: string; tracks: QueuePublicTrack[]; subtitle?: string; lastSubmittedTrackId: string | null; viewerSubmittedTrackIds: Set<string>; collapsible?: boolean; domId?: string; canPriorityUpgrade: (track: QueuePublicTrack) => boolean; canResumePriorityPayment: (track: QueuePublicTrack) => boolean; priorityPriceCents: number; priorityCurrency: string; onPriorityUpgrade: (track: QueuePublicTrack) => void; onPriorityPayment: (track: QueuePublicTrack) => void; residueMap?: ResidueMap; getPriorityImpact?: (track: QueuePublicTrack) => PriorityTimingDisplay | null }) {
  const collapsed = collapsible && tracks.length === 0;
  const id = domId ?? (title === "Free Transmissions" ? "free-transmissions-lane" : undefined);
  const isCompletedLane = title === "Recently Played" || title === "Completed Signal Log";
  return <section id={id} className={`w-full border bg-surface transition-all ${lastSubmittedTrackId && tracks.some((track) => track.id === lastSubmittedTrackId) ? "border-accent shadow-[0_0_34px_rgba(255,0,0,0.22)]" : "border-border"} ${collapsed ? "p-3" : "p-5"}`}><div className="flex items-start justify-between gap-3"><div><h2 className="text-sm uppercase tracking-[0.25em] text-foreground">{title}</h2>{subtitle && !collapsed && <p className="mt-1 text-xs text-muted">{subtitle}</p>}</div><span className="text-xs text-muted">{tracks.length}</span></div>{collapsed ? <p className="mt-1 text-xs text-muted">No active songs here.</p> : <div className="mt-4 space-y-3">{tracks.length === 0 ? <p className="border border-border/60 p-4 text-sm text-muted">No songs here right now.</p> : tracks.map((track, index) => { const isLanding = track.id === lastSubmittedTrackId; const isMine = viewerSubmittedTrackIds.has(track.id); const style = trackStatusStyle(track, isLanding, isCompletedLane); const sourceClass = track.sourceType === "upload" ? "source-upload" : track.sourceType === "other" ? "source-other" : "source-link"; const residue = residueMap[track.id]; const priorityImpact = getPriorityImpact(track); const durationText = publicTrackDurationLabel(track); void priorityImpact; return <article key={track.id} data-track-id={track.id} data-track-card="true" data-track-zone={isCompletedLane ? "completed" : title === "Priority Signal" ? "priority" : title === "Wheel Chosen" ? "wheel" : "free"} data-track-tone={trackFlipTone(track, isCompletedLane ? "completed" : title === "Priority Signal" ? "priority" : title === "Wheel Chosen" ? "wheel" : "free")} data-track-artist={track.submittedArtistName} data-track-title={track.submittedSongTitle} data-track-label={style.stamp ?? title} id={`track-card-${track.id}`} className={`queue-track-card grid gap-3 border bg-background/40 p-3 sm:grid-cols-[5rem_1fr_auto] sm:items-center ${style.card} ${sourceClass} ${isMine ? "border-accent/70 bg-accent/5 shadow-[0_0_22px_rgba(255,0,0,0.16)]" : ""}`}>{residue && <SignalResidue tone={residue.tone} seed={`${track.id}:${residue.nonce}`} />}<div className="mini-aperture" aria-hidden="true"><span /><span /></div><div className="packet-trail" aria-hidden="true" /><div className="h-20 overflow-hidden border border-border/70"><SourceArt track={track} /></div><div><p className="text-xs text-muted">#{index + 1} · {track.sourceType.toUpperCase()}</p><p className="font-bold text-foreground">{track.submittedArtistName}</p><CollaboratorLine names={track.collaboratorNames} className="mt-1" />{track.publicSourceUrl ? <a href={track.publicSourceUrl} target="_blank" rel="noreferrer" className="text-sm text-foreground/85 underline-offset-2 hover:text-accent hover:underline">{track.submittedSongTitle}</a> : <p className="text-sm text-foreground/85">{track.submittedSongTitle}</p>}<div className="mt-2 text-xs text-muted"><TikTokLink handle={track.tiktokHandle} /></div>{style.stamp && <p className={`status-stamp mt-2 inline-flex border px-2 py-1 text-[10px] uppercase tracking-widest ${track.priorityUpgradeStatus === "checkout_pending" ? "border-[#ffaa00]/45 text-[#ffaa00]" : isActivePublicPriority(track) ? "border-[#ffaa00]/50 text-[#ffaa00]" : track.priorityUpgradeStatus === "paid_needs_attention" ? "border-danger/50 text-danger" : track.lane === "wheel" ? "border-cyan-200/45 text-cyan-200" : isCompletedLane ? "border-border text-muted" : "border-accent/35 text-accent"}`}>{style.stamp}</p>}{isMine && <p className="mt-2 inline-flex border border-accent/45 bg-accent/10 px-2 py-1 text-[10px] uppercase tracking-widest text-accent">YOUR TRACK</p>}{track.priorityUpgradeStatus === "requested" && <p className="mt-2 inline-flex border border-accent/30 px-2 py-1 text-[10px] uppercase tracking-widest text-accent">Payment Processing</p>}{(track.priorityUpgradeStatus === "failed" || track.priorityUpgradeStatus === "refunded") && <p className="mt-2 inline-flex border border-danger/40 px-2 py-1 text-[10px] uppercase tracking-widest text-danger">Payment was not completed. Stays free if still active</p>}</div><div className="space-y-2 sm:text-right"><p className="text-xs text-muted">{durationText}</p>{canResumePriorityPayment(track) && <div><button type="button" onClick={() => onPriorityPayment(track)} aria-label="Resume Priority Payment. Finish checkout to activate your skip." className="cursor-pointer border border-[#ffaa00]/55 bg-[#ffaa00]/10 px-3 py-1.5 text-[10px] uppercase tracking-widest text-[#ffaa00] transition-colors hover:bg-[#ffaa00] hover:text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ffaa00]/60">Resume Priority Payment</button><p className="mt-1 text-[10px] text-muted">Finish checkout to activate your skip.</p></div>}{canPriorityUpgrade(track) && <div><button type="button" onClick={() => onPriorityUpgrade(track)} aria-label={isMine ? "Upgrade my track with Priority Signal. Move your track closer to the front after payment clears." : "Boost this track with Priority Signal. Pay to move this artist closer to the front after payment clears."} className="cursor-pointer border border-[#ffaa00]/55 bg-[#ffaa00]/10 px-3 py-1.5 text-[10px] uppercase tracking-widest text-[#ffaa00] transition-colors hover:bg-[#ffaa00] hover:text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ffaa00]/60">{isMine ? "Upgrade My Track" : "Boost This Track"} · {formatPrice(priorityPriceCents, priorityCurrency)}</button><p className="mt-1 text-[10px] text-muted">{isMine ? "Move your track closer to the front after payment clears." : "Pay to boost this artist’s track closer to the front after payment clears."}</p></div>}</div></article>; })}</div>}<style jsx>{`.queue-track-card{position:relative;overflow:hidden;transition:border-color .35s ease,box-shadow .35s ease,filter .35s ease}.queue-track-card::before{content:"";position:absolute;left:0;top:0;bottom:0;width:2px;opacity:.75}.source-upload::before{background:linear-gradient(#fff,rgba(255,255,255,.2))}.source-link::before{background:linear-gradient(rgba(255,0,0,.8),rgba(255,0,0,.12))}.source-other::before{background:linear-gradient(rgba(255,255,255,.35),transparent)}.packet-lock{animation:packet-lock-in .95s ease-out;box-shadow:0 0 26px rgba(255,0,0,.20)}.payment-pending{animation:payment-pending-flicker 1.4s steps(2,end) infinite;box-shadow:0 0 20px rgba(255,170,0,.10)}.priority-lock{animation:priority-relay-lock 1.2s ease-out;box-shadow:0 0 24px rgba(255,170,0,.18)}.wheel-pulse{animation:wheel-signal-pulse 2.2s ease-in-out infinite;box-shadow:0 0 20px rgba(103,232,249,.12)}.completed-stamp{filter:saturate(.72)}.removed-stamp{filter:saturate(.65);box-shadow:0 0 18px rgba(255,0,0,.10)}.status-stamp{animation:status-stamp-in .42s ease-out}.mini-aperture{position:absolute;right:.75rem;top:.75rem;width:2.6rem;height:1.5rem;border:1px solid rgba(255,255,255,.16);box-shadow:0 0 10px rgba(255,255,255,.05),inset 0 0 10px rgba(255,255,255,.025);opacity:.28}.mini-aperture span{position:absolute;inset:24%;border:1px solid currentColor;color:rgba(255,255,255,.28);opacity:.55}.mini-aperture span:nth-child(2){inset:38%;animation-delay:.18s}.packet-trail{position:absolute;left:0;right:0;top:50%;height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.18),transparent);opacity:.12}.payment-pending .mini-aperture{border-color:rgba(255,170,0,.48);box-shadow:0 0 20px rgba(255,170,0,.16)}.payment-pending .mini-aperture span,.payment-pending .packet-trail{color:rgba(255,170,0,.75);background:linear-gradient(90deg,transparent,rgba(255,170,0,.55),transparent);animation:packet-trail-route 1.8s ease-in-out infinite}.payment-pending .mini-aperture span{animation:mini-aperture-ring 1.4s ease-in-out infinite}.priority-lock .mini-aperture{border-color:rgba(255,170,0,.6);box-shadow:0 0 28px rgba(255,170,0,.24)}.priority-lock .mini-aperture span,.priority-lock .packet-trail{color:rgba(255,170,0,.85);background:linear-gradient(90deg,transparent,rgba(255,170,0,.68),transparent);animation:packet-trail-route 1.8s ease-in-out infinite}.priority-lock .mini-aperture span{animation:mini-aperture-ring 1.4s ease-in-out infinite}.wheel-pulse .mini-aperture{border-color:rgba(103,232,249,.6);box-shadow:0 0 24px rgba(103,232,249,.18)}.wheel-pulse .mini-aperture span,.wheel-pulse .packet-trail{color:rgba(103,232,249,.85);background:linear-gradient(90deg,transparent,rgba(103,232,249,.62),transparent);animation:packet-trail-route 1.8s ease-in-out infinite}.wheel-pulse .mini-aperture span{animation:mini-aperture-ring 1.4s ease-in-out infinite}.completed-stamp .mini-aperture{border-color:rgba(183,183,183,.35);box-shadow:0 0 18px rgba(183,183,183,.10)}.removed-stamp .mini-aperture{border-color:rgba(255,0,0,.55);transform:scaleX(.7);opacity:.45}@keyframes packet-lock-in{0%{transform:translateY(5px);filter:brightness(1.5)}100%{transform:translateY(0);filter:brightness(1)}}@keyframes payment-pending-flicker{0%,100%{border-color:rgba(255,170,0,.28)}50%{border-color:rgba(255,170,0,.65)}}@keyframes priority-relay-lock{0%{box-shadow:0 0 0 rgba(255,170,0,0);filter:brightness(1.6)}100%{box-shadow:0 0 24px rgba(255,170,0,.18);filter:brightness(1)}}@keyframes wheel-signal-pulse{0%,100%{border-color:rgba(103,232,249,.28)}50%{border-color:rgba(103,232,249,.72)}}@keyframes status-stamp-in{0%{transform:scale(.96);opacity:0}100%{transform:scale(1);opacity:1}}@keyframes mini-aperture-ring{0%,100%{transform:scale(.9);opacity:.35}50%{transform:scale(1.12);opacity:.9}}@keyframes packet-trail-route{0%,100%{transform:scaleX(.08);opacity:.12}50%{transform:scaleX(1);opacity:.62}}@media (prefers-reduced-motion: reduce){.packet-lock,.payment-pending,.priority-lock,.wheel-pulse,.status-stamp,.mini-aperture span,.packet-trail{animation:none}}`}</style></section>;
}

function PriorityUpgradeModal({ track, price, priorityImpact, pending, message, onConfirm, onClose, isOwnTrack }: { track: QueuePublicTrack; price: string; priorityImpact: PriorityTimingDisplay | null; pending: boolean; message: string | null; onConfirm: (supporterName: string) => void; onClose: () => void; isOwnTrack: boolean }) {
  const [supporterName, setSupporterName] = useState("");
  return (
    <div className="fixed inset-0 z-[10050] grid place-items-center bg-black/80 p-4 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-labelledby="priority-upgrade-title" className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto border border-[#ffaa00]/50 bg-background p-5 shadow-[0_0_70px_rgba(255,170,0,0.22)]">
        <p className="text-xs uppercase tracking-[0.35em] text-[#ffaa00]">{PRIORITY_SIGNAL_LABEL}</p>
        <h2 id="priority-upgrade-title" className="mt-3 text-2xl font-bold text-foreground">{isOwnTrack ? "Upgrade my track" : `Send a skip for ${track.submittedArtistName}`}</h2>
        <div className="mt-4 border border-border bg-surface p-3 text-sm">
          <p className="font-bold text-foreground">{track.submittedArtistName} — {track.submittedSongTitle}</p>
          {track.tiktokHandle && <p className="mt-1 text-xs text-muted">TikTok/social: {track.tiktokHandle}</p>}
          <p className="mt-1 text-xs text-muted">Source: {sourceTypeLabel(track)}</p>
          <p className="mt-3 text-lg font-bold text-[#ffaa00]">{price}</p>
        </div>
        {!isOwnTrack && <label className="mt-4 block border-2 border-[#ffaa00]/70 bg-[#ffaa00]/10 p-4 shadow-[0_0_28px_rgba(255,170,0,0.14)]">
          <span className="block text-xs font-black uppercase tracking-[0.24em] text-[#ffaa00]">Your public name · optional</span>
          <input value={supporterName} onChange={(event) => setSupporterName(event.target.value)} maxLength={PRIORITY_GIFT_NAME_MAX_LENGTH} autoComplete="nickname" placeholder="Leave blank to show Anonymous" disabled={pending} className="mt-3 w-full border border-[#ffaa00]/55 bg-background px-3 py-3 text-base text-foreground outline-none placeholder:text-muted focus:border-[#ffaa00] disabled:opacity-50" />
          <span className="mt-2 block text-xs leading-relaxed text-muted">This exact name will appear publicly as the person sending the skip. Leave it blank and the tag will say Anonymous.</span>
          <span className="mt-2 block border border-[#ffaa00]/25 bg-background/50 p-2 text-[10px] leading-relaxed text-muted">{PRIORITY_GIFT_ATTRIBUTION_DISCLOSURE_TEXT}</span>
        </label>}
        <div className="mt-4 border border-border bg-surface p-3 text-xs text-muted">
          <p>{isOwnTrack ? "Move your track closer to the front after payment clears." : `Pay to move ${track.submittedArtistName} closer to the front after payment clears.`}</p>
          <p>Priority Signal is a paid skip after payment clears.</p>
          <p>Supports the BARCODE Radio broadcast.</p>
          {priorityImpact && <div className="mt-3 grid grid-cols-2 gap-2 border border-[#ffaa00]/25 bg-[#ffaa00]/5 p-2"><div><p className="text-[10px] uppercase tracking-widest text-muted">Current wait</p><p className="font-bold text-foreground">{priorityImpact.freeLabel}</p></div><div><p className="text-[10px] uppercase tracking-widest text-muted">With Priority</p><p className="font-bold text-[#ffaa00]">{priorityImpact.priorityLabel}</p></div><p className="col-span-2 mt-1 text-[10px] text-muted">{priorityImpact.helperCopy}</p></div>}
          <p className="mt-2">Payment may take a moment to clear. Queue position may shift during checkout.</p>
          <p className="mt-3 border border-[#ffaa00]/30 bg-[#ffaa00]/5 p-2 leading-relaxed text-muted">{PRIORITY_DISCLOSURE_TEXT}</p>
        </div>
        {message && <p className="mt-3 border border-accent/30 bg-accent/5 p-2 text-xs text-accent">{message}</p>}
        <div className="mt-5 flex flex-wrap justify-end gap-2"><button type="button" onClick={onClose} disabled={pending} className="border border-border px-4 py-2 text-xs uppercase tracking-widest text-muted disabled:opacity-50">Cancel</button><button type="button" onClick={() => onConfirm(supporterName)} disabled={pending} className="border border-[#ffaa00]/60 px-4 py-2 text-xs uppercase tracking-widest text-[#ffaa00] hover:bg-[#ffaa00] hover:text-background disabled:opacity-50">{pending ? "Opening checkout…" : "Continue to Payment"}</button></div>
      </div>
    </div>
  );
}

function SignalHoldModal({ track, price, pending, message, onConfirm, onClose }: { track: PublicTrackSummary; price: string; pending: boolean; message: string | null; onConfirm: () => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[10050] grid place-items-center bg-black/80 p-4 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-labelledby="signal-hold-title" className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto border border-cyan-200/50 bg-background p-5 shadow-[0_0_70px_rgba(103,232,249,0.18)]">
        <p className="text-xs uppercase tracking-[0.35em] text-cyan-200">Signal Hold · One Show Only</p>
        <h2 id="signal-hold-title" className="mt-3 text-2xl font-bold text-foreground">Protect my track if I might leave</h2>
        <div className="mt-4 border border-border bg-surface p-3 text-sm">
          <p className="font-bold text-foreground">{track.submittedArtistName} — {track.submittedSongTitle}</p>
          <p className="mt-3 text-lg font-bold text-cyan-200">{price}</p>
        </div>
        <div className="mt-4 space-y-2 border border-border bg-surface p-3 text-xs leading-relaxed text-muted">
          <p>If we call you and you are not here, Signal Hold lets the host move this track to the bottom instead of removing it.</p>
          <p>It protects this track only for this show. It does not hold your place, preserve Next In Line, Wheel, or Priority position, or guarantee play.</p>
          <p>Checkout pending is not active protection. Protection starts only after signed payment confirmation.</p>
          <p className="mt-3 border border-cyan-200/25 bg-cyan-200/5 p-2">{SIGNAL_HOLD_DISCLOSURE_TEXT}</p>
        </div>
        {message && <p className="mt-3 border border-accent/30 bg-accent/5 p-2 text-xs text-accent">{message}</p>}
        <div className="mt-5 flex flex-wrap justify-end gap-2"><button type="button" onClick={onClose} disabled={pending} className="border border-border px-4 py-2 text-xs uppercase tracking-widest text-muted disabled:opacity-50">Cancel</button><button type="button" onClick={onConfirm} disabled={pending} className="border border-cyan-200/60 px-4 py-2 text-xs uppercase tracking-widest text-cyan-200 hover:bg-cyan-200 hover:text-background disabled:opacity-50">{pending ? "Opening checkout…" : "Continue to Payment"}</button></div>
      </div>
    </div>
  );
}

function DiscordQueueCTA() { return <section className="border border-accent/40 bg-accent/5 p-5"><p className="text-xs uppercase tracking-[0.3em] text-accent">Discord Signal Alerts</p><p className="mt-2 text-sm text-muted">Join Discord for BARCODE Radio queue updates and future signal alerts.</p><a href={externalLinks.discord} target="_blank" rel="noreferrer" className="mt-4 inline-flex border border-accent px-4 py-2 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background">Join Discord</a></section>; }
