/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps, react/jsx-no-comment-textnodes */
"use client";

import { useEffect, useMemo, useState } from "react";
import { formatRuntime } from "@/lib/queue-types";
import type { QueuePublicSnapshot, QueuePublicStatus, QueuePublicTrack } from "@/lib/queue-types";

type Mode = "link" | "upload";
type ReadState = "idle" | "checking" | "reading" | "detected" | "pending";
type TransmissionState = "idle" | "received" | "encoded" | "converting" | "temporal" | "aligning" | "confirmed";

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

function publicTrackFromApi(track: { id: string; submittedArtistName?: string; submittedSongTitle?: string; artist?: string; title?: string; sourceType?: QueuePublicTrack["sourceType"]; lane?: QueuePublicTrack["lane"]; detectedArtistName?: string | null; detectedSongTitle?: string | null; detectedDurationSeconds?: number | null; durationIsEstimate?: boolean; sourceArtworkUrl?: string | null; tiktokHandle?: string | null }): QueuePublicTrack {
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
    tiktokHandle: track.tiktokHandle ?? null,
  };
}

export function RadioQueueForm({ sessionId, onSubmitted }: { sessionId?: string; onSubmitted?: (trackId?: string) => void } = {}) {
  const [status, setStatus] = useState<QueuePublicStatus | null>(null);
  const [publicQueue, setPublicQueue] = useState<QueuePublicTrack[]>([]);
  const [session, setSession] = useState<QueuePublicSnapshot["session"] | null>(null);
  const [submitterStatus, setSubmitterStatus] = useState<QueuePublicSnapshot["submitterStatus"] | null>(null);
  const [lastSubmittedTrackId, setLastSubmittedTrackId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("link");
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
    }
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
      return;
    }
    const next = `br_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    window.localStorage.setItem(key, next);
    setSubmitterToken(next);
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
        setLastSubmittedTrackId(submitted.id);
        const nextCooldown = typeof payload.cooldownRemainingSeconds === "number" ? payload.cooldownRemainingSeconds : 300;
        setCooldownRemaining(nextCooldown);
        if (submitterToken) window.localStorage.setItem(`barcode-radio-cooldown:${sessionId ?? "active"}:${submitterToken}`, String(Date.now() + nextCooldown * 1000));
        setWarpData({
          artist: artist.trim(),
          title: title.trim(),
          tiktokHandle: tiktokHandle.trim(),
          sourceType: mode === "upload" ? "UPLOAD" : (submitted.sourceType ?? "other").toUpperCase(),
          fileName: file?.name ?? null,
          durationLabel: detectedDuration ? formatRuntime(detectedDuration) : submitted.durationLabel,
          sessionTitle: session?.title ?? "BARCODE Radio",
          sessionDate: session?.showDate ?? "ACTIVE SESSION",
          queueStatus: status ? `${status.activeCount + 1}/${status.capacity}` : "SYNCING",
          submissionSlot: status ? `#${Math.min(status.activeCount + 1, status.capacity)}` : "INCOMING_TRANSMISSIONS",
          lane: submitted.lane === "priority" ? "PRIORITY_SIGNAL" : submitted.lane === "wheel" ? "WHEEL_CHOSEN" : "REGULAR_QUEUE",
        });
        setTransmissionState("received");
        window.setTimeout(() => setTransmissionState("encoded"), 900);
        window.setTimeout(() => setTransmissionState("converting"), 2000);
        window.setTimeout(() => setTransmissionState("temporal"), 3300);
        window.setTimeout(() => setTransmissionState("aligning"), 4700);
        window.setTimeout(() => setTransmissionState("confirmed"), 6100);
        setPublicQueue((current) => [submitted, ...current.filter((entry) => entry.id !== submitted.id)]);
      }
      setArtist("");
      setTitle("");
      setLink("");
      setTikTokHandle("");
      setCollaboratorNames("");
      setContactEmail("");
      setNote("");
      setFile(null);
      setDetectedDuration(null);
      setReadState("idle");
      await loadStatus();
      window.setTimeout(() => onSubmitted?.(payload.track?.id), 7200);
    } catch (err) {
      setTransmissionState("idle");
      setError(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (transmissionState !== "idle") return <WarpSequence state={transmissionState} data={warpData} />;

  const effectiveCooldown = Math.max(cooldownRemaining, submitterStatus?.cooldownRemainingSeconds ?? 0);

  return (
    <div className="grid gap-4 lg:grid-cols-[0.72fr_1fr]">
      <aside className="border border-border bg-surface p-4 space-y-3">
        <div><p className="text-xs uppercase tracking-[0.35em] text-muted">// Current Broadcast Queue</p><p className="text-sm font-bold text-foreground mt-2">{session?.title ?? "BARCODE Radio"}</p><p className="text-xs text-muted">{session?.showDate ?? "Active show date syncing"}</p></div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="border border-border p-3"><p className="text-xs text-muted">Queue</p><p className={status?.isOpen ? "text-accent" : "text-danger"}>{status?.isOpen ? "Open" : "Closed"}</p></div>
          <div className="border border-border p-3"><p className="text-xs text-muted">Active transmissions</p><p>{status?.activeCount ?? "—"}</p><p className="mt-1 text-[10px] text-muted">Includes Now Playing + Up Next + waiting lanes.</p></div>
          <div className="border border-border p-3"><p className="text-xs text-muted">Estimated active runtime</p><p>{status ? formatRuntime(status.estimatedRuntimeSeconds) : "—"}</p></div>
          <div className="border border-border p-3"><p className="text-xs text-muted">Queue pressure</p><p>{pressureLabel(status)}</p></div>
        </div>
        <PublicQueuePreview queue={publicQueue} lastSubmittedTrackId={lastSubmittedTrackId} />
      </aside>

      <form onSubmit={submit} className="border border-border bg-surface p-4 space-y-4">
        {error && <div className="border border-danger/40 bg-danger/5 p-4 text-danger text-sm">{error}</div>}
        {effectiveCooldown > 0 && <div className="border border-accent/40 bg-accent/5 p-3 text-sm text-accent">Next transmission available in {formatCooldown(effectiveCooldown)}</div>}
        {submitterStatus && <div className="border border-accent/40 bg-accent/5 p-3 text-sm text-muted"><p className="font-bold text-accent">Your transmissions this session: {submitterStatus.used} / {submitterStatus.limit}</p><p className="mt-1">Remaining slots: {submitterStatus.remaining}</p>{submitterStatus.submitted.length > 0 && <p className="mt-1">Already sent: {submitterStatus.submitted.map((entry) => entry.submittedSongTitle).join(", ")}</p>}{submitterStatus.cooldownRemainingSeconds > 0 && <p className="mt-1 text-accent">Next transmission available in {formatCooldown(submitterStatus.cooldownRemainingSeconds)}</p>}</div>}

        <div className="grid gap-3 sm:grid-cols-2">
          <button type="button" onClick={() => setMode("link")} className={`border p-4 text-left ${mode === "link" ? "border-accent bg-accent/10" : "border-border"}`}><span className="text-xs uppercase tracking-widest text-muted">Submit a link</span><p className="text-sm mt-1">YouTube, SoundCloud, Spotify, or other URL.</p></button>
          <button type="button" onClick={() => setMode("upload")} className={`border p-4 text-left ${mode === "upload" ? "border-accent bg-accent/10" : "border-border"}`}><span className="text-xs uppercase tracking-widest text-muted">Upload MP3/WAV</span><p className="text-sm mt-1">Audio files up to 100MB.</p></button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2"><span className="text-xs uppercase tracking-widest text-muted">Artist</span><input value={artist} onChange={(e) => setArtist(e.target.value)} className="w-full bg-background border border-border px-3 py-2.5 text-sm" required /></label>
          <label className="space-y-2"><span className="text-xs uppercase tracking-widest text-muted">Title</span><input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full bg-background border border-border px-3 py-2.5 text-sm" required /></label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2"><span className="text-xs uppercase tracking-widest text-muted">TikTok handle</span><input value={tiktokHandle} onChange={(e) => setTikTokHandle(e.target.value)} placeholder="@six.bit" className="w-full bg-background border border-border px-3 py-2.5 text-sm" required /></label>
          <label className="space-y-2"><span className="text-xs uppercase tracking-widest text-muted">Featured/collaborator artist(s)</span><input value={collaboratorNames} onChange={(e) => setCollaboratorNames(e.target.value)} placeholder="Optional" className="w-full bg-background border border-border px-3 py-2.5 text-sm" /></label>
        </div>
        <label className="space-y-2 block"><span className="text-xs uppercase tracking-widest text-muted">Contact email</span><input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="Optional, private" className="w-full bg-background border border-border px-3 py-2.5 text-sm" /><span className="block text-[11px] text-muted">Private. Used only for queue safety and session limits.</span></label>

        {mode === "link" ? (
          <label className="space-y-2 block"><span className="text-xs uppercase tracking-widest text-muted">Track link</span><input type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://soundcloud.com/..." className="w-full bg-background border border-border px-3 py-2.5 text-sm" required /></label>
        ) : (
          <label className="space-y-2 block"><span className="text-xs uppercase tracking-widest text-muted">MP3/WAV file</span><input type="file" accept="audio/mpeg,audio/mp3,audio/wav,audio/wave,.mp3,.wav" onChange={(e) => onFileSelected(e.target.files?.[0] ?? null)} className="w-full bg-background border border-border px-3 py-2.5 text-sm" required /></label>
        )}

        <label className="space-y-2 block"><span className="text-xs uppercase tracking-widest text-muted">Optional transmission note</span><textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, 500))} rows={2} placeholder="Any clean context the host should know. Do not include private contact info." className="w-full bg-background border border-border px-3 py-2.5 text-sm" /><span className="block text-[11px] text-muted">Visible to queue control only. Public queue preview never shows notes.</span></label>

        <div className="border border-border bg-background/40 p-3 text-sm text-muted">{checkCopy}</div>
        <button disabled={submitting || effectiveCooldown > 0 || status?.isOpen === false || status?.isFull === true} className="w-full border border-accent px-4 py-3 text-sm uppercase tracking-widest text-accent hover:bg-accent hover:text-background disabled:opacity-50">{submitting ? "Submitting…" : effectiveCooldown > 0 ? `Next transmission available in ${formatCooldown(effectiveCooldown)}` : status?.isFull ? "Queue Full" : "Enter Regular Queue"}</button>
      </form>
    </div>
  );
}

