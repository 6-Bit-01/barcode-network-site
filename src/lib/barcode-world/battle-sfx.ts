import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

export type BattleSfxCue =
  | "panel"
  | "select"
  | "commit"
  | "undo"
  | "cycle"
  | "resolve"
  | "success"
  | "failure"
  | "enemy"
  | "enemy-blocked"
  | "break"
  | "round";

type ToneOptions = {
  at?: number;
  duration: number;
  endFrequency: number;
  frequency: number;
  type?: OscillatorType;
  volume: number;
};

function tone(context: AudioContext, options: ToneOptions) {
  const start = context.currentTime + (options.at ?? 0);
  const end = start + options.duration;
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = options.type ?? "sine";
  oscillator.frequency.setValueAtTime(options.frequency, start);
  oscillator.frequency.exponentialRampToValueAtTime(options.endFrequency, end);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(options.volume, start + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, end);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(start);
  oscillator.stop(end + 0.01);
}

function renderCue(context: AudioContext, cue: BattleSfxCue) {
  switch (cue) {
    case "panel":
      tone(context, { duration: 0.07, endFrequency: 430, frequency: 310, type: "triangle", volume: 0.032 });
      return;
    case "select":
      tone(context, { duration: 0.075, endFrequency: 740, frequency: 520, type: "triangle", volume: 0.04 });
      tone(context, { at: 0.045, duration: 0.06, endFrequency: 960, frequency: 760, type: "sine", volume: 0.025 });
      return;
    case "commit":
      tone(context, { duration: 0.11, endFrequency: 145, frequency: 240, type: "square", volume: 0.052 });
      tone(context, { at: 0.025, duration: 0.09, endFrequency: 510, frequency: 760, type: "triangle", volume: 0.03 });
      return;
    case "undo":
      tone(context, { duration: 0.1, endFrequency: 300, frequency: 520, type: "triangle", volume: 0.035 });
      return;
    case "cycle":
      tone(context, { duration: 0.085, endFrequency: 540, frequency: 320, type: "triangle", volume: 0.035 });
      tone(context, { at: 0.07, duration: 0.085, endFrequency: 320, frequency: 540, type: "triangle", volume: 0.035 });
      return;
    case "resolve":
      tone(context, { duration: 0.12, endFrequency: 105, frequency: 165, type: "square", volume: 0.038 });
      tone(context, { at: 0.045, duration: 0.1, endFrequency: 360, frequency: 280, type: "triangle", volume: 0.024 });
      return;
    case "success":
      tone(context, { duration: 0.12, endFrequency: 700, frequency: 470, type: "triangle", volume: 0.045 });
      tone(context, { at: 0.09, duration: 0.14, endFrequency: 1_040, frequency: 700, type: "sine", volume: 0.04 });
      return;
    case "failure":
      tone(context, { duration: 0.16, endFrequency: 170, frequency: 330, type: "sawtooth", volume: 0.042 });
      tone(context, { at: 0.075, duration: 0.15, endFrequency: 92, frequency: 155, type: "square", volume: 0.028 });
      return;
    case "enemy":
      tone(context, { duration: 0.19, endFrequency: 72, frequency: 145, type: "square", volume: 0.055 });
      tone(context, { at: 0.035, duration: 0.12, endFrequency: 110, frequency: 205, type: "sawtooth", volume: 0.035 });
      return;
    case "enemy-blocked":
      tone(context, { duration: 0.11, endFrequency: 175, frequency: 245, type: "triangle", volume: 0.032 });
      return;
    case "break":
      tone(context, { duration: 0.16, endFrequency: 330, frequency: 250, type: "triangle", volume: 0.04 });
      tone(context, { at: 0.1, duration: 0.16, endFrequency: 510, frequency: 380, type: "triangle", volume: 0.04 });
      tone(context, { at: 0.2, duration: 0.2, endFrequency: 820, frequency: 560, type: "sine", volume: 0.045 });
      return;
    case "round":
      tone(context, { duration: 0.22, endFrequency: 390, frequency: 350, type: "triangle", volume: 0.035 });
      tone(context, { at: 0.04, duration: 0.24, endFrequency: 585, frequency: 525, type: "triangle", volume: 0.03 });
      tone(context, { at: 0.08, duration: 0.28, endFrequency: 780, frequency: 700, type: "sine", volume: 0.028 });
  }
}

export function battleSfxForSceneCue(sceneCue: string): BattleSfxCue {
  if (sceneCue === "player-success") return "success";
  if (sceneCue === "player-failed" || sceneCue === "player-invalidated") return "failure";
  if (sceneCue === "enemy-hit" || sceneCue === "enemy-advance" || sceneCue === "enemy-guard") return "enemy";
  if (sceneCue === "enemy-stopped") return "enemy-blocked";
  if (sceneCue === "pressure-break") return "break";
  return "round";
}

export function useBattleSfx() {
  const [enabled, setEnabledState] = useState(true);
  const enabledRef = useRef(true);
  const contextRef = useRef<AudioContext | null>(null);

  const getContext = useCallback(() => {
    if (typeof window === "undefined" || !("AudioContext" in window)) return null;
    if (!contextRef.current || contextRef.current.state === "closed") {
      contextRef.current = new window.AudioContext();
    }
    return contextRef.current;
  }, []);

  const setEnabled = useCallback((next: boolean) => {
    enabledRef.current = next;
    setEnabledState(next);
    const context = contextRef.current;
    if (!next && context?.state === "running") {
      void context.suspend().catch(() => undefined);
    }
  }, []);

  const play = useCallback((cue: BattleSfxCue) => {
    if (!enabledRef.current) return;
    const context = getContext();
    if (!context) return;

    const run = () => {
      try {
        renderCue(context, cue);
      } catch {
        // Audio is presentation-only and must never interrupt battle input.
      }
    };

    if (context.state === "suspended") {
      void context.resume().then(run).catch(() => undefined);
      return;
    }
    run();
  }, [getContext]);

  useEffect(() => () => {
    const context = contextRef.current;
    contextRef.current = null;
    if (context && context.state !== "closed") {
      void context.close().catch(() => undefined);
    }
  }, []);

  return { enabled, play, setEnabled };
}
