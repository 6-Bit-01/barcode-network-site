"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { publicAudioAllowed, SiteAudioController } from "@/lib/site-audio-player";
import { SiteAudioDock } from "@/components/SiteAudioDock";
import { encodePlaylist, PLAYLIST_STORAGE_KEY } from "@/lib/site-audio-playlist";

const AudioContext = createContext<SiteAudioController | null>(null);

export function useSiteAudio() {
  const controller = useContext(AudioContext);
  if (!controller) throw new Error("Site audio controls need SiteAudioProvider.");
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getServerSnapshot);
  return { controller, ...snapshot };
}

export function SiteAudioProvider({ children }: { children: ReactNode }) {
  const [controller] = useState(() => new SiteAudioController());
  const element = useRef<HTMLAudioElement | null>(null);
  const allowed = publicAudioAllowed(usePathname());
  const attach = useCallback((audio: HTMLAudioElement | null) => { element.current = audio; controller.attach(audio); }, [controller]);
  useEffect(() => { controller.setEnabled(allowed); }, [controller, allowed]);
  useEffect(() => {
    const stopOutput = () => controller.disconnectOutput();
    window.addEventListener("pagehide", stopOutput);
    return () => { window.removeEventListener("pagehide", stopOutput); controller.disconnectOutput(); };
  }, [controller]);

  useEffect(() => {
    try { controller.restorePlaylist(window.localStorage.getItem(PLAYLIST_STORAGE_KEY)); }
    catch { controller.setPlaylistNotice("Browser storage is unavailable. This playlist will last for this visit."); }
    let saved = encodePlaylist(controller.getSnapshot().playlist);
    const unsubscribe = controller.subscribe(() => {
      const next = encodePlaylist(controller.getSnapshot().playlist);
      if (next === saved) return;
      saved = next;
      try { window.localStorage.setItem(PLAYLIST_STORAGE_KEY, next); }
      catch { controller.setPlaylistNotice("Your playlist could not be saved in this browser. It will last for this visit."); }
    });
    if (controller.getSnapshot().playlist.length) void controller.refreshCatalog();
    return unsubscribe;
  }, [controller]);

  useEffect(() => {
    const arbitrate = (event: Event) => {
      const media = event.target;
      if (!allowed || !(media instanceof HTMLMediaElement) || media.paused || media.muted || media.volume === 0) return;
      if (media === element.current) {
        document.querySelectorAll<HTMLMediaElement>("audio, video").forEach(other => {
          if (other !== media && !other.paused && !other.muted && other.volume > 0) other.pause();
        });
      } else controller.pause();
    };
    // A third-party embed cannot send its native media events to this document.
    // Yield when the visitor gives an iframe focus, without touching the embed.
    const yieldToEmbed = () => { if (document.activeElement instanceof HTMLIFrameElement) controller.pause(); };
    document.addEventListener("play", arbitrate, true);
    document.addEventListener("volumechange", arbitrate, true);
    window.addEventListener("blur", yieldToEmbed);
    return () => {
      document.removeEventListener("play", arbitrate, true);
      document.removeEventListener("volumechange", arbitrate, true);
      window.removeEventListener("blur", yieldToEmbed);
    };
  }, [allowed, controller]);

  return <AudioContext.Provider value={controller}>
    {children}
    <audio ref={attach} data-barcode-audio="true" preload="none" hidden />
    {allowed && <SiteAudioDock />}
  </AudioContext.Provider>;
}
