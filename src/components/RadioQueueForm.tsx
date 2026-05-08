/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps, @next/next/no-img-element */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatRuntime } from "@/lib/queue-types";
import type { QueuePublicSnapshot, QueuePublicStatus, QueuePublicTrack } from "@/lib/queue-types";

type Mode = "link" | "upload";
type ReadState = "idle" | "checking" | "reading" | "detected" | "pending";
type TransmissionState = "idle" | "signal" | "received" | "encoded" | "converting" | "temporal" | "aligning" | "confirmed";
type SubmitPhase = "resolved" | "complete";
type IntakeStep = "track" | "routing";

interface WarpData {
  artist: string;
  title: string;
  tiktokHandle: string;
  sourceType: string;
  fileName?: string | null;
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
  return `${status.pressure.toUpperCase()} / ${status.activeCount}/${status.capacity}`;
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

function publicTrackFromApi(track: { id: string; submittedArtistName?: string; submittedSongTitle?: string; artist?: string; title?: string; sourceType?: QueuePublicTrack["sourceType"]; lane?: QueuePublicTrack["lane"]; detectedArtistName?: string | null; detectedSongTitle?: string | null; detectedDurationSeconds?: number | null; durationIsEstimate?: boolean; sourceArtworkUrl?: string | null; publicSourceUrl?: string | null; tiktokHandle?: string | null }): QueuePublicTrack {
  return {
    id: track.id,
    submittedArtistName: track.submittedArtistName ?? track.artist ?? "Submitted artist",
    submittedSongTitle: track.submittedSongTitle ?? track.title ?? "Submitted track",
    detectedArtistName: track.detectedArtistName ?? null,
    detectedSongTitle: track.detectedSongTitle ?? null,
    sourceType: track.sourceType ?? "other",
    lane: track.lane ?? "regular",
    durationLabel: track.durationIsEstimate === false && track.detectedDurationSeconds ? formatRuntime(track.detectedDurationSeconds) : "estimated/pending",
    durationIsEstimate: track.durationIsEstimate ?? true,
    sourceArtworkUrl: track.sourceArtworkUrl ?? null,
    publicSourceUrl: track.publicSourceUrl ?? null,
    tiktokHandle: track.tiktokHandle ?? null,
  };
}

export function RadioQueueForm({ sessionId, onSubmitted, onCancel }: { sessionId?: string; onSubmitted?: (trackId?: string, phase?: SubmitPhase, targetId?: string) => void; onCancel?: () => void } = {}) {
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
  const [file, setFile] = useState<File | null>(null);
  const [detectedDuration, setDetectedDuration] = useState<number | null>(null);
  const [readState, setReadState] = useState<ReadState>("idle");
  const [submitting, setSubmitting] = useState(false);
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
    if (queued?.lane === "regular") return { track: queued, targetId: "free-transmissions-lane", laneLabel: "FREE_TRANSMISSIONS" };
    return { track: queued, targetId: "active-queue-panel", laneLabel: "ACTIVE_QUEUE" };
  }

  function wait(ms: number) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  async function onFileSelected(next: File | null) {
    setFile(next);
    setDetectedDuration(null);
    setReadState(next ? "reading" : "idle");
    if (!next) return;
    const duration = await readAudioDuration(next);
    setDetectedDuration(duration);
    setReadState(duration ? "detected" : "pending");
  }

