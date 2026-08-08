/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps, @next/next/no-img-element */
"use client";

import { upload } from "@vercel/blob/client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { buildQueueTimingDisplay, priorityDisplayFromImpact, queueTimingInputFromPublicSnapshot } from "@/lib/queue-timing-display";
import { APPLE_MUSIC_QUEUE_UNSUPPORTED_MESSAGE, PUBLIC_QUEUE_LEGAL_CHECKBOX_TEXT, PUBLIC_QUEUE_LEGAL_PRIVACY_VERSION, PUBLIC_QUEUE_LEGAL_QUEUE_TERMS_VERSION, PUBLIC_QUEUE_LEGAL_TERMS_VERSION, formatRuntime, isAppleMusicUrl, PRIORITY_DISCLOSURE_TEXT, PRIORITY_TERMS_VERSION } from "@/lib/queue-types";
import type { QueuePublicSnapshot, QueuePublicStatus, QueuePublicTrack } from "@/lib/queue-types";

type Mode = "link" | "upload";
type ReadState = "idle" | "checking" | "reading" | "detected" | "pending" | "uploading";
type TransmissionState = "idle" | "priority_requested" | "signal" | "received" | "encoded" | "converting" | "temporal" | "aligning" | "confirmed";
type SubmitPhase = "resolved" | "complete";
type AcceptedReceipt = { artist: string; title: string; sessionTitle: string; sessionDate: string; trackCode: string };
type IntakeStep = "track" | "routing";
type RouteChoice = "free" | "priority";

const UPLOAD_FALLBACK_MESSAGE = "Upload could not be completed. Please try again or submit a Spotify, SoundCloud, YouTube, or direct track link.";
const PRIORITY_SIGNAL_LABEL = "Priority Signal";
const PRIORITY_CHECKOUT_UNAVAILABLE_MESSAGE = "Priority checkout could not be started. Your song stays in the free queue if still active.";
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
  queueStatus: string;
  submissionSlot: string;
  lane: string;
  artworkUrl?: string | null;
}

function pressureLabel(status: QueuePublicStatus | null): string {
  if (!status) return "Syncing";
  return `${status.pressure.toUpperCase()} / ${status.activeCount} ACTIVE`;
}

function safeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-").slice(0, 120) || "track";
}

function audioMimeTypeForFile(file: File): string {
  const browserType = file.type.toLowerCase();
  if (["audio/mpeg", "audio/mp3", "audio/wav", "audio/wave", "audio/x-wav"].includes(browserType)) return browserType;
  if (/\.mp3$/i.test(file.name)) return "audio/mpeg";
  if (/\.wav$/i.test(file.name)) return "audio/wav";
  return browserType || "application/octet-stream";
}

function readAudioDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const audio = document.createElement("audio");
    const url = URL.createObjectURL(file);
    let settled = false;
    const finish = (duration: number | null) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      resolve(duration && Number.isFinite(duration) && duration > 0 ? Math.round(duration) : null);
    };
    const read = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) finish(audio.duration);
    };
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      read();
      if (!settled && audio.duration === Infinity) {
        audio.currentTime = 24 * 60 * 60;
      }
    };
    audio.ondurationchange = read;
    audio.ontimeupdate = read;
    audio.onerror = () => finish(null);
    window.setTimeout(() => finish(null), 5000);
    audio.src = url;
  });
}

