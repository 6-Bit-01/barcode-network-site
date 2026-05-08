/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps, react/jsx-no-comment-textnodes, @next/next/no-img-element */
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
        window.localStorage.setItem("barcode-radio-submit-artist", artist.trim());
        window.localStorage.setItem("barcode-radio-submit-tiktok", tiktokHandle.trim());
        window.localStorage.setItem("barcode-radio-submit-email", contactEmail.trim());
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
          submissionSlot: status ? `#${Math.min(status.activeCount + 1, status.capacity)}` : "FREE_TRANSMISSIONS",
          lane: submitted.lane === "priority" ? "PRIORITY_SIGNAL" : submitted.lane === "wheel" ? "WHEEL_CHOSEN" : "FREE_TRANSMISSIONS",
          artworkUrl: submitted.sourceArtworkUrl ?? null,
        });
        setTransmissionState("received");
        window.setTimeout(() => setTransmissionState("encoded"), 900);
        window.setTimeout(() => setTransmissionState("converting"), 2000);
        window.setTimeout(() => setTransmissionState("temporal"), 3300);
        window.setTimeout(() => setTransmissionState("aligning"), 4700);
        window.setTimeout(() => setTransmissionState("confirmed"), 6100);
        setPublicQueue((current) => [submitted, ...current.filter((entry) => entry.id !== submitted.id)]);
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
  const estimatedPosition = Math.min((status?.activeCount ?? publicQueue.length) + 1, status?.capacity ?? ((status?.activeCount ?? publicQueue.length) + 1));

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
        <div className="border border-accent/30 bg-accent/5 p-3 text-sm text-muted">If you submit now, this track enters Free Transmissions around position #{estimatedPosition} in the active broadcast queue.</div>
        <button disabled={submitting || effectiveCooldown > 0 || status?.isOpen === false || status?.isFull === true} className="w-full border border-accent px-4 py-3 text-sm uppercase tracking-widest text-accent hover:bg-accent hover:text-background disabled:opacity-50">{submitting ? "Submitting…" : effectiveCooldown > 0 ? `Next transmission available in ${formatCooldown(effectiveCooldown)}` : status?.isFull ? "Queue Full" : "Enter Free Transmissions"}</button>
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

function PacketArtwork({ data }: { data: WarpData | null }) {
  if (data?.artworkUrl) return <img src={data.artworkUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-80 mix-blend-screen" />;
  return <div className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(circle,rgba(255,0,0,0.32),transparent_60%)] text-5xl text-accent">▦</div>;
}

