import type { SiteAudioTrack } from "./site-audio-player";
import { castMediaUrl, type AudioOutputState, type SiteAudioOutput } from "@/lib/site-audio-output";

type Listener = () => void;
type MediaInfo = { contentId: string; contentType?: string; metadata?: object };
type MediaSession = { media: MediaInfo; idleReason?: string;
  play(request: null, success: Listener, error: Listener): void;
  pause(request: null, success: Listener, error: Listener): void;
};
type Session = { loadMedia(request: object): Promise<void>; getMediaSession(): MediaSession | null; getCastDevice(): { friendlyName: string } };
type CastContext = {
  setOptions(options: object): void; getCastState(): string;
  getCurrentSession(): Session | null; requestSession(): Promise<void>; endCurrentSession(stop: boolean): void;
  addEventListener(type: string, listener: Listener): void; removeEventListener(type: string, listener: Listener): void;
};
type RemotePlayer = { isConnected: boolean; isPaused: boolean; playerState: string; currentTime: number; duration: number; canSeek: boolean; volumeLevel: number; isMuted: boolean };
type RemoteController = {
  playOrPause(): void; seek(): void; setVolumeLevel(): void; muteOrUnmute(): void;
  addEventListener(type: string, listener: Listener): void; removeEventListener(type: string, listener: Listener): void;
};
type CastSdk = {
  framework: {
    CastContext: { getInstance(): CastContext };
    RemotePlayer: new () => RemotePlayer;
    RemotePlayerController: new (player: RemotePlayer) => RemoteController;
    RemotePlayerEventType: { ANY_CHANGE: string };
    CastContextEventType: { CAST_STATE_CHANGED: string; SESSION_STATE_CHANGED: string };
  };
  media: {
    DEFAULT_MEDIA_RECEIVER_APP_ID: string;
    MediaInfo: new (url: string, type: string) => MediaInfo;
    LoadRequest: new (info: MediaInfo) => { autoplay: boolean; currentTime: number };
  };
};
type CastWindow = Window & {
  cast?: { framework: CastSdk["framework"] };
  chrome?: { cast?: { media: CastSdk["media"]; AutoJoinPolicy: { PAGE_SCOPED: string } } };
  __onGCastApiAvailable?: (available: boolean) => void;
};
export type CastPicker = { available(): boolean; watch(listener: Listener): () => void; choose(): Promise<SiteAudioOutput> };
let initialized: Promise<CastPicker> | null = null;

export function prepareCast(): Promise<CastPicker> {
  if (initialized) return initialized;
  initialized = new Promise((resolve, reject) => {
    const target = window as CastWindow;
    const timer = window.setTimeout(() => reject(new Error("Cast unavailable")), 15000);
    const ready = (available: boolean) => {
      window.clearTimeout(timer);
      if (!available || !target.cast || !target.chrome?.cast) { reject(new Error("Cast unavailable")); return; }
      const sdk: CastSdk = { framework: target.cast.framework, media: target.chrome.cast.media };
      const context = sdk.framework.CastContext.getInstance();
      context.setOptions({ receiverApplicationId: sdk.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
        autoJoinPolicy: target.chrome.cast.AutoJoinPolicy.PAGE_SCOPED, resumeSavedSession: false });
      resolve({
        available: () => context.getCastState() !== "NO_DEVICES_AVAILABLE",
        watch: listener => {
          const event = sdk.framework.CastContextEventType.CAST_STATE_CHANGED;
          context.addEventListener(event, listener);
          return () => context.removeEventListener(event, listener);
        },
        choose: () => context.requestSession().then(() => {
          const session = context.getCurrentSession();
          if (!session) throw new Error("No Cast session");
          return new GoogleCastOutput(sdk, context, session);
        }),
      });
    };
    if (target.cast?.framework && target.chrome?.cast) { ready(true); return; }
    target.__onGCastApiAvailable = ready;
    const script = document.createElement("script");
    script.src = "https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1";
    script.async = true;
    script.onerror = () => { window.clearTimeout(timer); reject(new Error("Cast unavailable")); };
    document.head.appendChild(script);
  });
  return initialized;
}

class GoogleCastOutput implements SiteAudioOutput {
  readonly label: string;
  private player: RemotePlayer;
  private controller: RemoteController;
  private closed = false;
  private commandFailed = false;
  private listeners = new Set<Listener>();
  constructor(private sdk: CastSdk, private context: CastContext, private session: Session) {
    this.label = session.getCastDevice().friendlyName || "Chromecast";
    this.player = new sdk.framework.RemotePlayer();
    this.controller = new sdk.framework.RemotePlayerController(this.player);
  }
  subscribe(listener: Listener) {
    const event = this.sdk.framework.RemotePlayerEventType.ANY_CHANGE;
    this.listeners.add(listener);
    this.controller.addEventListener(event, listener);
    this.context.addEventListener(this.sdk.framework.CastContextEventType.SESSION_STATE_CHANGED, listener);
    return () => {
      this.listeners.delete(listener);
      this.controller.removeEventListener(event, listener);
      this.context.removeEventListener(this.sdk.framework.CastContextEventType.SESSION_STATE_CHANGED, listener);
    };
  }
  getState(): AudioOutputState {
    const media = this.session.getMediaSession();
    const state = this.player.playerState;
    return { connected: !this.closed && this.context.getCurrentSession() === this.session,
      contentId: media?.media.contentId ?? null,
      status: this.commandFailed ? "error" : state === "IDLE" && media?.idleReason === "FINISHED" ? "ended"
        : state === "IDLE" && media?.idleReason === "ERROR" ? "error"
        : state === "BUFFERING" ? "loading" : state === "PLAYING" ? "playing" : "paused",
      currentTime: this.player.currentTime || 0, duration: this.player.duration || 0,
      canSeek: this.player.canSeek, volume: this.player.volumeLevel, muted: this.player.isMuted };
  }
  async load(track: SiteAudioTrack, position: number) {
    this.commandFailed = false;
    const url = castMediaUrl(track, window.location.origin);
    const response = await fetch(url, { method: "HEAD", credentials: "omit", cache: "no-store", signal: AbortSignal.timeout(10000) });
    if (!response.ok || this.closed) throw new Error("Public recording unavailable");
    const mime = response.headers.get("content-type")?.split(";")[0] ?? "";
    if (!["audio/mpeg", "audio/mp3", "audio/wav", "audio/wave", "audio/x-wav"].includes(mime)) throw new Error("Unsupported recording");
    const media = new this.sdk.media.MediaInfo(url, mime);
    media.metadata = { metadataType: 3, title: track.title, artist: track.artist };
    const request = new this.sdk.media.LoadRequest(media);
    request.autoplay = false;
    request.currentTime = Math.max(0, position);
    await this.session.loadMedia(request);
  }
  private failCommand = () => { this.commandFailed = true; this.listeners.forEach(listener => listener()); };
  play() { if (!this.closed) this.session.getMediaSession()?.play(null, () => {}, this.failCommand); }
  pause() { if (!this.closed) this.session.getMediaSession()?.pause(null, () => {}, this.failCommand); }
  seek(position: number) { if (!this.closed && this.player.canSeek) { this.player.currentTime = position; this.controller.seek(); } }
  setVolume(volume: number) { if (!this.closed) { this.player.volumeLevel = volume; this.controller.setVolumeLevel(); } }
  setMuted(muted: boolean) { if (!this.closed && this.player.isMuted !== muted) this.controller.muteOrUnmute(); }
  disconnect() { if (!this.closed) { this.closed = true; if (this.context.getCurrentSession() === this.session) this.context.endCurrentSession(true); } }
}