function formatCooldown(seconds: number): string {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const rest = Math.max(0, seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${rest}`;
}

function warpLabel(state: TransmissionState): string {
  if (state === "received") return "TRANSMISSION RECEIVED";
  if (state === "encoded") return "AUDIO SIGNAL ENCODED";
  if (state === "converting") return "DATA PACKET FORMED";
  if (state === "temporal") return "TEMPORAL ROUTE OPEN";
  if (state === "aligning") return "QUEUE INSERTION LOCKED";
  if (state === "confirmed") return "SIGNAL STABILIZED";
  return "TRANSMISSION RECEIVED";
}

function WarpSequence({ state, data }: { state: TransmissionState; data: WarpData | null }) {
  const steps: TransmissionState[] = ["received", "encoded", "converting", "temporal", "aligning", "confirmed"];
  const activeIndex = Math.max(0, steps.indexOf(state));
  const fragments = [
    ["ARTIST_ID", data?.artist ?? "SIGNAL SOURCE"],
    ["TRACK_TITLE", data?.title ?? "UNKNOWN TRACK"],
    ["TIKTOK_SIGNAL", data?.tiktokHandle || "@pending"],
    ["SOURCE_TYPE", data?.sourceType ?? "SOURCE"],
    ["FILE_NAME", data?.fileName ?? "LINK_PACKET"],
    ["DURATION_LOCK", data?.durationLabel ?? "ESTIMATED/PENDING"],
    ["SESSION", data?.sessionTitle ?? "BARCODE Radio"],
    ["SESSION_DATE", data?.sessionDate ?? "ACTIVE"],
    ["QUEUE_LANE", data?.lane ?? "INCOMING_TRANSMISSIONS"],
    ["SUBMISSION_SLOT", data?.submissionSlot ?? "INCOMING_TRANSMISSIONS"],
    ["QUEUE_PRESSURE", data?.queueStatus ?? "SYNCING"],
  ];
  return (
    <div className="barcode-warp relative overflow-hidden border border-accent/50 bg-background/95 p-5 shadow-[0_0_80px_rgba(255,0,0,0.24)]">
      <div className="absolute inset-0 opacity-25 [background:radial-gradient(circle_at_20%_30%,rgba(255,0,0,0.24),transparent_24%),linear-gradient(90deg,transparent,rgba(255,0,0,0.16),transparent)] animate-pulse motion-reduce:animate-none" />
      <div className="absolute left-6 right-6 top-1/2 h-px bg-gradient-to-r from-transparent via-accent/70 to-transparent" />
      <div className="absolute left-6 right-6 top-[56%] h-px bg-gradient-to-r from-transparent via-accent/30 to-transparent" />
      <div className="relative z-10 space-y-5">
        <div>
          <p className="text-xs uppercase tracking-[0.4em] text-accent">BARCODE Network Transmission</p>
          <h2 className="mt-2 text-2xl font-bold text-foreground">{warpLabel(state)}</h2>
          <p className="mt-2 text-xs text-muted">{state === "confirmed" ? "Destination card energized. Returning to broadcast view." : "Audio fragments are encoding into a routed data packet."}</p>
        </div>
        <div className="grid grid-cols-6 gap-1">{steps.map((step, index) => <span key={step} className={`h-1.5 ${index <= activeIndex ? "bg-accent shadow-[0_0_12px_rgba(255,0,0,0.7)]" : "bg-border"}`} />)}</div>
        <div className="grid gap-4 lg:grid-cols-[1fr_12rem_1fr]">
          <div className="space-y-1 font-mono text-[10px] uppercase leading-relaxed text-accent/80">{fragments.slice(0, 6).map(([key, value]) => <p key={key}><span className="text-muted">{key}:</span> {value}</p>)}</div>
          <div className="relative min-h-44 overflow-hidden border border-accent/40 bg-accent/5 p-3">
            <div className="absolute inset-3 border border-accent/20" />
            <div className="absolute left-3 right-3 top-1/2 h-px bg-accent/40" />
            <div className="packet-transfer absolute left-4 top-1/2 w-24 -translate-y-1/2 border border-accent bg-background/90 p-2 shadow-[0_0_22px_rgba(255,0,0,0.45)]">
              <p className="font-mono text-[9px] uppercase tracking-widest text-accent">packet</p>
              <p className="mt-1 truncate text-xs font-bold text-foreground">{data?.title ?? "TRACK"}</p>
              <p className="truncate text-[10px] text-muted">{data?.artist ?? "SOURCE"}</p>
              <div className="mt-2 grid grid-cols-8 gap-0.5">{"1011010010110110".split("").map((bit, index) => <span key={`${bit}-${index}`} className="text-[8px] leading-none text-accent/80">{bit}</span>)}</div>
            </div>
            <div className="absolute bottom-3 left-3 right-3 grid grid-cols-12 items-end gap-1">{[16, 42, 24, 68, 34, 78, 28, 58, 44, 72, 30, 52].map((height, index) => <span key={index} className="bg-accent/70 shadow-[0_0_10px_rgba(255,0,0,0.45)]" style={{ height: `${height / 2}px` }} />)}</div>
          </div>
          <div className="space-y-1 font-mono text-[10px] uppercase leading-relaxed text-accent/80">{fragments.slice(6).map(([key, value]) => <p key={key}><span className="text-muted">{key}:</span> {value}</p>)}</div>
        </div>
        <div className="border border-accent/40 bg-background/70 p-3">
          <p className="text-xs uppercase tracking-widest text-accent">Destination queue card</p>
          <p className="mt-1 text-sm font-bold text-foreground">{data?.artist ?? "Submitted artist"} — {data?.title ?? "Submitted track"}</p>
          <p className="mt-1 text-xs text-muted">{data?.lane ?? "REGULAR_QUEUE"} · {data?.submissionSlot ?? "incoming"} · {data?.queueStatus ?? "syncing"}</p>
        </div>
        <div className="border border-border bg-background/50 p-3"><p className="text-xs uppercase tracking-widest text-muted">Priority Signal Upgrade</p><p className="mt-1 text-xs text-muted">Move this track into the Priority Lane when priority access is active.</p><button type="button" disabled className="mt-3 border border-border px-3 py-2 text-xs uppercase tracking-widest text-muted opacity-60">Coming soon</button></div>
      </div>
      <style jsx>{`@keyframes barcode-warp-shake{0%,100%{transform:translate3d(0,0,0)}18%{transform:translate3d(-2px,1px,0)}34%{transform:translate3d(2px,-1px,0)}56%{transform:translate3d(-1px,-2px,0)}72%{transform:translate3d(1px,2px,0)}}@keyframes barcode-packet-route{0%{transform:translate3d(0,-50%,0) scale(1);opacity:.35}22%{transform:translate3d(18px,-50%,0) scale(.92);opacity:1}58%{transform:translate3d(72px,-50%,0) scale(.78);opacity:.95}100%{transform:translate3d(124px,-50%,0) scale(.62);opacity:.65}}.barcode-warp{animation:barcode-warp-shake 760ms steps(2,end) 5}.packet-transfer{animation:barcode-packet-route 6.6s cubic-bezier(.2,.72,.2,1) forwards}@media (prefers-reduced-motion: reduce){.barcode-warp,.packet-transfer{animation:none}}`}</style>
    </div>
  );
}

function PublicQueuePreview({ queue, lastSubmittedTrackId }: { queue: QueuePublicTrack[]; lastSubmittedTrackId: string | null }) {
  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs uppercase tracking-[0.25em] text-muted">Public queue preview</p>
        <p className="text-[11px] text-muted mt-1">Artist/title and source type only. Removed tracks, notes, and control metadata stay private.</p>
      </div>
      <div className="space-y-2">
        {queue.length === 0 ? <p className="border border-border/60 p-3 text-sm text-muted">No active transmissions are visible yet.</p> : queue.slice(0, 4).map((entry, index) => {
          const highlighted = entry.id === lastSubmittedTrackId;
          return (
            <div key={entry.id} className={`border p-3 transition-all ${highlighted ? "border-accent bg-accent/10 animate-pulse" : "border-border bg-background/30"}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-muted">#{index + 1} · {entry.sourceType.toUpperCase()} · {entry.lane === "priority" ? "Priority" : entry.lane === "wheel" ? "Wheel" : "Regular"}</p>
                  <p className="text-sm font-bold text-foreground">{entry.submittedArtistName} — {entry.submittedSongTitle}</p>
                  {(entry.detectedArtistName || entry.detectedSongTitle) && <p className="text-[11px] text-muted">Detected: {entry.detectedArtistName || "Unknown artist"} — {entry.detectedSongTitle || "Unknown title"}</p>}
                </div>
                <span className="shrink-0 text-[11px] text-muted">{entry.durationLabel}</span>
              </div>
              {highlighted && <p className="text-[11px] text-accent mt-2">Transmission received — warp hook ready.</p>}
            </div>
          );
        })}
        {queue.length > 4 && <p className="border border-border/60 p-2 text-[11px] uppercase tracking-widest text-muted">+{queue.length - 4} more signals visible after intake collapse</p>}
      </div>
    </div>
  );
}