function WarpSequence({ state, data }: { state: TransmissionState; data: WarpData | null }) {
  const steps: TransmissionState[] = ["received", "encoded", "converting", "temporal", "aligning", "confirmed"];
  const activeIndex = Math.max(0, steps.indexOf(state));
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
    <div className="barcode-warp relative overflow-hidden border border-accent/60 bg-background/95 p-5 shadow-[0_0_100px_rgba(255,0,0,0.32)]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(255,0,0,0.26),transparent_28%),radial-gradient(circle_at_80%_70%,rgba(255,255,255,0.08),transparent_24%)]" />
      <div className="scanlines absolute inset-0 opacity-25" />
      <div className="absolute left-0 right-0 top-1/2 h-px bg-gradient-to-r from-transparent via-accent to-transparent" />
      <div className="relative z-10 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-xs uppercase tracking-[0.4em] text-accent">BARCODE Network Transmission</p><h2 className="mt-2 text-2xl font-bold text-foreground">{warpLabel(state)}</h2><p className="mt-1 text-xs text-muted">{state === "confirmed" ? "QUEUE INSERTION CONFIRMED" : "Artwork, metadata, and waveform fragments are compressing into a routed signal packet."}</p></div>
          <div className="hidden border border-accent/40 bg-accent/5 px-3 py-2 text-xs uppercase tracking-widest text-accent sm:block">TRANSMISSION LOCKED</div>
        </div>
        <div className="grid grid-cols-6 gap-1">{steps.map((step, index) => <span key={step} className={`h-1.5 ${index <= activeIndex ? "bg-accent shadow-[0_0_12px_rgba(255,0,0,0.7)]" : "bg-border"}`} />)}</div>
        <div className="grid gap-4 lg:grid-cols-[0.85fr_1.3fr_0.85fr]">
          <div className="space-y-1 font-mono text-[10px] uppercase leading-relaxed text-accent/80">{fragments.slice(0, 4).map(([key, value]) => <p key={key}><span className="text-muted">{key}:</span> {value}</p>)}<div className="mt-4 grid grid-cols-10 gap-1">{"10110011100101101100".split("").map((bit, index) => <span key={`${bit}-${index}`} className="text-[9px] text-accent/70">{bit}</span>)}</div></div>
          <div className="relative min-h-72 overflow-hidden border border-accent/50 bg-black/30 p-4">
            <div className="absolute inset-x-4 top-1/2 h-px bg-accent/50" />
            <div className="absolute inset-y-8 left-1/2 w-px bg-accent/20" />
            <div className="art-card relative z-10 mx-auto w-52 overflow-hidden border border-accent/60 bg-background shadow-[0_0_38px_rgba(255,0,0,0.4)]">
              <div className="relative aspect-square overflow-hidden"><PacketArtwork data={data} /><div className="absolute inset-0 bg-[linear-gradient(transparent_50%,rgba(255,0,0,0.16)_50%)] bg-[length:100%_6px]" /></div>
              <div className="p-3"><p className="truncate text-sm font-bold text-foreground">{data?.artist ?? "Submitted artist"}</p><p className="truncate text-xs text-muted">{data?.title ?? "Submitted track"}</p></div>
            </div>
            <div className="packet-transfer absolute left-5 top-1/2 z-20 w-28 -translate-y-1/2 border border-accent bg-background/90 p-2 shadow-[0_0_28px_rgba(255,0,0,0.55)]"><div className="relative h-12 overflow-hidden border border-accent/30"><PacketArtwork data={data} /></div><p className="mt-1 font-mono text-[9px] uppercase tracking-widest text-accent">signal packet</p></div>
            <div className="absolute bottom-4 left-4 right-4 grid grid-cols-16 items-end gap-1">{[18, 44, 28, 70, 34, 82, 30, 62, 46, 76, 32, 56, 40, 68, 24, 50].map((height, index) => <span key={index} className="wave-fragment bg-accent/70 shadow-[0_0_10px_rgba(255,0,0,0.45)]" style={{ height: `${height / 2}px` }} />)}</div>
          </div>
          <div className="space-y-1 font-mono text-[10px] uppercase leading-relaxed text-accent/80">{fragments.slice(4).map(([key, value]) => <p key={key}><span className="text-muted">{key}:</span> {value}</p>)}<div className="landing-card mt-4 border border-accent/50 bg-background/80 p-3"><p className="text-xs uppercase tracking-widest text-accent">Destination card</p><div className="mt-2 grid grid-cols-[3rem_1fr] gap-2"><div className="relative h-12 overflow-hidden border border-accent/30"><PacketArtwork data={data} /></div><div><p className="truncate text-sm font-bold text-foreground">{data?.artist ?? "Submitted artist"}</p><p className="truncate text-xs text-muted">{data?.title ?? "Submitted track"}</p></div></div><p className="mt-2 text-[10px] text-accent">SIGNAL INSERTED</p></div></div>
        </div>
      </div>
      <style jsx>{`@keyframes barcode-warp-shake{0%,100%{transform:translate3d(0,0,0)}18%{transform:translate3d(-2px,1px,0)}34%{transform:translate3d(2px,-1px,0)}56%{transform:translate3d(-1px,-2px,0)}72%{transform:translate3d(1px,2px,0)}}@keyframes barcode-packet-route{0%{transform:translate3d(0,-50%,0) scale(.85);opacity:0}18%{opacity:1}55%{transform:translate3d(46vw,-50%,0) scale(.72)}100%{transform:translate3d(62vw,-50%,0) scale(.5);opacity:.15}}@keyframes art-glitch{0%,100%{filter:none;transform:translateZ(0)}30%{filter:contrast(1.3) hue-rotate(-12deg);transform:skewX(-2deg)}60%{filter:contrast(1.6) saturate(1.2);transform:translate3d(2px,-1px,0)}}@keyframes landing-pulse{0%,70%{box-shadow:0 0 0 rgba(255,0,0,0)}88%{box-shadow:0 0 38px rgba(255,0,0,.55)}100%{box-shadow:0 0 14px rgba(255,0,0,.25)}}.scanlines{background:linear-gradient(transparent 50%,rgba(255,255,255,.08) 50%);background-size:100% 6px}.barcode-warp{animation:barcode-warp-shake 760ms steps(2,end) 5}.packet-transfer{animation:barcode-packet-route 6.8s cubic-bezier(.2,.72,.2,1) forwards}.art-card{animation:art-glitch 900ms steps(2,end) 7}.landing-card{animation:landing-pulse 7s ease-out forwards}.wave-fragment{animation:art-glitch 1.2s steps(2,end) 5}@media (prefers-reduced-motion: reduce){.barcode-warp,.packet-transfer,.art-card,.landing-card,.wave-fragment{animation:none}}`}</style>
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
                  <p className="text-xs text-muted">#{index + 1} · {entry.sourceType.toUpperCase()} · {entry.lane === "priority" ? "Priority" : entry.lane === "wheel" ? "Wheel" : "Free Transmissions"}</p>
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
