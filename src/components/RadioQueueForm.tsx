/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps, @next/next/no-img-element */
"use client";

import { ArtistCreditFields } from "@/components/ArtistCreditFields";
import { upload } from "@vercel/blob/client";
import { safeFileName, audioMimeTypeForFile, readAudioDuration } from "@/lib/queue-upload-client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { buildQueueTimingDisplay, priorityDisplayFromImpact, queueTimingInputFromPublicSnapshot } from "@/lib/queue-timing-display";
import { startQueueSubmissionCheckout } from "@/lib/queue-submission-checkout";
import { completeFreeQueueSubmission, confirmQueueSubmission, publicQueueDeckHref } from "@/lib/queue-submission-flow";
import type { QueueIntakePhase, QueueSubmissionReceipt } from "@/lib/queue-submission-flow";
import { cooldownDeadlineFromRemaining, cooldownRemainingFromDeadline } from "@/lib/queue-cooldown";
import { assertQueueTrackDuration, QUEUE_TRACK_DURATION_LIMIT_MESSAGE, QUEUE_TRACK_DURATION_UNVERIFIED_MESSAGE, MAX_QUEUE_TRACK_DURATION_SECONDS, APPLE_MUSIC_QUEUE_UNSUPPORTED_MESSAGE, PUBLIC_QUEUE_LEGAL_CHECKBOX_TEXT, PUBLIC_QUEUE_LEGAL_PRIVACY_VERSION, PUBLIC_QUEUE_LEGAL_QUEUE_TERMS_VERSION, PUBLIC_QUEUE_LEGAL_TERMS_VERSION, formatRuntime, isAppleMusicUrl, PRIORITY_DISCLOSURE_TEXT, SIGNAL_HOLD_DISCLOSURE_TEXT, SIGNAL_HOLD_CHECKOUT_POSITION_CUTOFF } from "@/lib/queue-types";
import type { QueuePublicSnapshot, QueuePublicStatus, QueuePublicTrack } from "@/lib/queue-types";
import { PUBLIC_QUEUE_POLL_INTERVAL_MS } from "@/lib/redis-polling-budget";
import { hasActiveQueueSession, startSessionBoundPolling } from "@/lib/session-bound-polling";

type Mode = "link" | "upload";
type ReadState = "idle" | "checking" | "reading" | "detected" | "pending" | "uploading";
type TransmissionState = "idle" | "priority_requested" | "signal_hold_requested" | QueueIntakePhase;
type SubmitPhase = "resolved" | "complete";
type IntakeStep = "track" | "routing";
type RouteChoice = "free" | "priority" | "signal_hold";

const UPLOAD_FALLBACK_MESSAGE = "Upload could not be completed. Please try again or submit a Spotify, SoundCloud, YouTube, or direct track link.";
const PRIORITY_SIGNAL_LABEL = "Priority Signal";
const PRIORITY_DEPTH_UNAVAILABLE_MESSAGE = "Priority Signal opens when there are enough songs waiting.";
const SESSION_SYNC_REQUIRED_MESSAGE = "Session sync required. Refresh the queue and try again.";
const SESSION_CHANGED_MESSAGE = "This session has changed. Re-enter the current BARCODE Radio queue and submit again.";
const QUEUE_CONFIRMATION_FAILED_MESSAGE = "Submission could not be confirmed in the queue. Your info was kept. Please try again or contact the host.";
const MIN_PRIORITY_ACTIVE_DEPTH = 2;
function formatPrice(cents: number, currency = "usd"): string { return `${new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(Math.max(0, cents) / 100)} ${currency.toUpperCase()}`; }

interface WarpData {
  artist: string;
  title: string;
  tiktokHandle: string;
  sourceType: string;
  durationLabel: string;
  sessionTitle: string;
  sessionDate: string;
  lane: string;
  artworkUrl?: string | null;
}

function pressureLabel(status: QueuePublicStatus | null, timingSummary: ReturnType<typeof buildQueueTimingDisplay> | null): string {
  if (!status) return "Syncing";
  const label = timingSummary?.pressureSummary.isLive ? timingSummary.pressureSummary.label : "PRE-SHOW";
  return `${label} / ${status.activeCount} ACTIVE`;
}

function publicTrackFromApi(track: { id: string; submittedArtistName?: string; submittedSongTitle?: string; submittedAlbumName?: string | null; collaboratorNames?: string | null; artist?: string; title?: string; sourceType?: QueuePublicTrack["sourceType"]; lane?: QueuePublicTrack["lane"]; detectedArtistName?: string | null; detectedSongTitle?: string | null; detectedAlbumName?: string | null; detectedDurationSeconds?: number | null; estimatedDurationSeconds?: number; durationLabel?: string; durationIsEstimate?: boolean; durationSource?: QueuePublicTrack["durationSource"]; sourceArtworkUrl?: string | null; publicSourceUrl?: string | null; tiktokHandle?: string | null; priorityUpgradeRequested?: boolean; priorityUpgradeStatus?: QueuePublicTrack["priorityUpgradeStatus"] }): QueuePublicTrack {
  return {
    id: track.id,
    submittedArtistName: track.submittedArtistName ?? track.artist ?? "Submitted artist",
    submittedSongTitle: track.submittedSongTitle ?? track.title ?? "Submitted track",
    submittedAlbumName: track.submittedAlbumName ?? null,
    collaboratorNames: track.collaboratorNames ?? null,
    detectedArtistName: track.detectedArtistName ?? null,
    detectedSongTitle: track.detectedSongTitle ?? null,
    detectedAlbumName: track.detectedAlbumName ?? null,
    sourceType: track.sourceType ?? "other",
    lane: track.lane ?? "regular",
    durationLabel: track.durationLabel ?? (track.durationIsEstimate === false && track.detectedDurationSeconds ? formatRuntime(track.detectedDurationSeconds) : "est. 5:00"),
    sourceArtworkUrl: track.sourceArtworkUrl ?? null,
    publicSourceUrl: track.publicSourceUrl ?? null,
    tiktokHandle: track.tiktokHandle ?? null,
    detectedDurationSeconds: track.detectedDurationSeconds ?? null,
    estimatedDurationSeconds: track.estimatedDurationSeconds,
    durationIsEstimate: track.durationIsEstimate ?? true,
    durationSource: track.durationSource,
    priorityUpgradeRequested: track.priorityUpgradeRequested === true,
    priorityUpgradeStatus: track.priorityUpgradeStatus ?? "none",
  };
}

