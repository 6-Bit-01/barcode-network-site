import type { HellcatPlayback, HellcatRadioResult } from "@/lib/hellcat-now-playing";

// One stream and one listener preference, independent of ladder row/track changes.
export function createHellcatRadioPlayer(audio: HTMLAudioElement, changed: (state: HellcatPlayback) => void) {
  let live = false, wanted = false, disposed = false, starting = false;
  let stream: string | null = null, generation = 0;
  const report = (state: HellcatPlayback) => { if (!disposed) changed(state); };
  const playing = () => { if (live && wanted) report("playing"); else audio.pause(); };
  const waiting = () => { if (live && wanted) report("connecting"); };
  const failed = () => { if (live && wanted) { wanted = false; starting = false; generation++; audio.pause(); report("error"); } };
  const paused = () => { if (!starting) report("paused"); };

  const play = () => {
    if (!live || !wanted || starting || disposed) return;
    if (!audio.paused) return;
    starting = true;
    const attempt = ++generation;
    report("connecting");
    // Call immediately in the click handler to preserve browser user activation.
    let promise: Promise<void>;
    try { promise = audio.play(); }
    catch { promise = Promise.reject(new Error("Stream unavailable")); }
    void promise.then(() => {
      if (disposed || attempt !== generation || !live || !wanted) return;
      starting = false;
      report("playing");
    }).catch((error: unknown) => {
      if (disposed || attempt !== generation) return;
      starting = false;
      wanted = false;
      report(error && typeof error === "object" && "name" in error && error.name === "NotAllowedError" ? "blocked" : "error");
    });
  };

  for (const [event, listener] of [["playing", playing], ["waiting", waiting], ["stalled", waiting], ["error", failed], ["pause", paused]] as const) {
    audio.addEventListener(event, listener);
  }
  return {
    isListening: () => wanted,
    update: (radio: HellcatRadioResult | null) => {
      live = Boolean(radio?.live);
      if (!radio?.live) {
        generation++; starting = false; audio.pause(); report("paused");
        return;
      }
      if (stream !== radio.stream_url) {
        generation++; starting = false; audio.pause();
        stream = radio.stream_url;
        audio.src = stream!;
      }
      play();
    },
    toggle: () => {
      if (!live || disposed) return;
      wanted = !wanted;
      if (wanted) play();
      else { generation++; starting = false; audio.pause(); report("paused"); }
    },
    dispose: () => {
      disposed = true; wanted = false; live = false; generation++;
      for (const [event, listener] of [["playing", playing], ["waiting", waiting], ["stalled", waiting], ["error", failed], ["pause", paused]] as const) audio.removeEventListener(event, listener);
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    },
  };
}