  const checkCopy = useMemo(() => {
    if (readState === "checking") return "Checking track…";
    if (readState === "reading") return "Reading source…";
    if (readState === "detected" && detectedDuration) return `Duration detected: ${formatRuntime(detectedDuration)}`;
    if (readState === "pending") return "Duration pending — queue will buffer this track internally.";
    return "Paste a supported link or select an MP3/WAV to begin source checks.";
  }, [detectedDuration, readState]);

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
    setSubmitting(true);
    try {
      const body = new FormData();
      body.set("mode", mode);
      body.set("artist", artist.trim());
      body.set("title", title.trim());
      body.set("tiktokHandle", tiktokHandle.trim());
      body.set("collaboratorNames", collaboratorNames.trim());
      body.set("contactEmail", contactEmail.trim());
      body.set("submitterToken", submitterToken);
      if (sessionId) body.set("sessionId", sessionId);
      if (note.trim()) body.set("note", note.trim());
      if (detectedDuration) body.set("detectedDurationSeconds", String(detectedDuration));
      if (mode === "upload" && file) body.set("file", file);
      if (mode === "link") body.set("link", link.trim());

      const res = await fetch("/api/queue", { method: "POST", body });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (typeof payload.cooldownRemainingSeconds === "number") {
          setCooldownRemaining(payload.cooldownRemainingSeconds);
          if (submitterToken) window.localStorage.setItem(`barcode-radio-cooldown:${sessionId ?? "active"}:${submitterToken}`, String(Date.now() + payload.cooldownRemainingSeconds * 1000));
        }
        throw new Error(payload.cooldownRemainingSeconds ? `Next transmission available in ${formatCooldown(payload.cooldownRemainingSeconds)}` : payload.error || "Submission failed");
      }
      if (payload.track?.id) {
        const submitted = publicTrackFromApi(payload.track);
        window.localStorage.setItem("barcode-radio-submit-artist", artist.trim());
        window.localStorage.setItem("barcode-radio-submit-tiktok", tiktokHandle.trim());
        window.localStorage.setItem("barcode-radio-submit-email", contactEmail.trim());
        const nextCooldown = typeof payload.cooldownRemainingSeconds === "number" ? payload.cooldownRemainingSeconds : 300;
        setCooldownRemaining(nextCooldown);
        if (submitterToken) window.localStorage.setItem(`barcode-radio-cooldown:${sessionId ?? "active"}:${submitterToken}`, String(Date.now() + nextCooldown * 1000));
        const preSubmit = { nowPlayingWasEmpty: !nowPlaying, upNextWasEmpty: !upNext, activeCount: status?.activeCount ?? publicQueue.length };
        const baseWarpData: WarpData = {
          artist: artist.trim(),
          title: title.trim(),
          tiktokHandle: tiktokHandle.trim(),
          sourceType: mode === "upload" ? "UPLOAD" : (submitted.sourceType ?? "other").toUpperCase(),
          fileName: file?.name ?? null,
          durationLabel: detectedDuration ? formatRuntime(detectedDuration) : submitted.durationLabel,
          sessionTitle: session?.title ?? "BARCODE Radio",
          sessionDate: session?.showDate ?? "ACTIVE SESSION",
          queueStatus: status ? `${status.activeCount + 1}/${status.capacity}` : "SYNCING",
          submissionSlot: status ? `#${Math.min(status.activeCount + 1, status.capacity)}` : "FREE_TRANSMISSIONS",
          lane: submitted.lane === "priority" ? "PRIORITY_SIGNAL" : submitted.lane === "wheel" ? "WHEEL_CHOSEN" : "FREE_TRANSMISSIONS",
          artworkUrl: submitted.sourceArtworkUrl ?? null,
        };
        setWarpData(baseWarpData);
        setTransmissionState("signal");
        setPublicQueue((current) => [submitted, ...current.filter((entry) => entry.id !== submitted.id)]);
        await wait(1000);
        const refreshed = await loadStatus();
        let resolved = findSubmittedTrack(refreshed, submitted.id);
        if (resolved.targetId === "up-next-slot" && preSubmit.upNextWasEmpty) {
          resolved = { ...resolved, targetId: preSubmit.nowPlayingWasEmpty && preSubmit.activeCount === 0 ? "broadcast-queue-top" : "up-next-slot", laneLabel: "UP_NEXT" };
        }
        const resolvedTrack = resolved.track ?? submitted;
        setWarpData({
          ...baseWarpData,
          durationLabel: resolvedTrack.durationLabel,
          lane: resolved.laneLabel,
          artworkUrl: resolvedTrack.sourceArtworkUrl ?? baseWarpData.artworkUrl,
          queueStatus: refreshed ? `${refreshed.status.activeCount}/${refreshed.status.capacity}` : baseWarpData.queueStatus,
          submissionSlot: resolvedTrack.id === refreshed?.upNext?.id ? "UP_NEXT" : baseWarpData.submissionSlot,
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
      setTitle("");
      setLink("");
      setTikTokHandle(window.localStorage.getItem("barcode-radio-submit-tiktok") ?? tiktokHandle.trim());
      setCollaboratorNames("");
      setContactEmail(window.localStorage.getItem("barcode-radio-submit-email") ?? contactEmail.trim());
      setNote("");
      setFile(null);
      setDetectedDuration(null);
      setReadState("idle");
      setStep("track");
    } catch (err) {
      setTransmissionState("idle");
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
    if (mode === "upload" && !file) {
      setError("Select an MP3/WAV file before final routing.");
      return;
    }
    setError(null);
    setStep("routing");
  }

  if (transmissionState !== "idle") return <WarpSequence state={transmissionState} data={warpData} />;

  const effectiveCooldown = Math.max(cooldownRemaining, submitterStatus?.cooldownRemainingSeconds ?? 0);
  const estimatedPosition = Math.min((status?.activeCount ?? publicQueue.length) + 1, status?.capacity ?? ((status?.activeCount ?? publicQueue.length) + 1));

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid gap-2 border border-border bg-surface p-3 text-xs sm:grid-cols-4">
        <div><p className="text-[10px] uppercase tracking-widest text-muted">Session</p><p className="truncate text-foreground">{session?.title ?? "BARCODE Radio"}</p></div>
        <div><p className="text-[10px] uppercase tracking-widest text-muted">Queue</p><p className={status?.isOpen ? "text-accent" : "text-danger"}>{status?.isOpen ? "Open" : "Closed"}</p></div>
        <div><p className="text-[10px] uppercase tracking-widest text-muted">Active</p><p>{status ? `${status.activeCount}/${status.capacity}` : "—"}</p></div>
        <div><p className="text-[10px] uppercase tracking-widest text-muted">Pressure</p><p>{pressureLabel(status)}</p></div>
      </div>

      <div className="border border-border bg-surface p-3">
        <div className="mb-3 flex items-center justify-between gap-3 border-b border-border pb-2">
          <div>
            <p className="text-[10px] uppercase tracking-[0.35em] text-muted">{step === "track" ? "Step 1 / Track Signal" : "Step 2 / Final Routing"}</p>
            <h3 className="mt-1 text-lg font-bold text-foreground">{step === "track" ? "Route the track source" : "Confirm routing details"}</h3>
          </div>
          <p className="text-xs text-muted">{step === "track" ? "Signal data" : "Private admin info"}</p>
        </div>

        {error && <div className="mb-2 border border-danger/40 bg-danger/5 p-2 text-xs text-danger">{error}</div>}

        {step === "track" ? (
          <div className="space-y-3">
            <div className="grid gap-2.5 sm:grid-cols-2">
              <label className="space-y-1"><span className="text-xs uppercase tracking-widest text-muted">Artist</span><input value={artist} onChange={(e) => setArtist(e.target.value)} className="w-full bg-background border border-border px-3 py-2 text-sm" required /></label>
              <label className="space-y-1"><span className="text-xs uppercase tracking-widest text-muted">Song title</span><input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full bg-background border border-border px-3 py-2 text-sm" required /></label>
              <label className="space-y-1"><span className="text-xs uppercase tracking-widest text-muted">TikTok handle</span><input value={tiktokHandle} onChange={(e) => setTikTokHandle(e.target.value)} placeholder="@six.bit" className="w-full bg-background border border-border px-3 py-2 text-sm" required /></label>
              <label className="space-y-1"><span className="text-xs uppercase tracking-widest text-muted">Featured/collaborator artist(s)</span><input value={collaboratorNames} onChange={(e) => setCollaboratorNames(e.target.value)} placeholder="Optional" className="w-full bg-background border border-border px-3 py-2 text-sm" /></label>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <button type="button" onClick={() => setMode("link")} className={`border p-2.5 text-left ${mode === "link" ? "border-accent bg-accent/10" : "border-border"}`}><span className="text-xs uppercase tracking-widest text-muted">Submit a link</span><p className="mt-1 text-xs text-muted">YouTube, SoundCloud, Spotify, or URL.</p></button>
              <button type="button" onClick={() => setMode("upload")} className={`border p-2.5 text-left ${mode === "upload" ? "border-accent bg-accent/10" : "border-border"}`}><span className="text-xs uppercase tracking-widest text-muted">Upload MP3/WAV</span><p className="mt-1 text-xs text-muted">Audio files up to 100MB.</p></button>
            </div>
            {mode === "link" ? (
              <label className="space-y-1 block"><span className="text-xs uppercase tracking-widest text-muted">Track link</span><input type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://soundcloud.com/..." className="w-full bg-background border border-border px-3 py-2 text-sm" required /></label>
            ) : (
              <label className="space-y-1 block"><span className="text-xs uppercase tracking-widest text-muted">MP3/WAV file</span><input type="file" accept="audio/mpeg,audio/mp3,audio/wav,audio/wave,.mp3,.wav" onChange={(e) => onFileSelected(e.target.files?.[0] ?? null)} className="w-full bg-background border border-border px-3 py-2 text-sm" required /></label>
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
              <button type="button" onClick={onCancel} className="border border-border px-4 py-2 text-xs uppercase tracking-widest text-muted">Collapse Intake</button>
              <button type="button" onClick={continueToRouting} className="border border-accent px-5 py-2 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background">Continue</button>
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
              <label className="space-y-1"><span className="text-xs uppercase tracking-widest text-muted">Contact email</span><input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="Optional, private" className="w-full bg-background border border-border px-3 py-2 text-sm" /><span className="block text-[11px] text-muted">Private queue safety only.</span></label>
              <label className="space-y-1"><span className="text-xs uppercase tracking-widest text-muted">Optional transmission note</span><textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, 500))} rows={2} placeholder="Optional host note. No private contact info." className="w-full bg-background border border-border px-3 py-2 text-sm" /><span className="block text-[11px] text-muted">Queue control only; never public.</span></label>
            </div>
            <div className="grid gap-2 text-xs sm:grid-cols-2">
              {submitterStatus && <div className="border border-accent/40 bg-accent/5 p-2 text-muted"><p className="font-bold text-accent">Your transmissions: {submitterStatus.used} / {submitterStatus.limit}</p><p>Remaining: {submitterStatus.remaining}</p>{submitterStatus.cooldownRemainingSeconds > 0 && <p className="text-accent">Cooldown: {formatCooldown(submitterStatus.cooldownRemainingSeconds)}</p>}</div>}
              {effectiveCooldown > 0 && <div className="border border-accent/40 bg-accent/5 p-2 text-accent">Next transmission available in {formatCooldown(effectiveCooldown)}</div>}
              <div className="border border-border bg-background/40 p-2 text-muted">{checkCopy}</div>
              <div className="border border-accent/30 bg-accent/5 p-2 text-muted">Estimated placement: Free Transmissions position #{estimatedPosition}</div>
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
              <button type="button" onClick={() => setStep("track")} className="border border-border px-4 py-2 text-xs uppercase tracking-widest text-muted">Back</button>
              <button type="submit" onClick={() => { finalSubmitIntent.current = true; }} disabled={submitting || routingLockRemaining > 0 || effectiveCooldown > 0 || status?.isOpen === false || status?.isFull === true} className="border border-accent px-5 py-2.5 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background disabled:opacity-50">{submitting ? "Submitting…" : routingLockRemaining > 0 ? `Routing lock: ${routingLockRemaining}` : effectiveCooldown > 0 ? `Next transmission available in ${formatCooldown(effectiveCooldown)}` : status?.isFull ? "Queue Full" : "Enter Free Transmissions"}</button>
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
  if (state === "signal") return "SIGNAL LOCKED / TRANSMISSION RECEIVED";
  if (state === "received") return "TRANSMISSION RECEIVED";
  if (state === "encoded") return "AUDIO SIGNAL ENCODED";
  if (state === "converting") return "DATA PACKET FORMED";
  if (state === "temporal") return "TEMPORAL ROUTE OPEN";
  if (state === "aligning") return "QUEUE INSERTION LOCKED";
  if (state === "confirmed") return "SIGNAL STABILIZED";
  return "TRANSMISSION RECEIVED";
}

function PacketArtwork({ data }: { data: WarpData | null }) {
  if (data?.artworkUrl) return <img src={data.artworkUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-80 mix-blend-screen" />;
  return <div className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(circle,rgba(255,0,0,0.32),transparent_60%)] text-5xl text-accent">▦</div>;
}

function WarpSequence({ state, data }: { state: TransmissionState; data: WarpData | null }) {
  const steps: TransmissionState[] = ["received", "encoded", "converting", "temporal", "aligning", "confirmed"];
  const activeIndex = state === "signal" ? -1 : Math.max(0, steps.indexOf(state));
  const motionClass = state === "signal" ? "signal-lock" : "barcode-warp";
  const packetClass = state === "signal" ? "" : "packet-transfer";
  const artClass = state === "signal" ? "" : "art-card";
  const landingClass = state === "signal" ? "" : "landing-card";
  const fragments = [
    ["ARTIST", data?.artist ?? "SIGNAL SOURCE"],
    ["TITLE", data?.title ?? "UNKNOWN TRACK"],
    ["TIKTOK", data?.tiktokHandle || "@pending"],
    ["SESSION", data?.sessionTitle ?? "BARCODE Radio"],
    ["LANE", data?.lane ?? "FREE_TRANSMISSIONS"],
    ["SLOT", data?.submissionSlot ?? "FREE_TRANSMISSIONS"],
    ["PRESSURE", data?.queueStatus ?? "SYNCING"],
    ["SOURCE", data?.sourceType ?? "SOURCE"],
  ];
  return (
    <div className={`${motionClass} relative overflow-hidden border border-accent/60 bg-background/95 p-5 shadow-[0_0_100px_rgba(255,0,0,0.32)]`}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(255,0,0,0.26),transparent_28%),radial-gradient(circle_at_80%_70%,rgba(255,255,255,0.08),transparent_24%)]" />
      <div className="scanlines absolute inset-0 opacity-25" />
      <div className="absolute left-0 right-0 top-1/2 h-px bg-gradient-to-r from-transparent via-accent to-transparent" />
      <div className="relative z-10 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-xs uppercase tracking-[0.4em] text-accent">BARCODE Network Transmission</p><h2 className="mt-2 text-2xl font-bold text-foreground">{warpLabel(state)}</h2><p className="mt-1 text-xs text-muted">{state === "signal" ? "Saving complete. Refreshing the live queue snapshot before routing begins." : state === "confirmed" ? "QUEUE INSERTION CONFIRMED" : "Artwork, metadata, and waveform fragments are compressing into a routed signal packet."}</p></div>
          <div className="hidden border border-accent/40 bg-accent/5 px-3 py-2 text-xs uppercase tracking-widest text-accent sm:block">TRANSMISSION LOCKED</div>
        </div>
        <div className="grid grid-cols-6 gap-1">{steps.map((step, index) => <span key={step} className={`h-1.5 ${index <= activeIndex ? "bg-accent shadow-[0_0_12px_rgba(255,0,0,0.7)]" : "bg-border"}`} />)}</div>
        <div className="grid gap-4 lg:grid-cols-[0.85fr_1.3fr_0.85fr]">
          <div className="space-y-1 font-mono text-[10px] uppercase leading-relaxed text-accent/80">{fragments.slice(0, 4).map(([key, value]) => <p key={key}><span className="text-muted">{key}:</span> {value}</p>)}<div className="mt-4 grid grid-cols-10 gap-1">{"10110011100101101100".split("").map((bit, index) => <span key={`${bit}-${index}`} className="text-[9px] text-accent/70">{bit}</span>)}</div></div>
          <div className="relative min-h-72 overflow-hidden border border-accent/50 bg-black/30 p-4">
            <div className="absolute inset-x-4 top-1/2 h-px bg-accent/50" />
            <div className="absolute inset-y-8 left-1/2 w-px bg-accent/20" />
            <div className={`${artClass} relative z-10 mx-auto w-52 overflow-hidden border border-accent/60 bg-background shadow-[0_0_38px_rgba(255,0,0,0.4)]`}>
              <div className="relative aspect-square overflow-hidden"><PacketArtwork data={data} /><div className="absolute inset-0 bg-[linear-gradient(transparent_50%,rgba(255,0,0,0.16)_50%)] bg-[length:100%_6px]" /></div>
              <div className="p-3"><p className="truncate text-sm font-bold text-foreground">{data?.artist ?? "Submitted artist"}</p><p className="truncate text-xs text-muted">{data?.title ?? "Submitted track"}</p></div>
            </div>
            <div className={`${packetClass} absolute left-5 top-1/2 z-20 w-28 -translate-y-1/2 border border-accent bg-background/90 p-2 shadow-[0_0_28px_rgba(255,0,0,0.55)]`}><div className="relative h-12 overflow-hidden border border-accent/30"><PacketArtwork data={data} /></div><p className="mt-1 font-mono text-[9px] uppercase tracking-widest text-accent">signal packet</p></div>
            <div className="absolute bottom-4 left-4 right-4 grid grid-cols-16 items-end gap-1">{[18, 44, 28, 70, 34, 82, 30, 62, 46, 76, 32, 56, 40, 68, 24, 50].map((height, index) => <span key={index} className="wave-fragment bg-accent/70 shadow-[0_0_10px_rgba(255,0,0,0.45)]" style={{ height: `${height / 2}px` }} />)}</div>
          </div>
          <div className="space-y-1 font-mono text-[10px] uppercase leading-relaxed text-accent/80">{fragments.slice(4).map(([key, value]) => <p key={key}><span className="text-muted">{key}:</span> {value}</p>)}<div className={`${landingClass} mt-4 border border-accent/50 bg-background/80 p-3`}><p className="text-xs uppercase tracking-widest text-accent">Destination card</p><div className="mt-2 grid grid-cols-[3rem_1fr] gap-2"><div className="relative h-12 overflow-hidden border border-accent/30"><PacketArtwork data={data} /></div><div><p className="truncate text-sm font-bold text-foreground">{data?.artist ?? "Submitted artist"}</p><p className="truncate text-xs text-muted">{data?.title ?? "Submitted track"}</p></div></div><p className="mt-2 text-[10px] text-accent">SIGNAL INSERTED</p></div></div>
        </div>
      </div>
      <style jsx>{`@keyframes barcode-warp-shake{0%,100%{transform:translate3d(0,0,0)}18%{transform:translate3d(-2px,1px,0)}34%{transform:translate3d(2px,-1px,0)}56%{transform:translate3d(-1px,-2px,0)}72%{transform:translate3d(1px,2px,0)}}@keyframes barcode-packet-route{0%{transform:translate3d(0,-50%,0) scale(.85);opacity:0}18%{opacity:1}55%{transform:translate3d(46vw,-50%,0) scale(.72)}100%{transform:translate3d(62vw,-50%,0) scale(.5);opacity:.15}}@keyframes art-glitch{0%,100%{filter:none;transform:translateZ(0)}30%{filter:contrast(1.3) hue-rotate(-12deg);transform:skewX(-2deg)}60%{filter:contrast(1.6) saturate(1.2);transform:translate3d(2px,-1px,0)}}@keyframes landing-pulse{0%,70%{box-shadow:0 0 0 rgba(255,0,0,0)}88%{box-shadow:0 0 38px rgba(255,0,0,.55)}100%{box-shadow:0 0 14px rgba(255,0,0,.25)}}.scanlines{background:linear-gradient(transparent 50%,rgba(255,255,255,.08) 50%);background-size:100% 6px}.barcode-warp{animation:barcode-warp-shake 760ms steps(2,end) 5}.packet-transfer{animation:barcode-packet-route 6.8s cubic-bezier(.2,.72,.2,1) forwards}.art-card{animation:art-glitch 900ms steps(2,end) 7}.landing-card{animation:landing-pulse 7s ease-out forwards}.wave-fragment{animation:art-glitch 1.2s steps(2,end) 5}@media (prefers-reduced-motion: reduce){.barcode-warp,.packet-transfer,.art-card,.landing-card,.wave-fragment{animation:none}}`}</style>
    </div>
  );
}