export function RadioQueueForm({ sessionId, snapshotEndpoint = "/api/queue", onSubmitted, onCancel, onAcceptedReceipt }: { sessionId?: string; snapshotEndpoint?: string; onSubmitted?: (trackId?: string, phase?: SubmitPhase, targetId?: string) => void; onCancel?: () => void; onAcceptedReceipt?: (receipt: QueueSubmissionReceipt) => void } = {}) {
  const [status, setStatus] = useState<QueuePublicStatus | null>(null);
  const [publicQueue, setPublicQueue] = useState<QueuePublicTrack[]>([]);
  const [nowPlaying, setNowPlaying] = useState<QueuePublicTrack | null>(null);
  const [upNext, setUpNext] = useState<QueuePublicTrack | null>(null);
  const [session, setSession] = useState<QueuePublicSnapshot["session"] | null>(null);
  const [submitterStatus, setSubmitterStatus] = useState<QueuePublicSnapshot["submitterStatus"] | null>(null);
  const [playbackTiming, setPlaybackTiming] = useState<QueuePublicSnapshot["playbackTiming"]>(null);
  const [wheelTiming, setWheelTiming] = useState<QueuePublicSnapshot["wheelTiming"]>(null);
  const [mode, setMode] = useState<Mode>("link");
  const [step, setStep] = useState<IntakeStep>("track");
  const [routingLockRemaining, setRoutingLockRemaining] = useState(0);
  const finalSubmitIntent = useRef(false);
  const submissionInFlight = useRef(false);
  const intakeMountedRef = useRef(true);
  const [artist, setArtist] = useState("");
  const [creditDecision, setCreditDecision] = useState<"whole" | "split" | "">("");
  const [originalArtist, setOriginalArtist] = useState("");
  const [title, setTitle] = useState("");
  const [link, setLink] = useState("");
  const [tiktokHandle, setTikTokHandle] = useState("");
  const [collaboratorNames, setCollaboratorNames] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [submitterToken, setSubmitterToken] = useState("");
  const [note, setNote] = useState("");
  const [routeChoice, setRouteChoice] = useState<RouteChoice>("free");
  const [file, setFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [detectedDuration, setDetectedDuration] = useState<number | null>(null);
  const [readState, setReadState] = useState<ReadState>("idle");
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [acceptedLegal, setAcceptedLegal] = useState(false);
  const [legalError, setLegalError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [transmissionState, setTransmissionState] = useState<TransmissionState>("idle");
  const [warpData, setWarpData] = useState<WarpData | null>(null);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [clockNow, setClockNow] = useState(() => Date.now());
  const cooldownDeadlineRef = useRef(0);

  useEffect(() => {
    intakeMountedRef.current = true;
    return () => { intakeMountedRef.current = false; };
  }, []);

  function cooldownStorageKey(): string | null {
    return submitterToken ? `barcode-radio-cooldown:${sessionId ?? "active"}:${submitterToken}` : null;
  }

  function setAuthoritativeCooldown(remainingSeconds: number): void {
    const deadline = cooldownDeadlineFromRemaining(remainingSeconds);
    cooldownDeadlineRef.current = deadline;
    setCooldownRemaining(cooldownRemainingFromDeadline(deadline));
    const key = cooldownStorageKey();
    if (!key) return;
    if (remainingSeconds > 0) window.localStorage.setItem(key, String(deadline));
    else window.localStorage.removeItem(key);
  }

  function refreshCooldownFromDeadline(): void {
    setCooldownRemaining(cooldownRemainingFromDeadline(cooldownDeadlineRef.current));
  }

  async function loadStatus() {
    const params = new URLSearchParams();
    if (sessionId) params.set("sessionId", sessionId);
    if (submitterToken) params.set("submitterToken", submitterToken);
    if (tiktokHandle.trim()) params.set("tiktokHandle", tiktokHandle.trim());
    if (contactEmail.trim()) params.set("contactEmail", contactEmail.trim());
    if (artist.trim()) params.set("artist", artist.trim());
    const endpoint = new URL(snapshotEndpoint, window.location.origin);
    params.forEach((value, key) => endpoint.searchParams.set(key, value));
    const res = await fetch(`${endpoint.pathname}${endpoint.search}`, { cache: "no-store" });
    if (res.ok) {
      const payload = await res.json();
      setStatus(payload.status ?? null);
      setSession(payload.session ?? null);
      setSubmitterStatus(payload.submitterStatus ?? null);
      setPublicQueue(Array.isArray(payload.queue) ? payload.queue : []);
      setNowPlaying(payload.nowPlaying ?? null);
      setUpNext(payload.upNext ?? null);
      setPlaybackTiming(payload.playbackTiming ?? null);
      setWheelTiming(payload.wheelTiming ?? null);
      setAuthoritativeCooldown(payload.submitterStatus?.cooldownRemainingSeconds ?? 0);
      return payload as QueuePublicSnapshot;
    }
    return null;
  }

  useEffect(() => {
    return startSessionBoundPolling({
      intervalMs: PUBLIC_QUEUE_POLL_INTERVAL_MS,
      poll: async () => {
        const next = await loadStatus();
        return next ? hasActiveQueueSession(next) : null;
      },
    });
  }, [submitterToken]);

  useEffect(() => {
    if (!submitterToken) return;
    const timer = window.setTimeout(loadStatus, 350);
    return () => window.clearTimeout(timer);
  }, [artist, contactEmail, submitterToken, tiktokHandle]);

  useEffect(() => {
    const key = "barcode-radio-submitter-token";
    const existing = window.localStorage.getItem(key);
    if (existing) {
      setSubmitterToken(existing);
    } else {
      const next = `br_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
      window.localStorage.setItem(key, next);
      setSubmitterToken(next);
    }
    setArtist(window.localStorage.getItem("barcode-radio-submit-artist") ?? "");
    setTikTokHandle(window.localStorage.getItem("barcode-radio-submit-tiktok") ?? "");
    setContactEmail(window.localStorage.getItem("barcode-radio-submit-email") ?? "");
  }, []);


  useEffect(() => {
    const timer = window.setInterval(() => {
      setClockNow(Date.now());
      refreshCooldownFromDeadline();
    }, 1000);
    const recover = () => {
      refreshCooldownFromDeadline();
      void loadStatus();
    };
    const visibility = () => { if (document.visibilityState === "visible") recover(); };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("focus", recover);
    window.addEventListener("pageshow", recover);
    window.addEventListener("online", recover);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("focus", recover);
      window.removeEventListener("pageshow", recover);
      window.removeEventListener("online", recover);
    };
  }, [sessionId, submitterToken]);

  useEffect(() => {
    if (!submitterToken) return;
    const key = `barcode-radio-cooldown:${sessionId ?? "active"}:${submitterToken}`;
    const until = Number(window.localStorage.getItem(key) ?? 0);
    cooldownDeadlineRef.current = Number.isFinite(until) ? until : 0;
    refreshCooldownFromDeadline();
  }, [sessionId, submitterToken]);


  useEffect(() => {
    if (step !== "routing") {
      setRoutingLockRemaining(0);
      return;
    }
    setRoutingLockRemaining(2);
    const first = window.setTimeout(() => setRoutingLockRemaining(1), 1000);
    const second = window.setTimeout(() => setRoutingLockRemaining(0), 2000);
    return () => {
      window.clearTimeout(first);
      window.clearTimeout(second);
    };
  }, [step]);

  useEffect(() => {
    let cancelled = false;
    if (mode !== "link" || !link.trim()) {
      if (mode === "link") {
        setReadState("idle");
        setUploadProgress(null);
        setDetectedDuration(null);
      }
      return;
    }
    setReadState("checking");
    setDetectedDuration(null);
    const timer = window.setTimeout(() => {
      if (!cancelled) setReadState("pending");
    }, 650);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [link, mode]);


  function findSubmittedTrack(snapshot: QueuePublicSnapshot | null, trackId: string): { track: QueuePublicTrack | null; targetId: string; laneLabel: string } {
    if (!snapshot) return { track: null, targetId: "active-queue-panel", laneLabel: "ACTIVE_QUEUE" };
    if (snapshot.nowPlaying?.id === trackId) return { track: snapshot.nowPlaying, targetId: "now-playing-slot", laneLabel: "NOW_PLAYING" };
    if (snapshot.upNext?.id === trackId) return { track: snapshot.upNext, targetId: "up-next-slot", laneLabel: "UP_NEXT" };
    const completed = snapshot.completed.find((entry) => entry.id === trackId);
    if (completed) return { track: completed, targetId: "active-queue-panel", laneLabel: "RECORDED" };
    const queued = snapshot.queue.find((entry) => entry.id === trackId) ?? null;
    if (queued?.lane === "priority") return { track: queued, targetId: "priority-lane", laneLabel: "PRIORITY_SIGNAL" };
    if (queued?.lane === "wheel") return { track: queued, targetId: "wheel-lane", laneLabel: "WHEEL_CHOSEN" };
    if (queued?.lane === "regular") return { track: queued, targetId: "free-transmissions-lane", laneLabel: "FREE_QUEUE" };
    return { track: queued, targetId: "active-queue-panel", laneLabel: "ACTIVE_QUEUE" };
  }

  function wait(ms: number) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  const fileSelectionGeneration = useRef(0);
  async function onFileSelected(next: File | null) {
    const generation = ++fileSelectionGeneration.current;
    setFile(next);
    setDetectedDuration(null);
    setUploadProgress(null);
    setReadState(next ? "reading" : "idle");
    if (!next) return;
    const duration = await readAudioDuration(next);
    if (generation !== fileSelectionGeneration.current) return;
    setError(duration !== null && duration > MAX_QUEUE_TRACK_DURATION_SECONDS ? QUEUE_TRACK_DURATION_LIMIT_MESSAGE : null);
    setDetectedDuration(duration);
    setReadState(duration ? "detected" : "pending");
  }

  async function uploadAudioPacket(selectedFile: File): Promise<{ url: string }> {
    setReadState("uploading");
    setUploadProgress(0);
    try {
      const pathname = `barcode-radio-queue/${Date.now()}-${safeFileName(selectedFile.name)}`;
      const mimeType = audioMimeTypeForFile(selectedFile);
      const blob = await upload(pathname, selectedFile, {
        access: "private",
        contentType: mimeType,
        multipart: true,
        handleUploadUrl: "/api/queue/upload",
        clientPayload: JSON.stringify({
          sessionId: sessionId ?? session?.sessionId,
          uploadOriginalName: selectedFile.name,
          fileSize: selectedFile.size,
          mimeType,
        }),
        onUploadProgress: ({ percentage }) => setUploadProgress(Math.round(percentage)),
      });
      setUploadProgress(100);
      return { url: blob.url };
    } catch (uploadError) {
      console.warn("[queue] client audio upload failed", uploadError);
      setUploadProgress(null);
      setReadState(detectedDuration ? "detected" : "pending");
      throw new Error(UPLOAD_FALLBACK_MESSAGE);
    }
  }

  const checkCopy = useMemo(() => {
    if (readState === "checking") return "Checking track…";
    if (readState === "reading") return "Reading source…";
    if (readState === "detected" && detectedDuration) return `Duration detected: ${formatRuntime(detectedDuration)}`;
    if (readState === "uploading") return uploadProgress === null ? "Uploading audio…" : `Uploading audio… ${uploadProgress}%`;
    if (readState === "pending") return "Duration pending — you can still submit.";
    return "Paste a supported link or select an MP3/WAV to begin source checks.";
  }, [detectedDuration, readState, uploadProgress]);

  const priorityPriceCents = session?.priorityUpgradePriceCents ?? 0;
  const priorityCurrency = session?.priorityUpgradeCurrency ?? "usd";
  const priorityPaymentsAvailable = session?.priorityUpgradesEnabled === true && session?.priorityUpgradePaymentsEnabled === true && priorityPriceCents > 0;
  const priorityDepthAvailable = (status?.activeCount ?? 0) >= MIN_PRIORITY_ACTIVE_DEPTH;
  const priorityCheckoutAvailable = priorityPaymentsAvailable && status?.isOpen === true && priorityDepthAvailable;
  const signalHoldPriceCents = session?.signalHoldPriceCents ?? 0;
  const signalHoldCurrency = session?.signalHoldCurrency ?? "usd";
  const signalHoldPaymentsAvailable = session?.signalHoldEnabled === true && session?.signalHoldPaymentsEnabled === true && signalHoldPriceCents > 0;
  // A new submission goes behind the upcoming line. Now Playing does not count.
  const signalHoldDepthAvailable = publicQueue.length + (upNext ? 1 : 0) >= SIGNAL_HOLD_CHECKOUT_POSITION_CUTOFF;
  const signalHoldCheckoutAvailable = signalHoldPaymentsAvailable && status?.isOpen === true && signalHoldDepthAvailable;
  const timingSnapshot = useMemo<QueuePublicSnapshot | null>(() => session && status ? { revision: 0, session, status, queue: publicQueue, completed: [], nowPlaying, upNext, submitterStatus, playbackTiming, wheelTiming } : null, [session, status, publicQueue, nowPlaying, upNext, submitterStatus, playbackTiming, wheelTiming]);
  const timingSummary = useMemo(() => buildQueueTimingDisplay(queueTimingInputFromPublicSnapshot(timingSnapshot), { priorityEligible: priorityCheckoutAvailable, now: new Date(clockNow) }), [timingSnapshot, priorityCheckoutAvailable, clockNow]);
  const submitPriorityImpact = priorityCheckoutAvailable ? priorityDisplayFromImpact(timingSummary.priorityImpactEstimate) : null;
  const selectedRoute: RouteChoice = routeChoice === "priority" && priorityCheckoutAvailable ? "priority" : routeChoice === "signal_hold" && signalHoldCheckoutAvailable ? "signal_hold" : "free";

  function clearTrackDraftFields() {
    setTitle("");
    setLink("");
    setCollaboratorNames("");
    setCreditDecision("");
    setOriginalArtist("");
    setNote("");
    setFile(null);
    setFileInputKey((value) => value + 1);
    setDetectedDuration(null);
    setReadState("idle");
    setUploadProgress(null);
    setRouteChoice("free");
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step !== "routing") {
      continueToRouting();
      return;
    }
    if (submissionInFlight.current || !finalSubmitIntent.current || routingLockRemaining > 0) {
      finalSubmitIntent.current = false;
      return;
    }
    finalSubmitIntent.current = false;
    setError(null);
    setLegalError(null);
    if (!acceptedLegal) {
      setLegalError("You must agree to the BARCODE Network Terms, Queue Submission Terms, and Privacy Policy before submitting.");
      return;
    }
    submissionInFlight.current = true;
    setSubmitting(true);
    try {
      const refreshedBeforeSubmit = await loadStatus();
      const latestSessionId = refreshedBeforeSubmit?.session?.sessionId ?? session?.sessionId ?? sessionId;
      if (!latestSessionId) throw new Error(SESSION_SYNC_REQUIRED_MESSAGE);
      const visibleSessionId = session?.sessionId ?? sessionId;
      if (visibleSessionId && latestSessionId !== visibleSessionId) throw new Error(SESSION_CHANGED_MESSAGE);
      if ((refreshedBeforeSubmit?.submitterStatus?.remaining ?? 1) <= 0) throw new Error("Submission limit reached for this session.");
      const body: Record<string, string | number | boolean> = {
        mode,
        artist: artist.trim(),
        title: title.trim(),
        tiktokHandle: tiktokHandle.trim(),
        collaboratorNames: collaboratorNames.trim(),
        artistCreditDecision: creditDecision,
        originalArtistName: originalArtist || artist.trim(),
        contactEmail: contactEmail.trim(),
        submitterToken,
        acceptedLegal: true,
        termsVersion: PUBLIC_QUEUE_LEGAL_TERMS_VERSION,
        privacyVersion: PUBLIC_QUEUE_LEGAL_PRIVACY_VERSION,
        queueTermsVersion: PUBLIC_QUEUE_LEGAL_QUEUE_TERMS_VERSION,
        acceptedCheckboxText: PUBLIC_QUEUE_LEGAL_CHECKBOX_TEXT,
      };
      body.sessionId = latestSessionId;
      if (note.trim()) body.note = note.trim();
      if (detectedDuration) body.detectedDurationSeconds = detectedDuration;
      if (mode === "upload") {
        if (!file) throw new Error("Select an MP3/WAV file before final routing.");
        // Recheck the selected file at the upload boundary, including after slow metadata reads.
        const measuredDuration = await readAudioDuration(file);
        assertQueueTrackDuration(measuredDuration);
        if (measuredDuration !== null) body.detectedDurationSeconds = measuredDuration;
        else delete body.detectedDurationSeconds;
        const blob = await uploadAudioPacket(file);
        body.uploadedBlobUrl = blob.url;
        body.uploadOriginalName = file.name;
        body.fileSize = file.size;
        body.mimeType = audioMimeTypeForFile(file);
      }
      if (mode === "link") body.link = link.trim();

      const res = await fetch("/api/queue", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (payload.code === "duplicate_transmission") {
          throw new Error(payload.error || "Duplicate song detected. This track is already in the queue for this session.");
        }
        if (typeof payload.cooldownRemainingSeconds === "number") {
          setAuthoritativeCooldown(payload.cooldownRemainingSeconds);
        }
        throw new Error(payload.cooldownRemainingSeconds ? `Next submission available in ${formatCooldown(payload.cooldownRemainingSeconds)}` : payload.error || "Submission failed");
      }
      if (payload.track?.id) {
        const submitted = publicTrackFromApi(payload.track);
        const confirmation = await confirmQueueSubmission({ trackId: submitted.id, sessionId: latestSessionId, checkoutPending: selectedRoute !== "free", readSnapshot: loadStatus, wait });
        if (!confirmation) {
          await loadStatus();
          throw new Error(`${QUEUE_CONFIRMATION_FAILED_MESSAGE} Reference: ${submitted.id.slice(0, 8).toUpperCase()}`);
        }
        const { snapshot: confirmedSnapshot, receipt } = confirmation;
        const savedTrack = [confirmedSnapshot.nowPlaying, confirmedSnapshot.upNext, ...confirmedSnapshot.queue, ...confirmedSnapshot.completed].find((entry) => entry?.id === submitted.id) ?? submitted;
        onAcceptedReceipt?.(receipt);
        window.localStorage.setItem("barcode-radio-submit-artist", artist.trim());
        window.localStorage.setItem("barcode-radio-submit-tiktok", tiktokHandle.trim());
        window.localStorage.setItem("barcode-radio-submit-email", contactEmail.trim());
        const nextCooldown = typeof payload.cooldownRemainingSeconds === "number" ? payload.cooldownRemainingSeconds : 0;
        setAuthoritativeCooldown(nextCooldown);
        if (selectedRoute !== "free") {
          setWarpData({
            artist: receipt.artist,
            title: receipt.title,
            tiktokHandle: savedTrack.tiktokHandle ?? "",
            sourceType: savedTrack.sourceType.toUpperCase(),
            durationLabel: savedTrack.durationLabel,
            sessionTitle: receipt.sessionTitle,
            sessionDate: receipt.sessionDate,
            lane: selectedRoute === "signal_hold" ? "FREE QUEUE / SIGNAL HOLD NOT ACTIVE" : "FREE QUEUE / PAYMENT REQUIRED",
            artworkUrl: savedTrack.sourceArtworkUrl ?? null,
          });
          setTransmissionState(selectedRoute === "signal_hold" ? "signal_hold_requested" : "priority_requested");
          const checkout = await startQueueSubmissionCheckout({ choice: selectedRoute, trackId: submitted.id, sessionId: latestSessionId, submitterToken });
          if (checkout.url) { window.location.href = checkout.url; return; }
          setTransmissionState("idle");
          setError(checkout.message);
          setPublicQueue((current) => [submitted, ...current.filter((entry) => entry.id !== submitted.id)]);
          await loadStatus().catch(() => null);
          onSubmitted?.(submitted.id, "resolved", "free-transmissions-lane");
          setArtist(window.localStorage.getItem("barcode-radio-submit-artist") ?? artist.trim());
          setTikTokHandle(window.localStorage.getItem("barcode-radio-submit-tiktok") ?? tiktokHandle.trim());
          setContactEmail(window.localStorage.getItem("barcode-radio-submit-email") ?? contactEmail.trim());
          clearTrackDraftFields();
          setStep("track");
          return;
        }
        if (!intakeMountedRef.current) return;
        const preSubmit = { nowPlayingWasEmpty: !nowPlaying, upNextWasEmpty: !upNext, activeCount: status?.activeCount ?? publicQueue.length };
        const baseWarpData: WarpData = {
          artist: receipt.artist,
          title: receipt.title,
          tiktokHandle: savedTrack.tiktokHandle ?? "",
          sourceType: savedTrack.sourceType.toUpperCase(),
          durationLabel: savedTrack.durationLabel,
          sessionTitle: receipt.sessionTitle,
          sessionDate: receipt.sessionDate,
          lane: savedTrack.lane === "priority" ? "PRIORITY_SIGNAL" : savedTrack.lane === "wheel" ? "WHEEL_CHOSEN" : "FREE_QUEUE",
          artworkUrl: savedTrack.sourceArtworkUrl ?? null,
        };
        setWarpData(baseWarpData);
        setPublicQueue((current) => [submitted, ...current.filter((entry) => entry.id !== submitted.id)]);
        let resolved = findSubmittedTrack(confirmedSnapshot, submitted.id);
        if (resolved.targetId === "up-next-slot" && preSubmit.upNextWasEmpty) {
          resolved = { ...resolved, targetId: preSubmit.nowPlayingWasEmpty && preSubmit.activeCount === 0 ? "broadcast-queue-top" : "up-next-slot", laneLabel: "UP_NEXT" };
        }
        const resolvedTrack = resolved.track ?? submitted;
        setWarpData({
          ...baseWarpData,
          durationLabel: resolvedTrack.durationLabel,
          lane: resolved.laneLabel,
          artworkUrl: resolvedTrack.sourceArtworkUrl ?? baseWarpData.artworkUrl,
        });
        onSubmitted?.(submitted.id, "resolved", resolved.targetId);
        const completed = await completeFreeQueueSubmission(receipt, {
          reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
          wait,
          onPhase: setTransmissionState,
          isActive: () => intakeMountedRef.current,
          onComplete: () => onSubmitted?.(submitted.id, "complete", resolved.targetId),
          navigate: (href) => window.location.assign(href),
        });
        if (!completed || !intakeMountedRef.current) return;
        setTransmissionState("idle");
      }
      setArtist(window.localStorage.getItem("barcode-radio-submit-artist") ?? artist.trim());
      setTikTokHandle(window.localStorage.getItem("barcode-radio-submit-tiktok") ?? tiktokHandle.trim());
      setContactEmail(window.localStorage.getItem("barcode-radio-submit-email") ?? contactEmail.trim());
      clearTrackDraftFields();
      setStep("track");
    } catch (err) {
      if (intakeMountedRef.current) {
        setTransmissionState("idle");
        setStep("track");
        setError(err instanceof Error ? err.message : "Submission failed");
      }
    } finally {
      finalSubmitIntent.current = false;
      submissionInFlight.current = false;
      if (intakeMountedRef.current) setSubmitting(false);
    }
  }


  function continueToRouting() {
    if (!artist.trim() || !title.trim() || !tiktokHandle.trim()) {
      setError("Artist, title, and TikTok handle are required before final routing.");
      return;
    }
    if (mode === "link" && !link.trim()) {
      setError("Add a track link before final routing.");
      return;
    }
    if (mode === "link" && isAppleMusicUrl(link)) {
      setError(APPLE_MUSIC_QUEUE_UNSUPPORTED_MESSAGE);
      return;
    }
    if (mode === "upload" && !file) {
      setError("Select an MP3/WAV file before final routing.");
      return;
    }
    if (mode === "upload" && readState === "reading") {
      setError("Wait for the file duration check to finish.");
      return;
    }
    if (mode === "upload" && detectedDuration !== null && detectedDuration > MAX_QUEUE_TRACK_DURATION_SECONDS) {
      setError(QUEUE_TRACK_DURATION_LIMIT_MESSAGE);
      return;
    }
    setError(null);
    setStep("routing");
  }

  if (transmissionState !== "idle") return createPortal(<QueueIntakeSequence state={transmissionState} data={warpData} />, document.body);

  const effectiveCooldown = session?.submissionCooldownSeconds === 0 ? 0 : cooldownRemaining;
  const submissionLimitReached = (submitterStatus?.remaining ?? 1) <= 0;
  const finalFreeSlot = selectedRoute === "free" && submitterStatus?.remaining === 1 && publicQueueDeckHref(session) !== null;
  const estimatedPosition = Math.min((status?.activeCount ?? publicQueue.length) + 1, status?.capacity ?? ((status?.activeCount ?? publicQueue.length) + 1));

  return (
    <form onSubmit={submit} className="min-w-0 space-y-3 [overflow-wrap:anywhere] max-sm:[&_button]:min-h-[44px] max-sm:[&_input:not([type=checkbox])]:min-h-[44px] max-sm:[&_input:not([type=checkbox])]:text-[16px] max-sm:[&_select]:min-h-[44px] max-sm:[&_select]:text-[16px] max-sm:[&_textarea]:text-[16px]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-l-2 border-accent bg-accent/5 px-3 py-2.5" aria-live="polite">
        <div><p className="text-xs uppercase text-muted">Your submissions</p><p className="text-lg font-bold text-foreground">{submitterStatus ? `${submitterStatus.used} of ${submitterStatus.limit}` : "Checking allowance"}{submitterStatus && <span className="ml-3 text-sm font-normal text-muted">{submitterStatus.remaining} remaining</span>}</p></div>
        <p className={effectiveCooldown > 0 ? "text-sm font-bold text-accent" : "text-xs text-muted"}>{effectiveCooldown > 0 ? `Next submission in ${formatCooldown(effectiveCooldown)}` : submissionLimitReached ? "Session allowance used" : submitterStatus ? "Ready for your next song" : "Checking session"}</p>
      </div>
      <div className="grid gap-2 border border-border bg-surface p-3 text-xs sm:grid-cols-4">
        <div><p className="text-[10px] uppercase tracking-widest text-muted">Session</p><p className="truncate text-foreground">{session?.title ?? "BARCODE Radio"}</p></div>
        <div><p className="text-[10px] uppercase tracking-widest text-muted">Queue</p><p className={status?.isOpen ? "text-accent" : "text-danger"}>{status?.isOpen ? "Open" : "Closed"}</p></div>
        <div><p className="text-[10px] uppercase tracking-widest text-muted">Accepted / Capacity</p><p>{status ? `${status.acceptedCount ?? status.activeCount}/${status.capacity}` : "—"}</p></div>
        <div><p className="text-[10px] uppercase tracking-widest text-muted">Pressure</p><p>{pressureLabel(status, timingSummary)}</p></div>
      </div>

      <div className="border border-border bg-surface p-3">
        <div className="mb-3 flex items-center justify-between gap-3 border-b border-border pb-2">
          <div>
            <p className="text-[10px] uppercase tracking-[0.35em] text-muted">{step === "track" ? "Step 1 / Track" : "Step 2 / Submit"}</p>
            <h3 className="mt-1 text-lg font-bold text-foreground">{step === "track" ? "Add your song" : "Choose submission options"}</h3>
          </div>
          <p className="text-xs text-muted">{step === "track" ? "Song info" : "Private if needed"}</p>
        </div>

        <p className="mb-3 text-xs text-foreground">6 minutes (6:00) maximum per track, for free and Priority submissions. If duration cannot be read, the host must verify it before playback.</p>
        {error && <div className="mb-2 border border-danger/40 bg-danger/5 p-2 text-xs text-danger">{error}</div>}

        {step === "track" ? (
          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <button type="button" onClick={() => setMode("link")} aria-pressed={mode === "link"} className={`flex min-h-[44px] items-center cursor-pointer border p-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${mode === "link" ? "border-accent bg-accent text-background" : "border-border hover:border-accent/50 hover:bg-accent/10"}`}><span className={`text-xs uppercase tracking-widest ${mode === "link" ? "text-background" : "text-muted"}`}>Use Track Link</span></button>
              <button type="button" onClick={() => setMode("upload")} aria-pressed={mode === "upload"} className={`flex min-h-[44px] items-center cursor-pointer border p-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${mode === "upload" ? "border-accent bg-accent text-background" : "border-border hover:border-accent/50 hover:bg-accent/10"}`}><span className={`text-xs uppercase tracking-widest ${mode === "upload" ? "text-background" : "text-muted"}`}>Upload MP3/WAV</span></button>
            </div>
            {mode === "link" ? (
              <label className="space-y-1 block"><span className="text-xs uppercase tracking-widest text-muted">Track Link</span><input type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://soundcloud.com/..." className="w-full bg-background border border-border px-3 py-2 text-sm" required /></label>
            ) : (
              <>
                <label className="space-y-1 block"><span className="text-xs uppercase tracking-widest text-muted">Upload MP3/WAV</span><input key={fileInputKey} type="file" accept="audio/mpeg,audio/mp3,audio/wav,audio/wave,.mp3,.wav" onChange={(e) => onFileSelected(e.target.files?.[0] ?? null)} className="w-full bg-background border border-border px-3 py-2 text-sm" required={!file} /></label>
                {file && <div className="border border-border bg-background/40 p-2 text-xs text-muted"><p>Selected file: {file.name}</p><p>Size: {(file.size / (1024 * 1024)).toFixed(2)} MB</p><p>Duration: {detectedDuration ? formatRuntime(detectedDuration) : "pending"}</p><button type="button" onClick={() => { setFile(null); setDetectedDuration(null); setUploadProgress(null); setReadState("idle"); setFileInputKey((value) => value + 1); }} className="mt-2 cursor-pointer border border-danger/50 px-3 py-1 text-[11px] uppercase tracking-widest text-danger transition-colors hover:bg-danger/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/50">Remove File</button></div>}
              </>
            )}
            <details className="border-b border-border/70 pb-3 text-xs text-muted">
              <summary className="cursor-pointer py-1 text-foreground">Supported links &amp; upload details</summary>
              <div className="mt-2 grid gap-3 lg:grid-cols-[1.45fr_1fr]">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-foreground">Accepted track sources</p>
                <div className="mt-2 grid gap-2 md:grid-cols-[0.65fr_1.2fr_1.35fr]">
                  <div className="border border-border/60 bg-surface/50 p-2">
                    <p className="text-[10px] uppercase tracking-widest text-muted">Upload</p>
                    <ul className="mt-1 space-y-0.5 font-bold text-foreground">
                      <li>MP3</li>
                      <li>WAV</li>
                    </ul>
                  </div>
                  <div className="border border-accent/35 bg-accent/5 p-2">
                    <p className="text-[10px] uppercase tracking-widest text-accent">Built-in support</p>
                    <ul className="mt-1 space-y-0.5 font-bold text-foreground">
                      <li>YouTube video, Short, or YouTube Music</li>
                      <li>Spotify</li>
                      <li>SoundCloud</li>
                    </ul>
                  </div>
                  <div className="border border-border/60 bg-surface/50 p-2">
                    <p className="text-[10px] uppercase tracking-widest text-muted">Also accepted</p>
                    <ul className="mt-1 grid gap-x-3 gap-y-0.5 text-foreground sm:grid-cols-2 md:grid-cols-1 xl:grid-cols-2">
                      <li>Amazon Music</li>
                      <li>Suno</li>
                      <li>Bandcamp</li>
                      <li>TikTok video or Short</li>
                    </ul>
                  </div>
                </div>
              </div>
              <div className="space-y-1 leading-relaxed lg:self-end">
                <p>{QUEUE_TRACK_DURATION_UNVERIFIED_MESSAGE}</p>
                <p>Some accepted services currently open externally and may not provide automatic artwork, duration, or embedded playback. Expanded player and metadata support is planned.</p>
                <p className="text-foreground">Send a direct song, track, or video link—not an artist profile, playlist, channel, general homepage, or album page that does not identify a specific track.</p>
              </div>
              </div>
            </details>
            <div className="grid gap-2.5 sm:grid-cols-2">
              <ArtistCreditFields artist={artist} collaborators={collaboratorNames} decision={creditDecision} onChange={(name, features, decision, original) => { setArtist(name); setCollaboratorNames(features); setCreditDecision(decision); if (original) setOriginalArtist(original); }} />
              <label className="space-y-1"><span className="text-xs uppercase tracking-widest text-muted">Song title</span><input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full bg-background border border-border px-3 py-2 text-sm" required /></label>
              <label className="space-y-1"><span className="text-xs uppercase tracking-widest text-muted">TikTok handle</span><input value={tiktokHandle} onChange={(e) => setTikTokHandle(e.target.value)} placeholder="@six.bit" className="w-full bg-background border border-border px-3 py-2 text-sm" required /></label>
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
              <button type="button" onClick={onCancel} className="cursor-pointer border border-border px-4 py-2 text-xs uppercase tracking-widest text-muted transition-colors hover:border-foreground/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-muted/50">Collapse Intake</button>
              <button type="button" onClick={continueToRouting} className="cursor-pointer border border-accent bg-accent px-5 py-2 text-xs uppercase tracking-widest text-white transition-colors hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60">Continue</button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid gap-2 border border-accent/30 bg-accent/5 p-3 text-xs sm:grid-cols-2">
              <p><span className="text-muted">Artist:</span> {artist.trim() || "—"}</p>
              <p><span className="text-muted">Song:</span> {title.trim() || "—"}</p>
              <p><span className="text-muted">TikTok:</span> {tiktokHandle.trim() || "—"}</p>
              {collaboratorNames.trim() && <p><span className="text-muted">Featured:</span> {collaboratorNames.trim()}</p>}
              <p><span className="text-muted">Source type:</span> {mode === "upload" ? "Upload" : "Link"}</p>
            </div>
            <div className="grid gap-2.5 sm:grid-cols-2">
              <label className="space-y-1"><span className="text-xs uppercase tracking-widest text-muted">Contact email</span><input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="Optional, private" className="w-full bg-background border border-border px-3 py-2 text-sm" /><span className="block text-[11px] text-muted">For queue/payment issues only.</span></label>
              <label className="space-y-1"><span className="text-xs uppercase tracking-widest text-muted">Optional song note</span><textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, 500))} rows={2} placeholder="Optional host note. No private contact info." className="w-full bg-background border border-border px-3 py-2 text-sm" /><span className="block text-[11px] text-muted">For the host only; never public.</span></label>
            </div>
            <div className="grid gap-3 text-xs sm:grid-cols-2">
              <button type="button" onClick={() => setRouteChoice("free")} aria-pressed={selectedRoute === "free"} className={`cursor-pointer border p-4 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${selectedRoute === "free" ? "border-accent bg-accent/10 text-foreground shadow-[0_0_24px_rgba(255,0,0,0.16)]" : "border-border bg-background/40 text-muted hover:border-accent/45"}`}><span className="text-sm font-bold text-foreground">Free queue</span><span className="mt-2 block">No payment required.</span><span className="mt-3 block text-muted">{timingSummary.submitNowFreeEstimate ? `If you submit now: ${timingSummary.submitNowFreeEstimate.songsAhead} ${timingSummary.submitNowFreeEstimate.songsAhead === 1 ? "song" : "songs"} ahead · ${timingSummary.submitNowFreeEstimate.label}.` : `If you submit now, you’ll enter around position #${estimatedPosition} in the free queue. Estimated wait may shift during the show.`}</span></button>
              {priorityCheckoutAvailable ? <button type="button" onClick={() => setRouteChoice("priority")} aria-pressed={selectedRoute === "priority"} className={`cursor-pointer border p-4 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ffaa00]/60 ${selectedRoute === "priority" ? "border-[#ffaa00] bg-[#ffaa00]/10 text-foreground shadow-[0_0_24px_rgba(255,170,0,0.2)]" : "border-[#ffaa00]/40 bg-background/40 text-muted hover:border-[#ffaa00]/70"}`}><span className="text-sm font-bold text-[#ffaa00]">{PRIORITY_SIGNAL_LABEL}</span><span className="mt-2 block">Paid skip after payment clears.</span><span className="mt-3 block text-[#ffaa00]">{formatPrice(priorityPriceCents, priorityCurrency)}</span>{submitPriorityImpact && <div className="mt-3 grid grid-cols-2 gap-2 border border-[#ffaa00]/25 bg-[#ffaa00]/5 p-2"><div><span className="block text-[10px] uppercase tracking-widest text-muted">Free queue</span><span className="font-bold text-foreground">{submitPriorityImpact.freeLabel}</span></div><div><span className="block text-[10px] uppercase tracking-widest text-muted">Priority Signal</span><span className="font-bold text-[#ffaa00]">{submitPriorityImpact.priorityLabel}</span></div></div>}<span className="mt-2 block text-muted">Moves your track closer to the front. Does not interrupt the song currently playing.</span><span className="mt-3 block border border-[#ffaa00]/30 bg-[#ffaa00]/5 p-2 text-[11px] leading-relaxed text-muted">{PRIORITY_DISCLOSURE_TEXT}</span></button> : priorityPaymentsAvailable && <div className="border border-[#ffaa00]/30 bg-background/40 p-4 text-left text-muted"><span className="text-sm font-bold text-[#ffaa00]/70">{PRIORITY_SIGNAL_LABEL}</span><span className="mt-2 block">{PRIORITY_DEPTH_UNAVAILABLE_MESSAGE}</span><span className="mt-3 block text-[#ffaa00]/70">{formatPrice(priorityPriceCents, priorityCurrency)}</span></div>}
            </div>
            {signalHoldPaymentsAvailable && <button type="button" onClick={() => setRouteChoice("signal_hold")} disabled={!signalHoldCheckoutAvailable} aria-pressed={selectedRoute === "signal_hold"} className={`w-full border p-4 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/60 disabled:opacity-60 ${selectedRoute === "signal_hold" ? "border-cyan-200 bg-cyan-200/10" : "border-cyan-200/40 bg-background/40 hover:border-cyan-200"}`}>
              <span className="text-sm font-bold text-cyan-200">Free queue + Signal Hold · {formatPrice(signalHoldPriceCents, signalHoldCurrency)}</span>
              <span className="mt-2 block text-muted">If you might leave, the host can move this song to the bottom instead of removing it when you are called and absent. One song, this show only. It does not move you forward, hold your place or guarantee play.</span>
              <span className="mt-2 block text-muted">Your song is submitted first. Protection starts only after payment is confirmed. Priority Signal is purchased separately from your track.</span>
              {!signalHoldDepthAvailable && <span className="mt-2 block text-cyan-200">Available when at least two songs are ahead of your new submission. Signal Hold closes for the next two to play.</span>}
            </button>}
            {selectedRoute === "signal_hold" && <div className="border border-cyan-200/30 bg-cyan-200/5 p-3 text-xs leading-relaxed text-muted"><p>{SIGNAL_HOLD_DISCLOSURE_TEXT}</p><a href="/legal#signal-hold" target="_blank" rel="noreferrer" className="mt-2 inline-block text-cyan-200 underline underline-offset-2">Signal Hold Terms</a><p className="mt-2">By selecting Submit &amp; Continue to Signal Hold Payment, you accept these terms.</p></div>}
            <div className="border border-border bg-background/40 p-3 text-xs text-muted">
              <label className="flex items-start gap-3">
                <input type="checkbox" checked={acceptedLegal} onChange={(event) => { setAcceptedLegal(event.target.checked); if (event.target.checked) setLegalError(null); }} className="mt-1 h-4 w-4 accent-accent" aria-describedby="queue-legal-helper queue-legal-error" />
                <span>
                  I agree to the BARCODE Network <a href="/legal#terms" className="text-accent underline underline-offset-2" target="_blank" rel="noreferrer">Terms</a>, <a href="/legal#queue-submission" className="text-accent underline underline-offset-2" target="_blank" rel="noreferrer">Queue Submission Terms</a>, and <a href="/legal#privacy" className="text-accent underline underline-offset-2" target="_blank" rel="noreferrer">Privacy Policy</a>. I confirm I am 13+ and, if under 18, have parent/guardian permission. I confirm I have the rights to submit this track, and I understand uploads are temporary and may be used for BARCODE Radio/live show-related playback, clips, recaps, platform replays, and related BARCODE Network features as described in the terms.
                </span>
              </label>
              <p id="queue-legal-helper" className="mt-2 text-[11px] text-muted">Raw uploaded MP3/WAV files are temporary and are not intended to be stored permanently. See Queue Submission Terms for upload retention and usage details.</p>
              {legalError && <p id="queue-legal-error" className="mt-2 text-[11px] font-bold text-accent" role="alert">{legalError}</p>}
            </div>
            <div className="grid gap-2 text-xs sm:grid-cols-2">
              <div className="border border-border bg-background/40 p-2 text-muted">{checkCopy}</div>
              {!priorityPaymentsAvailable && <div className="border border-border bg-background/40 p-2 text-muted">Priority Signal is unavailable for this session. Free queue submission remains active.</div>}
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
              <button type="button" onClick={() => setStep("track")} className="border border-border px-4 py-2 text-xs uppercase tracking-widest text-muted">Back</button>
              <button type="submit" onClick={() => { finalSubmitIntent.current = true; }} disabled={submitting || readState === "uploading" || routingLockRemaining > 0 || effectiveCooldown > 0 || submissionLimitReached || status?.isOpen === false || status?.isFull === true} className="border border-accent px-5 py-2.5 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background disabled:opacity-50">{readState === "uploading" ? "Uploading audio…" : submitting ? "Submitting…" : routingLockRemaining > 0 ? `Submit lock: ${routingLockRemaining}` : effectiveCooldown > 0 ? `Next submission available in ${formatCooldown(effectiveCooldown)}` : submissionLimitReached ? "Submission Limit Reached" : status?.isFull ? "Queue Full" : selectedRoute === "signal_hold" ? "Submit & Continue to Signal Hold Payment" : selectedRoute === "priority" ? "Submit & Continue to Payment" : finalFreeSlot ? "Submit final song & open Broadcast Deck" : "Submit Free"}</button>
            </div>
            {selectedRoute === "free" && publicQueueDeckHref(session) && <p className="text-xs text-muted">Your final free song opens the Broadcast Deck once confirmed.</p>}
          </div>
        )}
      </div>
    </form>
  );
}

function formatCooldown(seconds: number): string {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const rest = Math.max(0, seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${rest}`;
}

function intakePhaseLabel(state: TransmissionState): string {
  if (state === "priority_requested") return "Opening Priority checkout";
  if (state === "signal_hold_requested") return "Opening Signal Hold checkout";
  if (state === "artwork") return "Song received";
  if (state === "metadata") return "Track details received";
  if (state === "routing") return "Broadcast route confirmed";
  return "Submission accepted";
}

function intakeLaneLabel(lane?: string): string {
  const labels: Record<string, string> = { FREE_QUEUE: "Free queue", PRIORITY_SIGNAL: "Priority Signal", WHEEL_CHOSEN: "Wheel Chosen", UP_NEXT: "Up next", NOW_PLAYING: "Now playing", RECORDED: "Broadcast record", ACTIVE_QUEUE: "Broadcast queue" };
  return lane ? labels[lane] ?? lane : "Broadcast queue";
}

export function QueueIntakeArtwork({ data }: { data: WarpData | null }) {
  const [failedArtworkUrl, setFailedArtworkUrl] = useState<string | null>(null);
  if (data?.artworkUrl && failedArtworkUrl !== data.artworkUrl) {
    return <img src={data.artworkUrl} alt={"Cover art for " + data.title} className="intake-cover" onError={() => setFailedArtworkUrl(data.artworkUrl ?? null)} />;
  }
  return <div className="intake-artwork-fallback">
    <span className="intake-fallback-brand">BARCODE / RADIO</span>
    <div><p className="intake-fallback-title">AUDIO</p><p className="intake-fallback-caption">Artwork unavailable</p></div>
    <p className="intake-fallback-artist">{data?.artist ?? "Submitted artist"}</p>
  </div>;
}

export function QueueIntakeSequence({ state, data }: { state: TransmissionState; data: WarpData | null }) {
  const phases: Array<{ state: QueueIntakePhase; label: string }> = [{ state: "artwork", label: "Cover" }, { state: "metadata", label: "Details" }, { state: "routing", label: "Route" }, { state: "confirmed", label: "Accepted" }];
  const activeIndex = phases.findIndex((phase) => phase.state === state);
  const isCheckout = state === "priority_requested" || state === "signal_hold_requested";
  const isConfirmed = state === "confirmed";
  const lane = intakeLaneLabel(data?.lane);
  return <div className="queue-intake-viewport fixed inset-0 z-[110000] overflow-x-hidden overflow-y-auto overscroll-contain text-foreground" data-intake-phase={state} role="status" aria-live="polite">
    <div className="intake-shell">
      <header className="intake-header">
        <div><p className="intake-network-label">BARCODE Radio</p><p className="intake-session-label">{data?.sessionTitle ?? "BARCODE Radio"}{data?.sessionDate && " / " + data.sessionDate}</p></div>
        <span className={"intake-saved-label" + (isCheckout ? " intake-payment-label" : "")}>{isCheckout ? "Payment not confirmed" : isConfirmed ? "Accepted" : "Song saved"}</span>
      </header>
      <div className="intake-grid">
        <div className="intake-artwork-column">
          <div className="intake-cover-shell"><QueueIntakeArtwork data={data} /><span className="intake-cover-capture" aria-hidden="true" /><span className="intake-cover-corner intake-cover-corner-top" aria-hidden="true" /><span className="intake-cover-corner intake-cover-corner-bottom" aria-hidden="true" /></div>
        </div>
        <div className="intake-song-column">
          <p className="intake-phase-label">{intakePhaseLabel(state)}</p>
          <h2 className="intake-track-title">{data?.title ?? "Submitted track"}</h2>
          <p className="intake-artist-credit">{data?.artist ?? "Submitted artist"}</p>
          <dl className="intake-metadata">
            {data?.sourceType && <div className="intake-meta-field"><dt>Source</dt><dd>{data.sourceType}</dd></div>}
            {data?.durationLabel && <div className="intake-meta-field"><dt>Runtime</dt><dd>{data.durationLabel}</dd></div>}
            {data?.tiktokHandle && <div className="intake-meta-field"><dt>Submitted by</dt><dd>{data.tiktokHandle}</dd></div>}
          </dl>
          <div className="intake-route">
            <div className="intake-route-heading"><span>Broadcast route</span><strong>{lane}</strong></div>
            <div className="intake-route-rail" aria-hidden="true"><span className="intake-route-line" /><span className="intake-route-marker" /></div>
            <p className="intake-route-status">{isCheckout ? "Your song is saved. Opening payment; the upgrade is not active." : data?.lane === "RECORDED" ? "Your song is saved in the broadcast record." : isConfirmed ? "Your song is in the queue." : "Your saved song is linked to this broadcast."}</p>
          </div>
        </div>
      </div>
      {!isCheckout && <ol className="intake-phase-rail" aria-label="Submission confirmation">
        {phases.map((phase, index) => <li key={phase.state} className={index <= activeIndex ? "intake-phase-step intake-phase-active" : "intake-phase-step"} aria-current={phase.state === state ? "step" : undefined}><span className="intake-phase-number">{"0" + (index + 1)}</span><span>{phase.label}</span><span className="intake-phase-stroke" aria-hidden="true" /></li>)}
      </ol>}
    </div>
    <style jsx>{`
      .queue-intake-viewport{display:grid;min-height:100dvh;place-items:center;background:rgba(5,7,8,.97);padding:1.25rem;letter-spacing:0}
      .intake-shell{position:relative;width:100%;max-width:58rem;min-width:0;padding:1.5rem;border-top:2px solid #ef3333;border-bottom:1px solid #363b3e;background:#101315;letter-spacing:0}
      .intake-shell *{letter-spacing:0}
      .intake-header{display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;margin-bottom:1.5rem}
      .intake-network-label{font-size:.8rem;font-weight:800;text-transform:uppercase;color:#fafafa}
      .intake-session-label{margin-top:.3rem;font-size:.75rem;line-height:1.4;color:#b8c0c4;overflow-wrap:anywhere}
      .intake-saved-label{flex-shrink:0;min-width:7.2rem;text-align:center;padding:.45rem .65rem;border:1px solid #70d3b1;background:#112820;color:#a9efda;font-size:.7rem;font-weight:700;text-transform:uppercase}
      .intake-payment-label{border-color:#e8b95a;background:#282113;color:#f2cd82}
      .intake-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.1fr);align-items:center;gap:2rem}
      .intake-artwork-column{display:grid;place-items:center;min-width:0}
      .intake-cover-shell{position:relative;isolation:isolate;width:100%;max-width:25rem;aspect-ratio:1;border:1px solid #5b646b;background:#090b0c}
      .intake-cover-capture{position:absolute;z-index:1;inset:0;opacity:0;pointer-events:none;background:linear-gradient(165deg,transparent 37%,rgba(220,250,255,.05) 45%,rgba(220,250,255,.18) 49%,rgba(220,250,255,.05) 53%,transparent 61%)}
      .intake-cover-corner{position:absolute;z-index:2;width:1.15rem;height:1.15rem;pointer-events:none}
      .intake-cover-corner-top{left:-5px;top:-5px;border-left:2px solid #ef3333;border-top:2px solid #ef3333}
      .intake-cover-corner-bottom{right:-5px;bottom:-5px;border-right:2px solid #ef3333;border-bottom:2px solid #ef3333}
      .intake-cover-shell :global(.intake-cover){display:block;width:100%;height:100%;object-fit:contain;object-position:center}
      .intake-cover-shell :global(.intake-artwork-fallback){display:flex;flex-direction:column;justify-content:space-between;width:100%;height:100%;padding:1.25rem;background:#171d20;color:#e3ecef;overflow-wrap:anywhere}
      .intake-cover-shell :global(.intake-fallback-brand){font-size:.65rem;font-weight:700;color:#9fb0b9}
      .intake-cover-shell :global(.intake-fallback-title){font-size:2.5rem;font-weight:900;line-height:1.1}
      .intake-cover-shell :global(.intake-fallback-caption){margin-top:.5rem;font-size:.75rem;color:#b6c3c9}
      .intake-cover-shell :global(.intake-fallback-artist){font-size:.8rem;line-height:1.3;max-height:3.9em;overflow:hidden}
      .intake-song-column{min-width:0}
      .intake-phase-label{min-height:1.25rem;margin-bottom:.7rem;color:#ff6868;font-size:.8rem;font-weight:700;text-transform:uppercase}
      .intake-track-title{font-size:2rem;line-height:1.12;font-weight:800;color:#fff;overflow-wrap:anywhere}
      .intake-artist-credit{margin-top:.65rem;font-size:1rem;line-height:1.45;font-weight:600;color:#e1e7e9;overflow-wrap:anywhere}
      .intake-metadata{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.65rem;margin-top:1.2rem;min-height:3.2rem}
      .intake-meta-field{min-width:0;border-top:1px solid #424a4f;padding-top:.5rem}
      .intake-meta-field dt{color:#aab5bc;font-size:.65rem;text-transform:uppercase}
      .intake-meta-field dd{margin-top:.25rem;color:#eaf0f2;font-size:.8rem;font-weight:600;overflow-wrap:anywhere}
      .intake-route{margin-top:1.4rem;border-top:1px solid #394247;padding-top:.85rem}
      .intake-route-heading{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:.5rem;font-size:.7rem;color:#aab5bc}
      .intake-route-heading strong{font-size:.8rem;color:#e8eef0}
      .intake-route-rail{position:relative;height:1.6rem;margin-top:.6rem;overflow:hidden}
      .intake-route-line{position:absolute;left:0;right:0;top:50%;height:2px;background:#3c464d}
      .intake-route-marker{position:absolute;left:0;top:calc(50% - .25rem);width:.5rem;height:.5rem;background:#ef3333}
      .intake-route-status{min-height:2.6em;font-size:.75rem;line-height:1.4;color:#b8c4ca}
      .intake-phase-rail{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.75rem;margin-top:1.5rem;padding-top:1rem;border-top:1px solid #343d42;list-style:none}
      .intake-phase-step{position:relative;display:flex;align-items:center;gap:.45rem;min-width:0;padding-bottom:.6rem;color:#9aa7af;font-size:.7rem;line-height:1.3}
      .intake-phase-number{font-size:.65rem;font-weight:700;color:#74838d}
      .intake-phase-stroke{position:absolute;bottom:0;left:0;width:100%;height:2px;background:#374148}
      .intake-phase-active{color:#f3f6f7}
      .intake-phase-active .intake-phase-number{color:#ff7474}
      .intake-phase-active .intake-phase-stroke{background:#ef3333}
      [data-intake-phase="artwork"] .intake-cover-shell{animation:intake-cover-reveal 1.05s cubic-bezier(.18,.7,.24,1) both}
      [data-intake-phase="artwork"] .intake-cover-capture{animation:intake-cover-capture 1.1s ease-out .1s both}
      [data-intake-phase="metadata"] .intake-meta-field{animation:intake-metadata-lock .7s ease-out both}
      [data-intake-phase="metadata"] .intake-meta-field:nth-child(2){animation-delay:.12s}
      [data-intake-phase="metadata"] .intake-meta-field:nth-child(3){animation-delay:.24s}
      [data-intake-phase="routing"] .intake-route-marker{animation:intake-route-travel 1.35s cubic-bezier(.2,.65,.3,1) forwards}
      [data-intake-phase="confirmed"] .intake-route-marker{left:calc(100% - .5rem);background:#85dfbd}
      [data-intake-phase="confirmed"] .intake-route-line{background:#477e6b}
      [data-intake-phase="confirmed"] .intake-phase-label{color:#a9efda}
      [data-intake-phase="confirmed"] .intake-shell{border-top-color:#85dfbd;transition:border-color .5s ease}
      [data-intake-phase="confirmed"] .intake-saved-label{animation:intake-accepted-land .65s ease-out both}
      [data-intake-phase="confirmed"] .intake-cover-shell{border-color:#85dfbd;transition:border-color .4s ease}
      [data-intake-phase="confirmed"] .intake-cover-corner{width:1.65rem;height:1.65rem;border-color:#85dfbd;transition:border-color .4s ease,width .45s ease,height .45s ease}
      [data-intake-phase="confirmed"] .intake-phase-active .intake-phase-stroke{background:#85dfbd}
      [data-intake-phase="confirmed"] .intake-phase-active .intake-phase-number{color:#a9efda}
      @keyframes intake-cover-reveal{from{transform:translateY(12px) scale(.97);border-color:#ef3333}to{transform:translateY(0) scale(1);border-color:#5b646b}}
      @keyframes intake-cover-capture{0%{transform:translateY(-25%);opacity:0}25%{opacity:.65}80%{opacity:.5}100%{transform:translateY(25%);opacity:0}}
      @keyframes intake-accepted-land{from{transform:translateY(5px);border-color:#d2ffef;background:#183c2e}to{transform:translateY(0);border-color:#70d3b1;background:#112820}}
      @keyframes intake-metadata-lock{from{transform:translateY(6px);border-color:#ef3333}to{transform:translateY(0);border-color:#424a4f}}
      @keyframes intake-route-travel{from{left:0;width:.8rem}to{left:calc(100% - .5rem);width:.5rem}}
      @media(max-width:700px){.queue-intake-viewport{padding:.75rem}.intake-shell{padding:1rem}.intake-header{gap:.6rem;margin-bottom:1rem}.intake-saved-label{font-size:.6rem;padding:.4rem}.intake-grid{grid-template-columns:minmax(0,1fr);gap:1.15rem}.intake-cover-shell{max-width:15rem}.intake-track-title{font-size:1.5rem}.intake-artist-credit{font-size:.9rem;margin-top:.5rem}.intake-metadata{margin-top:.9rem}.intake-route{margin-top:1rem}.intake-phase-rail{gap:.5rem;margin-top:1rem}.intake-phase-step{gap:.25rem;font-size:.6rem}.intake-phase-number{font-size:.55rem}}
      @media(max-height:500px) and (min-width:560px){.queue-intake-viewport{padding:.75rem}.intake-shell{padding:1rem}.intake-header{margin-bottom:.75rem}.intake-grid{grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr);gap:1.25rem}.intake-cover-shell{max-width:13rem}.intake-track-title{font-size:1.35rem}.intake-artist-credit{font-size:.85rem;margin-top:.4rem}.intake-metadata{margin-top:.65rem;min-height:0}.intake-route{margin-top:.7rem;padding-top:.6rem}.intake-route-rail{height:1rem;margin-top:.4rem}.intake-phase-rail{margin-top:.75rem;padding-top:.7rem}}
      @media(prefers-reduced-motion:reduce){.intake-cover-shell,.intake-cover-capture,.intake-meta-field,.intake-route-marker,.intake-saved-label,.intake-cover-corner,.intake-shell{animation:none!important;transition:none!important;transform:none!important}.intake-cover-capture{display:none}}
    `}</style>
  </div>;
}
