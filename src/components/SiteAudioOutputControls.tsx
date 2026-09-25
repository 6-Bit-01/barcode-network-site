"use client";

import { useEffect, useState } from "react";
import { useSiteAudio } from "@/components/SiteAudioProvider";
import { prepareCast, type CastPicker } from "@/lib/site-audio-cast";
import styles from "./SiteAudioDock.module.css";

export function SiteAudioOutputControls() {
  const audio = useSiteAudio();
  const [picker, setPicker] = useState<CastPicker | null>(null);
  const [available, setAvailable] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const hasTrack = !!audio.track;
  useEffect(() => {
    // Load Google's sender only after a public recording has been selected in
    // a compatible Chromium browser. There is no reconnect or autoplay on load.
    if (!hasTrack || !("chrome" in window) || /iPhone|iPad|iPod/.test(navigator.userAgent)) return;
    let disposed = false, unwatch: (() => void) | undefined;
    void prepareCast().then(next => {
      if (disposed) return;
      setLoadFailed(false);
      setPicker(next);
      const refresh = () => setAvailable(next.available());
      refresh(); unwatch = next.watch(refresh);
    }).catch(() => { if (!disposed) setLoadFailed(true); });
    return () => { disposed = true; unwatch?.(); };
  }, [hasTrack, retry]);
  function choose() {
    if (!picker || !audio.track || choosing) return;
    const key = audio.track.key;
    setChoosing(true); audio.controller.setOutputNotice(null);
    // requestSession is invoked directly in the click gesture.
    void picker.choose().then(output => audio.controller.connectOutput(output, key)).catch(error => {
      const code = typeof error === "string" ? error : error?.code;
      if (code !== "cancel") audio.controller.setOutputNotice("Cast could not connect. Check the device and try again.");
    }).finally(() => setChoosing(false));
  }
  return <>
    {(audio.airPlayAvailable || audio.airPlayActive) && !audio.outputLabel && <button type="button" className={styles.textButton} onClick={audio.controller.requestAirPlay} aria-label="Choose AirPlay output">{audio.airPlayActive ? "AirPlay connected" : "AirPlay"}</button>}
    {audio.outputLabel ? <button type="button" className={styles.textButton} style={{ maxWidth: "100%", whiteSpace: "normal", overflowWrap: "anywhere" }} onClick={() => audio.controller.disconnectOutput()} aria-label="Stop casting">Stop casting · {audio.outputLabel}</button>
      : available && !audio.airPlayActive && <button type="button" className={styles.textButton} disabled={choosing} onClick={choose}>{choosing ? "Connecting…" : "Cast"}</button>}
    {loadFailed && !audio.outputLabel && !audio.airPlayActive && <button type="button" className={styles.textButton} onClick={() => { setLoadFailed(false); setRetry(value => value + 1); }}>Retry Cast</button>}
  </>;
}