function publicTrackFromApi(track: { id: string; submittedArtistName?: string; submittedSongTitle?: string; artist?: string; title?: string; sourceType?: QueuePublicTrack["sourceType"]; lane?: QueuePublicTrack["lane"]; detectedArtistName?: string | null; detectedSongTitle?: string | null; detectedDurationSeconds?: number | null; estimatedDurationSeconds?: number; durationLabel?: string; durationIsEstimate?: boolean; durationSource?: QueuePublicTrack["durationSource"]; sourceArtworkUrl?: string | null; publicSourceUrl?: string | null; tiktokHandle?: string | null; priorityUpgradeRequested?: boolean; priorityUpgradeStatus?: QueuePublicTrack["priorityUpgradeStatus"] }): QueuePublicTrack {
  return {
    id: track.id,
    submittedArtistName: track.submittedArtistName ?? track.artist ?? "Submitted artist",
    submittedSongTitle: track.submittedSongTitle ?? track.title ?? "Submitted track",
    detectedArtistName: track.detectedArtistName ?? null,
    detectedSongTitle: track.detectedSongTitle ?? null,
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

export function RadioQueueForm({ sessionId, onSubmitted, onCancel, onAcceptedReceipt }: { sessionId?: string; onSubmitted?: (trackId?: string, phase?: SubmitPhase, targetId?: string) => void; onCancel?: () => void; onAcceptedReceipt?: (receipt: AcceptedReceipt) => void } = {}) {
  const [status, setStatus] = useState<QueuePublicStatus | null>(null);
  const [publicQueue, setPublicQueue] = useState<QueuePublicTrack[]>([]);
  const [nowPlaying, setNowPlaying] = useState<QueuePublicTrack | null>(null);
  const [upNext, setUpNext] = useState<QueuePublicTrack | null>(null);
  const [session, setSession] = useState<QueuePublicSnapshot["session"] | null>(null);
  const [submitterStatus, setSubmitterStatus] = useState<QueuePublicSnapshot["submitterStatus"] | null>(null);
  const [mode, setMode] = useState<Mode>("link");
  const [step, setStep] = useState<IntakeStep>("track");
  const [routingLockRemaining, setRoutingLockRemaining] = useState(0);
  const finalSubmitIntent = useRef(false);
  const [artist, setArtist] = useState("");
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

  async function loadStatus() {
    const params = new URLSearchParams();
    if (sessionId) params.set("sessionId", sessionId);
    if (submitterToken) params.set("submitterToken", submitterToken);
    if (tiktokHandle.trim()) params.set("tiktokHandle", tiktokHandle.trim());
    if (contactEmail.trim()) params.set("contactEmail", contactEmail.trim());
    if (artist.trim()) params.set("artist", artist.trim());
    const res = await fetch(`/api/queue${params.size ? `?${params.toString()}` : ""}`, { cache: "no-store" });
    if (res.ok) {
      const payload = await res.json();
      setStatus(payload.status ?? null);
      setSession(payload.session ?? null);
      setSubmitterStatus(payload.submitterStatus ?? null);
      setPublicQueue(Array.isArray(payload.queue) ? payload.queue : []);
      setNowPlaying(payload.nowPlaying ?? null);
      setUpNext(payload.upNext ?? null);
      return payload as QueuePublicSnapshot;
    }
    return null;
  }

  useEffect(() => {
    loadStatus();
    const interval = setInterval(loadStatus, 5_000);
    return () => clearInterval(interval);
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
    if (cooldownRemaining <= 0) return;
    const timer = window.setInterval(() => setCooldownRemaining((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldownRemaining]);

  useEffect(() => {
    if (!submitterToken) return;
    const key = `barcode-radio-cooldown:${sessionId ?? "active"}:${submitterToken}`;
    const until = Number(window.localStorage.getItem(key) ?? 0);
    const remaining = Math.ceil((until - Date.now()) / 1000);
    if (remaining > 0) setCooldownRemaining(remaining);
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
    const queued = snapshot.queue.find((entry) => entry.id === trackId) ?? null;
    if (queued?.lane === "priority") return { track: queued, targetId: "priority-lane", laneLabel: "PRIORITY_SIGNAL" };
    if (queued?.lane === "wheel") return { track: queued, targetId: "wheel-lane", laneLabel: "WHEEL_CHOSEN" };
    if (queued?.lane === "regular") return { track: queued, targetId: "free-transmissions-lane", laneLabel: "FREE_QUEUE" };
    return { track: queued, targetId: "active-queue-panel", laneLabel: "ACTIVE_QUEUE" };
  }

  function wait(ms: number) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  async function onFileSelected(next: File | null) {
    setFile(next);
    setDetectedDuration(null);
    setUploadProgress(null);
    setReadState(next ? "reading" : "idle");
    if (!next) return;
    const duration = await readAudioDuration(next);
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
  const timingSnapshot = useMemo<QueuePublicSnapshot | null>(() => session && status ? { revision: 0, session, status, queue: publicQueue, completed: [], nowPlaying, upNext, submitterStatus } : null, [session, status, publicQueue, nowPlaying, upNext, submitterStatus]);
  const timingSummary = useMemo(() => buildQueueTimingDisplay(queueTimingInputFromPublicSnapshot(timingSnapshot), { priorityEligible: priorityCheckoutAvailable }), [timingSnapshot, priorityCheckoutAvailable]);
  const submitPriorityImpact = priorityCheckoutAvailable ? priorityDisplayFromImpact(timingSummary.priorityImpactEstimate) : null;
  const selectedRoute: RouteChoice = priorityCheckoutAvailable ? routeChoice : "free";

  function clearTrackDraftFields() {
    setTitle("");
    setLink("");
    setCollaboratorNames("");
    setNote("");
    setFile(null);
    setFileInputKey((value) => value + 1);
    setDetectedDuration(null);
    setReadState("idle");
    setUploadProgress(null);
    setRouteChoice("free");
  }

  async function waitForTrackConfirmation(trackId: string): Promise<QueuePublicSnapshot | null> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const snapshot = await loadStatus();
      const foundInQueue = snapshot?.queue.some((entry) => entry.id === trackId);
      const foundInNowPlaying = snapshot?.nowPlaying?.id === trackId;
      const foundInUpNext = snapshot?.upNext?.id === trackId;
      const foundInCompleted = snapshot?.completed.some((entry) => entry.id === trackId);
      if (foundInQueue || foundInNowPlaying || foundInUpNext || foundInCompleted) return snapshot;
      if (attempt < 4) await wait(500);
    }
    return null;
  }

  async function startPriorityCheckout(trackId: string): Promise<boolean> {
    const checkoutSessionId = sessionId ?? session?.sessionId;
    if (!checkoutSessionId) return false;
    setTransmissionState("priority_requested");
    await wait(650);
    const res = await fetch("/api/queue/priority-checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trackId, sessionId: checkoutSessionId, acceptedPriorityTerms: true, priorityTermsVersion: PRIORITY_TERMS_VERSION, priorityDisclosureText: PRIORITY_DISCLOSURE_TEXT }) });
    const payload = await res.json().catch(() => ({}));
    if (res.ok && typeof payload.url === "string") {
      window.location.href = payload.url;
      return true;
    }
    setTransmissionState("idle");
    return false;
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step !== "routing") {
      continueToRouting();
      return;
    }
    if (!finalSubmitIntent.current || routingLockRemaining > 0) {
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
    setSubmitting(true);
    try {
      const refreshedBeforeSubmit = await loadStatus();
      const latestSessionId = refreshedBeforeSubmit?.session?.sessionId ?? session?.sessionId ?? sessionId;
      if (!latestSessionId) throw new Error(SESSION_SYNC_REQUIRED_MESSAGE);
      const visibleSessionId = session?.sessionId ?? sessionId;
      if (visibleSessionId && latestSessionId !== visibleSessionId) throw new Error(SESSION_CHANGED_MESSAGE);
      const body: Record<string, string | number | boolean> = {
        mode,
        artist: artist.trim(),
        title: title.trim(),
        tiktokHandle: tiktokHandle.trim(),
        collaboratorNames: collaboratorNames.trim(),
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
          setCooldownRemaining(payload.cooldownRemainingSeconds);
          if (submitterToken) window.localStorage.setItem(`barcode-radio-cooldown:${sessionId ?? "active"}:${submitterToken}`, String(Date.now() + payload.cooldownRemainingSeconds * 1000));
        }
        throw new Error(payload.cooldownRemainingSeconds ? `Next submission available in ${formatCooldown(payload.cooldownRemainingSeconds)}` : payload.error || "Submission failed");
      }
      if (payload.track?.id) {
        const submitted = publicTrackFromApi(payload.track);
        const confirmedSnapshot = await waitForTrackConfirmation(submitted.id);
        if (!confirmedSnapshot) {
          await loadStatus();
          throw new Error(`${QUEUE_CONFIRMATION_FAILED_MESSAGE} Reference: ${submitted.id.slice(0, 8).toUpperCase()}`);
        }
        const receipt = {
          artist: artist.trim(),
          title: title.trim(),
          sessionTitle: refreshedBeforeSubmit?.session?.title ?? session?.title ?? "BARCODE Radio",
          sessionDate: refreshedBeforeSubmit?.session?.showDate ?? session?.showDate ?? "ACTIVE SESSION",
          trackCode: submitted.id.slice(0, 8).toUpperCase(),
        };
        onAcceptedReceipt?.(receipt);
        window.localStorage.setItem("barcode-radio-submit-artist", artist.trim());
        window.localStorage.setItem("barcode-radio-submit-tiktok", tiktokHandle.trim());
        window.localStorage.setItem("barcode-radio-submit-email", contactEmail.trim());
        const nextCooldown = typeof payload.cooldownRemainingSeconds === "number" ? payload.cooldownRemainingSeconds : 0;
        setCooldownRemaining(nextCooldown);
        if (submitterToken) {
          const cooldownKey = `barcode-radio-cooldown:${sessionId ?? "active"}:${submitterToken}`;
          if (nextCooldown > 0) window.localStorage.setItem(cooldownKey, String(Date.now() + nextCooldown * 1000));
          else window.localStorage.removeItem(cooldownKey);
        }
        if (selectedRoute === "priority") {
          setWarpData({
            artist: artist.trim(),
            title: title.trim(),
            tiktokHandle: tiktokHandle.trim(),
            sourceType: mode === "upload" ? "UPLOAD" : (submitted.sourceType ?? "other").toUpperCase(),
            durationLabel: detectedDuration ? formatRuntime(detectedDuration) : submitted.durationLabel,
            sessionTitle: session?.title ?? "BARCODE Radio",
            sessionDate: session?.showDate ?? "ACTIVE SESSION",
            queueStatus: status ? `${(status.acceptedCount ?? status.activeCount) + 1}/${status.capacity}` : "SYNCING",
            submissionSlot: "CHECKOUT_PENDING",
            lane: "FREE QUEUE / PAYMENT REQUIRED",
            artworkUrl: submitted.sourceArtworkUrl ?? null,
          });
          const checkoutStarted = await startPriorityCheckout(submitted.id);
          if (checkoutStarted) return;
          setError(PRIORITY_CHECKOUT_UNAVAILABLE_MESSAGE);
          setPublicQueue((current) => [submitted, ...current.filter((entry) => entry.id !== submitted.id)]);
          await loadStatus();
          onSubmitted?.(submitted.id, "resolved", "free-transmissions-lane");
          setArtist(window.localStorage.getItem("barcode-radio-submit-artist") ?? artist.trim());
          setTikTokHandle(window.localStorage.getItem("barcode-radio-submit-tiktok") ?? tiktokHandle.trim());
          setContactEmail(window.localStorage.getItem("barcode-radio-submit-email") ?? contactEmail.trim());
          clearTrackDraftFields();
          setStep("track");
          return;
        }
        const preSubmit = { nowPlayingWasEmpty: !nowPlaying, upNextWasEmpty: !upNext, activeCount: status?.activeCount ?? publicQueue.length };
        const baseWarpData: WarpData = {
          artist: artist.trim(),
          title: title.trim(),
          tiktokHandle: tiktokHandle.trim(),
          sourceType: mode === "upload" ? "UPLOAD" : (submitted.sourceType ?? "other").toUpperCase(),
          durationLabel: detectedDuration ? formatRuntime(detectedDuration) : submitted.durationLabel,
          sessionTitle: session?.title ?? "BARCODE Radio",
          sessionDate: session?.showDate ?? "ACTIVE SESSION",
          queueStatus: status ? `${(status.acceptedCount ?? status.activeCount) + 1}/${status.capacity}` : "SYNCING",
          submissionSlot: status ? `#${Math.min((status.acceptedCount ?? status.activeCount) + 1, status.capacity)}` : "FREE_QUEUE",
          lane: submitted.lane === "priority" ? "PRIORITY_SIGNAL" : submitted.lane === "wheel" ? "WHEEL_CHOSEN" : "FREE_QUEUE",
          artworkUrl: submitted.sourceArtworkUrl ?? null,
        };
        setWarpData(baseWarpData);
        setTransmissionState("signal");
        setPublicQueue((current) => [submitted, ...current.filter((entry) => entry.id !== submitted.id)]);
        await wait(1000);
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
          queueStatus: confirmedSnapshot ? `${confirmedSnapshot.status.acceptedCount ?? confirmedSnapshot.status.activeCount}/${confirmedSnapshot.status.capacity}` : baseWarpData.queueStatus,
          submissionSlot: resolvedTrack.id === confirmedSnapshot?.upNext?.id ? "UP_NEXT" : baseWarpData.submissionSlot,
        });
        onSubmitted?.(submitted.id, "resolved", resolved.targetId);
        setTransmissionState("received");
        await wait(900);
        setTransmissionState("encoded");
        await wait(1100);
        setTransmissionState("converting");
        await wait(1300);
        setTransmissionState("temporal");
        await wait(1400);
        setTransmissionState("aligning");
        await wait(1400);
        setTransmissionState("confirmed");
        await wait(900);
        onSubmitted?.(submitted.id, "complete", resolved.targetId);
      }
      setArtist(window.localStorage.getItem("barcode-radio-submit-artist") ?? artist.trim());
      setTikTokHandle(window.localStorage.getItem("barcode-radio-submit-tiktok") ?? tiktokHandle.trim());
      setContactEmail(window.localStorage.getItem("barcode-radio-submit-email") ?? contactEmail.trim());
      clearTrackDraftFields();
      setStep("track");
    } catch (err) {
      setTransmissionState("idle");
      setStep("track");
      setError(err instanceof Error ? err.message : "Submission failed");
    } finally {
      finalSubmitIntent.current = false;
      setSubmitting(false);
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
    setError(null);
    setStep("routing");
  }

  if (transmissionState !== "idle") return createPortal(<WarpSequence state={transmissionState} data={warpData} />, document.body);

  const effectiveCooldown = session?.submissionCooldownSeconds === 0 ? 0 : Math.max(cooldownRemaining, submitterStatus?.cooldownRemainingSeconds ?? 0);
  const estimatedPosition = Math.min((status?.activeCount ?? publicQueue.length) + 1, status?.capacity ?? ((status?.activeCount ?? publicQueue.length) + 1));

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid gap-2 border border-border bg-surface p-3 text-xs sm:grid-cols-4">
        <div><p className="text-[10px] uppercase tracking-widest text-muted">Session</p><p className="truncate text-foreground">{session?.title ?? "BARCODE Radio"}</p></div>
        <div><p className="text-[10px] uppercase tracking-widest text-muted">Queue</p><p className={status?.isOpen ? "text-accent" : "text-danger"}>{status?.isOpen ? "Open" : "Closed"}</p></div>
        <div><p className="text-[10px] uppercase tracking-widest text-muted">Accepted / Capacity</p><p>{status ? `${status.acceptedCount ?? status.activeCount}/${status.capacity}` : "—"}</p></div>
        <div><p className="text-[10px] uppercase tracking-widest text-muted">Pressure</p><p>{pressureLabel(status)}</p></div>
      </div>

      <div className="border border-border bg-surface p-3">
        <div className="mb-3 flex items-center justify-between gap-3 border-b border-border pb-2">
          <div>
            <p className="text-[10px] uppercase tracking-[0.35em] text-muted">{step === "track" ? "Step 1 / Track" : "Step 2 / Submit"}</p>
            <h3 className="mt-1 text-lg font-bold text-foreground">{step === "track" ? "Add your song" : "Pick free or Priority"}</h3>
          </div>
          <p className="text-xs text-muted">{step === "track" ? "Song info" : "Private if needed"}</p>
        </div>

        {error && <div className="mb-2 border border-danger/40 bg-danger/5 p-2 text-xs text-danger">{error}</div>}

        {step === "track" ? (
          <div className="space-y-3">
            <div className="grid gap-2.5 sm:grid-cols-2">
              <label className="space-y-1"><span className="text-xs uppercase tracking-widest text-muted">Artist name</span><input value={artist} onChange={(e) => setArtist(e.target.value)} className="w-full bg-background border border-border px-3 py-2 text-sm" required /></label>
              <label className="space-y-1"><span className="text-xs uppercase tracking-widest text-muted">Song title</span><input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full bg-background border border-border px-3 py-2 text-sm" required /></label>
              <label className="space-y-1"><span className="text-xs uppercase tracking-widest text-muted">TikTok handle</span><input value={tiktokHandle} onChange={(e) => setTikTokHandle(e.target.value)} placeholder="@six.bit" className="w-full bg-background border border-border px-3 py-2 text-sm" required /></label>
              <label className="space-y-1"><span className="text-xs uppercase tracking-widest text-muted">Featured/collaborator artist(s)</span><input value={collaboratorNames} onChange={(e) => setCollaboratorNames(e.target.value)} placeholder="Optional" className="w-full bg-background border border-border px-3 py-2 text-sm" /></label>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <button type="button" onClick={() => setMode("link")} aria-pressed={mode === "link"} className={`flex min-h-[44px] items-center cursor-pointer border p-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${mode === "link" ? "border-accent bg-accent text-background" : "border-border hover:border-accent/50 hover:bg-accent/10"}`}><span className={`text-xs uppercase tracking-widest ${mode === "link" ? "text-background" : "text-muted"}`}>Use Track Link</span></button>
              <button type="button" onClick={() => setMode("upload")} aria-pressed={mode === "upload"} className={`flex min-h-[44px] items-center cursor-pointer border p-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${mode === "upload" ? "border-accent bg-accent text-background" : "border-border hover:border-accent/50 hover:bg-accent/10"}`}><span className={`text-xs uppercase tracking-widest ${mode === "upload" ? "text-background" : "text-muted"}`}>Upload MP3/WAV</span></button>
            </div>
            <div className="grid gap-3 border border-border/70 bg-background/40 p-3 text-xs text-muted lg:grid-cols-[1.45fr_1fr]">
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
                <p>Some accepted services currently open externally and may not provide automatic artwork, duration, or embedded playback. Expanded player and metadata support is planned.</p>
                <p className="text-foreground">Send a direct song, track, or video link—not an artist profile, playlist, channel, general homepage, or album page that does not identify a specific track.</p>
              </div>
            </div>
            {mode === "link" ? (
              <label className="space-y-1 block"><span className="text-xs uppercase tracking-widest text-muted">Track Link</span><input type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://soundcloud.com/..." className="w-full bg-background border border-border px-3 py-2 text-sm" required /></label>
            ) : (
              <>
                <label className="space-y-1 block"><span className="text-xs uppercase tracking-widest text-muted">Upload MP3/WAV</span><input key={fileInputKey} type="file" accept="audio/mpeg,audio/mp3,audio/wav,audio/wave,.mp3,.wav" onChange={(e) => onFileSelected(e.target.files?.[0] ?? null)} className="w-full bg-background border border-border px-3 py-2 text-sm" required={!file} /></label>
                {file && <div className="border border-border bg-background/40 p-2 text-xs text-muted"><p>Selected file: {file.name}</p><p>Size: {(file.size / (1024 * 1024)).toFixed(2)} MB</p><p>Duration: {detectedDuration ? formatRuntime(detectedDuration) : "pending"}</p><button type="button" onClick={() => { setFile(null); setDetectedDuration(null); setUploadProgress(null); setReadState("idle"); setFileInputKey((value) => value + 1); }} className="mt-2 cursor-pointer border border-danger/50 px-3 py-1 text-[11px] uppercase tracking-widest text-danger transition-colors hover:bg-danger/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/50">Remove File</button></div>}
              </>
            )}
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
              {submitterStatus && <div className="border border-accent/40 bg-accent/5 p-2 text-muted"><p className="font-bold text-accent">Your submissions: {submitterStatus.used} / {submitterStatus.limit}</p><p>Remaining: {submitterStatus.remaining}</p>{submitterStatus.cooldownRemainingSeconds > 0 && <p className="text-accent">Cooldown: {formatCooldown(submitterStatus.cooldownRemainingSeconds)}</p>}</div>}
              {effectiveCooldown > 0 && <div className="border border-accent/40 bg-accent/5 p-2 text-accent">Next submission available in {formatCooldown(effectiveCooldown)}</div>}
              <div className="border border-border bg-background/40 p-2 text-muted">{checkCopy}</div>
              {!priorityPaymentsAvailable && <div className="border border-border bg-background/40 p-2 text-muted">Priority Signal is unavailable for this session. Free queue submission remains active.</div>}
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
              <button type="button" onClick={() => setStep("track")} className="border border-border px-4 py-2 text-xs uppercase tracking-widest text-muted">Back</button>
              <button type="submit" onClick={() => { finalSubmitIntent.current = true; }} disabled={submitting || readState === "uploading" || routingLockRemaining > 0 || effectiveCooldown > 0 || status?.isOpen === false || status?.isFull === true} className="border border-accent px-5 py-2.5 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background disabled:opacity-50">{readState === "uploading" ? "Uploading audio…" : submitting ? "Submitting…" : routingLockRemaining > 0 ? `Submit lock: ${routingLockRemaining}` : effectiveCooldown > 0 ? `Next submission available in ${formatCooldown(effectiveCooldown)}` : status?.isFull ? "Queue Full" : selectedRoute === "priority" ? "Submit & Continue to Payment" : "Submit Free"}</button>
            </div>
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

function warpLabel(state: TransmissionState): string {
  if (state === "priority_requested") return "PRIORITY SIGNAL REQUESTED";
  if (state === "signal") return "SIGNAL LOCKED";
  if (state === "received") return "SOURCE ARTIFACT CAPTURED";
  if (state === "encoded") return "AUDIO BODY DISASSEMBLED";
  if (state === "converting") return "DATA PACKET FORMED";
  if (state === "temporal") return "TEMPORAL ROUTE OPENED";
  if (state === "aligning") return "PACKET TRANSFER IN PROGRESS";
  if (state === "confirmed") return "SUBMISSION ACCEPTED";
  return "SIGNAL LOCKED";
}

function warpDescription(state: TransmissionState, data: WarpData | null): string {
  if (state === "priority_requested") return "Checkout started. Skip is not active yet.";
  if (state === "signal") return "Song details received. Preparing your submission.";
  if (state === "received") return "Source artwork is ready.";
  if (state === "encoded") return "Audio details are being prepared.";
  if (state === "converting") return "Artwork, title, and artist are loading into your queue card.";
  if (state === "temporal") return "Queue card is opening.";
  if (state === "aligning") return "Moving your song into the queue.";
  if (state === "confirmed") return `ROUTED TO ${data?.lane ?? "FREE_QUEUE"}. Your song is in the queue.`;
  return "BARCODE submission in progress.";
}

function PacketArtwork({ data }: { data: WarpData | null }) {
  if (data?.artworkUrl) return <img src={data.artworkUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-90 mix-blend-screen" />;
  return <div className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(circle,rgba(255,0,0,0.32),transparent_60%)] text-5xl text-accent">▦</div>;
}

function WaveformSweep({ offset = 0 }: { offset?: number }) {
  const heights = [18, 44, 28, 70, 34, 82, 30, 62, 46, 76, 32, 56, 40, 68, 24, 50];
  return <div className="wave-sweep absolute left-[-15%] right-[-15%] flex items-end gap-1 opacity-70" style={{ top: `${offset}%` }}>{heights.map((height, index) => <span key={`${offset}-${index}`} className="w-full bg-accent/55 shadow-[0_0_10px_rgba(255,0,0,0.45)]" style={{ height: `${height / 2}px` }} />)}</div>;
}

function WarpSequence({ state, data }: { state: TransmissionState; data: WarpData | null }) {
  const steps: TransmissionState[] = ["priority_requested", "signal", "received", "encoded", "converting", "temporal", "aligning", "confirmed"];
  const submissionProgressSteps: TransmissionState[] = steps.filter((step) => step !== "priority_requested");
  const activeProgressIndex = Math.max(0, submissionProgressSteps.indexOf(state));
  const isConfirmed = state === "confirmed";
  const isPriorityRequested = state === "priority_requested";
  const isSignal = state === "signal";
  const isArtifact = state === "received";
  const isDisassembling = state === "encoded";
  const isPacket = state === "converting";
  const isRoute = state === "temporal";
  const isTransfer = state === "aligning";
  const motionClass = isPriorityRequested || isSignal ? "signal-lock" : isRoute || isTransfer ? "barcode-warp power-instability" : "barcode-warp";
  const packetClass = isPriorityRequested || isSignal || isArtifact || isDisassembling ? "packet-forming" : isPacket || isRoute ? "packet-charging" : isTransfer ? "packet-transfer" : "packet-landed";
  const artClass = isPriorityRequested || isSignal ? "art-source" : isArtifact ? "art-captured" : isDisassembling || isPacket ? "art-disassemble" : "art-compressed";
  const landingClass = isConfirmed ? "landing-card landing-impact" : isTransfer ? "landing-card landing-armed" : "landing-card";
  const priorityTone = isPriorityRequested ? "border-[#ffaa00]/75 shadow-[0_0_120px_rgba(255,170,0,0.26)]" : "border-accent/70 shadow-[0_0_120px_rgba(255,0,0,0.34)]";
  const fragments = [
    ["ARTIST", data?.artist ?? "SIGNAL SOURCE"],
    ["TITLE", data?.title ?? "UNKNOWN TRACK"],
    ["TIKTOK", data?.tiktokHandle || "@pending"],
    ["SESSION", data?.sessionTitle ?? "BARCODE Radio"],
    ["LANE", data?.lane ?? "FREE_QUEUE"],
    ["SLOT", data?.submissionSlot ?? "FREE_QUEUE"],
    ["PRESSURE", data?.queueStatus ?? "SYNCING"],
    ["SOURCE", data?.sourceType ?? "SOURCE"],
  ];
  const codeFragments = ["101101", "ROUTE//FREE", "0xBRC", "ARTIFACT", "WAVEFORM", "0110", "LANE_SYNC", "QUEUE_GATE", "PACKET", "RED_SIG"];
  return (
    <div className={`fixed inset-0 z-[110000] overflow-hidden bg-black/92 text-foreground ${motionClass}`} role="status" aria-live="polite">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(255,0,0,0.28),transparent_28%),radial-gradient(circle_at_15%_20%,rgba(255,0,0,0.16),transparent_26%),radial-gradient(circle_at_85%_74%,rgba(255,255,255,0.08),transparent_22%)]" />
      <div className="destabilize absolute inset-[-4%] bg-[linear-gradient(115deg,transparent_0%,rgba(255,0,0,0.08)_42%,transparent_55%),linear-gradient(90deg,rgba(255,0,0,0.08),transparent_30%,rgba(255,0,0,0.06))] opacity-80" />
      <div className="overlay-scanlines absolute inset-0 opacity-35" />
      <div className="routing-lines absolute inset-0 opacity-80">
        <span className="route route-east" />
        <span className="route route-north" />
        <span className="route route-south" />
        <span className="route route-west" />
      </div>
      <div className="absolute inset-0 overflow-hidden">
        {codeFragments.map((fragment, index) => <span key={fragment} className="code-fragment font-mono text-[10px] uppercase tracking-[0.25em] text-accent/60" style={{ left: `${8 + (index * 9) % 82}%`, top: `${14 + (index * 13) % 68}%`, animationDelay: `${index * 130}ms` }}>{fragment}</span>)}
        <WaveformSweep offset={20} />
        <WaveformSweep offset={68} />
      </div>
      <div className="relative z-10 grid min-h-dvh place-items-center p-3 sm:p-6">
        <div className={`relative w-full max-w-6xl overflow-hidden border bg-background/88 p-4 ${priorityTone} backdrop-blur-md sm:p-5`}>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(255,0,0,0.14),transparent_34%)]" />
          <div className="relative z-10 space-y-4">
            <div className="warp-status-cluster">
              <div className="flex items-start justify-between gap-4">
                <div><p className="text-xs uppercase tracking-[0.4em] text-accent">BARCODE Network Submission</p><h2 className="mt-2 text-2xl font-bold text-foreground sm:text-3xl">{warpLabel(state)}</h2><p className="mt-1 text-xs text-muted">{warpDescription(state, data)}</p></div>
                <div className={`hidden border px-3 py-2 text-xs uppercase tracking-widest sm:block ${isPriorityRequested ? "border-[#ffaa00]/50 bg-[#ffaa00]/5 text-[#ffaa00]" : "border-accent/40 bg-accent/5 text-accent"}`}>{isPriorityRequested ? "CHECKOUT STARTED" : isConfirmed ? "TRANSMISSION RECEIVED" : "SUBMISSION READY"}</div>
              </div>
              <div className="mt-4 grid gap-1" style={{ gridTemplateColumns: `repeat(${submissionProgressSteps.length}, minmax(0, 1fr))` }}>
                {submissionProgressSteps.map((step, index) => <span key={step} className={`h-1.5 ${index <= activeProgressIndex ? isPriorityRequested ? "bg-[#ffaa00] shadow-[0_0_14px_rgba(255,170,0,0.75)]" : "bg-accent shadow-[0_0_14px_rgba(255,0,0,0.75)]" : "bg-border"}`} />)}
              </div>
              {isConfirmed && <div className="mt-1 h-1.5 w-full bg-accent shadow-[0_0_18px_rgba(255,0,0,0.72)]" aria-label="Transmission received" />}
            </div>
            <div className="grid gap-4 lg:grid-cols-[0.82fr_1.46fr_0.82fr]">
              <div className="space-y-1 font-mono text-[10px] uppercase leading-relaxed text-accent/80">{fragments.slice(0, 4).map(([key, value]) => <p key={key} className={isDisassembling ? "fragment-pulse" : ""}><span className="text-muted">{key}:</span> {value}</p>)}<div className="mt-4 grid grid-cols-10 gap-1">{"10110011100101101100".split("").map((bit, index) => <span key={`${bit}-${index}`} className="binary-bit text-[9px] text-accent/70" style={{ animationDelay: `${index * 70}ms` }}>{bit}</span>)}</div></div>
              <div className="relative min-h-[22rem] overflow-hidden border border-accent/50 bg-black/45 p-4">
                <div className="absolute inset-x-4 top-1/2 h-px bg-gradient-to-r from-transparent via-accent to-transparent" />
                <div className="absolute inset-y-8 left-1/2 w-px bg-accent/20" />
                <div className="packet-trail absolute left-[24%] top-1/2 z-10 h-1 w-3/5 -translate-y-1/2 bg-gradient-to-r from-accent/80 via-accent/30 to-transparent opacity-75" />
                <div className={`${artClass} relative z-20 mx-auto w-52 overflow-hidden border border-accent/60 bg-background shadow-[0_0_42px_rgba(255,0,0,0.45)]`}>
                  <div className="relative aspect-square overflow-hidden"><PacketArtwork data={data} /><div className="glitch-slice slice-one" /><div className="glitch-slice slice-two" /><div className="pixel-grid" /><div className="absolute inset-0 bg-[linear-gradient(transparent_50%,rgba(255,0,0,0.18)_50%)] bg-[length:100%_6px]" /></div>
                  <div className="p-3"><p className="truncate text-sm font-bold text-foreground">{data?.artist ?? "Submitted artist"}</p><p className="truncate text-xs text-muted">{data?.title ?? "Submitted track"}</p></div>
                </div>
                <div className={`${packetClass} absolute left-[12%] top-1/2 z-30 w-28 -translate-y-1/2 border border-accent bg-background/92 p-2 shadow-[0_0_34px_rgba(255,0,0,0.62)]`}><div className="relative h-12 overflow-hidden border border-accent/30"><PacketArtwork data={data} /><div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,0,0,0.18),transparent)]" /></div><p className="mt-1 font-mono text-[9px] uppercase tracking-widest text-accent">song packet</p></div>
                <div className="absolute bottom-4 left-4 right-4 grid grid-cols-16 items-end gap-1">{[18, 44, 28, 70, 34, 82, 30, 62, 46, 76, 32, 56, 40, 68, 24, 50].map((height, index) => <span key={index} className="wave-fragment bg-accent/70 shadow-[0_0_10px_rgba(255,0,0,0.45)]" style={{ height: `${height / 2}px`, animationDelay: `${index * 45}ms` }} />)}</div>
              </div>
              <div className="space-y-1 font-mono text-[10px] uppercase leading-relaxed text-accent/80">{fragments.slice(4).map(([key, value]) => <p key={key}><span className="text-muted">{key}:</span> {value}</p>)}<div className={`${landingClass} mt-4 border border-accent/50 bg-background/80 p-3`}><p className="text-xs uppercase tracking-widest text-accent">Destination card</p><div className="mt-2 grid grid-cols-[3rem_1fr] gap-2"><div className="relative h-12 overflow-hidden border border-accent/30"><PacketArtwork data={data} /></div><div><p className="truncate text-sm font-bold text-foreground">{data?.artist ?? "Submitted artist"}</p><p className="truncate text-xs text-muted">{data?.title ?? "Submitted track"}</p></div></div><p className="mt-2 text-[10px] text-accent">{isConfirmed ? `ROUTED TO ${data?.lane ?? "FREE_QUEUE"}` : isPriorityRequested ? "PAYMENT REQUIRED" : "AWAITING LOCK"}</p></div></div>
            </div>
          </div>
        </div>
      </div>
      <style jsx>{`@keyframes barcode-warp-shake{0%,100%{transform:translate3d(0,0,0)}18%{transform:translate3d(-2px,1px,0)}34%{transform:translate3d(2px,-1px,0)}56%{transform:translate3d(-1px,-2px,0)}72%{transform:translate3d(1px,2px,0)}}@keyframes background-instability{0%,100%{transform:translate3d(0,0,0) scale(1);filter:contrast(1)}35%{transform:translate3d(-1.5%,.8%,0) scale(1.025);filter:contrast(1.35)}65%{transform:translate3d(1%,-1%,0) scale(1.015);filter:contrast(1.15)}}@keyframes scanline-drift{from{background-position:0 0}to{background-position:0 48px}}@keyframes route-pulse{0%{transform:rotate(var(--route-rotation)) scaleX(.12);opacity:.1}40%{opacity:.85}100%{transform:rotate(var(--route-rotation)) scaleX(1);opacity:.2}}@keyframes code-float{0%{transform:translate3d(0,10px,0);opacity:0}25%,70%{opacity:.75}100%{transform:translate3d(16px,-24px,0);opacity:0}}@keyframes waveform-sweep{0%{transform:translate3d(-18%,0,0);opacity:0}30%{opacity:.75}100%{transform:translate3d(18%,0,0);opacity:0}}@keyframes packet-form{0%,100%{transform:translate3d(0,-50%,0) scale(.72);opacity:.45}50%{transform:translate3d(10vw,-50%,0) scale(.9);opacity:1}}@keyframes barcode-packet-route{0%{transform:translate3d(8vw,-50%,0) scale(.9);opacity:1}100%{transform:translate3d(58vw,-50%,0) scale(.48);opacity:.92}}@keyframes packet-land{0%{transform:translate3d(56vw,-50%,0) scale(.5);opacity:.9}100%{transform:translate3d(62vw,-50%,0) scale(.42);opacity:.18}}@keyframes art-prominent{0%,100%{transform:scale(1);filter:contrast(1.05)}50%{transform:scale(1.04);filter:contrast(1.25) saturate(1.12)}}@keyframes art-tear{0%,100%{clip-path:inset(0 0 0 0);filter:contrast(1.1);transform:translateZ(0)}28%{clip-path:polygon(0 0,100% 0,100% 17%,0 22%,0 37%,100% 31%,100% 100%,0 100%);filter:contrast(1.45) saturate(1.35) drop-shadow(8px 0 rgba(255,0,0,.55));transform:translate3d(-2px,0,0) skewX(-1.4deg)}62%{clip-path:polygon(0 0,100% 0,100% 34%,0 29%,0 66%,100% 58%,100% 100%,0 100%);filter:contrast(1.7) saturate(1.2) drop-shadow(-7px 0 rgba(255,0,0,.42));transform:translate3d(3px,-1px,0) scale(.96)}}@keyframes art-compress{0%{transform:scale(1);opacity:1}100%{transform:scale(.42) translate3d(46vw,-4vw,0);opacity:.28}}@keyframes landing-pulse{0%,55%{box-shadow:0 0 0 rgba(255,0,0,0);transform:scale(1)}72%{box-shadow:0 0 0 10px rgba(255,0,0,.13),0 0 46px rgba(255,0,0,.62);transform:scale(1.03)}100%{box-shadow:0 0 18px rgba(255,0,0,.28);transform:scale(1)}}@keyframes bit-pulse{0%,100%{opacity:.35}50%{opacity:1}}.overlay-scanlines{background:linear-gradient(transparent 50%,rgba(255,255,255,.085) 50%);background-size:100% 6px;animation:scanline-drift 2.6s linear infinite}.barcode-warp{animation:barcode-warp-shake 760ms steps(2,end) 5}.power-instability .destabilize{animation:background-instability 1.2s ease-in-out 4}.route{--route-rotation:0deg;position:absolute;left:50%;top:50%;height:1px;width:46vw;transform-origin:left center;background:linear-gradient(90deg,rgba(255,0,0,.9),rgba(255,0,0,.18),transparent);box-shadow:0 0 20px rgba(255,0,0,.42);animation:route-pulse 1.45s ease-out infinite}.route-north{--route-rotation:-26deg}.route-south{--route-rotation:22deg;animation-delay:120ms}.route-west{--route-rotation:180deg;animation-delay:260ms}.route-east{--route-rotation:0deg;animation-delay:60ms}.code-fragment{position:absolute;animation:code-float 2.4s ease-in-out infinite}.wave-sweep{animation:waveform-sweep 2.2s ease-in-out infinite}.wave-sweep:nth-of-type(2){animation-delay:.7s}.packet-trail{filter:blur(.4px);box-shadow:0 0 22px rgba(255,0,0,.5)}.packet-forming{animation:packet-form 1.15s ease-in-out infinite}.packet-charging{animation:packet-form 900ms ease-in-out infinite}.packet-transfer{animation:barcode-packet-route 1.4s cubic-bezier(.2,.72,.2,1) infinite alternate}.packet-landed{animation:packet-land 900ms ease-out forwards}.art-source{animation:art-prominent 1s ease-in-out infinite}.art-captured{animation:art-prominent 700ms ease-in-out infinite}.art-disassemble{animation:art-tear 620ms steps(2,end) infinite}.art-compressed{animation:art-compress 1.2s ease-in forwards}.glitch-slice{position:absolute;left:0;right:0;height:14%;border-top:1px solid rgba(255,0,0,.45);border-bottom:1px solid rgba(255,0,0,.22);background:rgba(255,0,0,.12);mix-blend-mode:screen}.slice-one{top:23%;transform:translateX(8px)}.slice-two{top:58%;transform:translateX(-10px)}.pixel-grid{position:absolute;inset:0;background:linear-gradient(90deg,rgba(255,0,0,.12) 1px,transparent 1px),linear-gradient(rgba(255,255,255,.08) 1px,transparent 1px);background-size:18px 18px;opacity:.45}.binary-bit,.fragment-pulse{animation:bit-pulse 850ms ease-in-out infinite}.wave-fragment{animation:art-tear 1.2s steps(2,end) infinite}.landing-armed{box-shadow:0 0 20px rgba(255,0,0,.28)}.landing-impact{animation:landing-pulse 1.1s ease-out forwards}@media (prefers-reduced-motion: reduce){.overlay-scanlines,.barcode-warp,.power-instability .destabilize,.route,.code-fragment,.wave-sweep,.packet-forming,.packet-charging,.packet-transfer,.packet-landed,.art-source,.art-captured,.art-disassemble,.art-compressed,.binary-bit,.fragment-pulse,.wave-fragment,.landing-impact{animation:none}.art-compressed{transform:scale(.65);opacity:.5}.packet-transfer{transform:translate3d(42vw,-50%,0) scale(.58)}}`}</style>
    </div>
  );
}
