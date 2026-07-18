export const WHEEL_SPIN_AUDIO_PATHS = [
  "/audio/wheel/1.mp3",
  "/audio/wheel/3.mp3",
  "/audio/wheel/8.mp3",
  "/audio/wheel/10.mp3",
  "/audio/wheel/15.mp3",
  "/audio/wheel/21.mp3",
  "/audio/wheel/24.mp3",
  "/audio/wheel/32%20(1).mp3",
  "/audio/wheel/33.mp3",
  "/audio/wheel/36.mp3",
  "/audio/wheel/41.mp3",
  "/audio/wheel/43.mp3",
  "/audio/wheel/46.mp3",
  "/audio/wheel/49.mp3",
  "/audio/wheel/54.mp3",
  "/audio/wheel/56.mp3",
  "/audio/wheel/58.mp3",
  "/audio/wheel/70.mp3",
  "/audio/wheel/72.mp3",
  "/audio/wheel/73.mp3",
  "/audio/wheel/74.mp3",
  "/audio/wheel/75.mp3",
  "/audio/wheel/76.mp3",
  "/audio/wheel/77.mp3",
  "/audio/wheel/78.mp3",
  "/audio/wheel/81.mp3",
  "/audio/wheel/82.mp3",
  "/audio/wheel/84.mp3",
  "/audio/wheel/92.mp3",
  "/audio/wheel/93.mp3",
  "/audio/wheel/99.mp3",
  "/audio/wheel/102.mp3",
  "/audio/wheel/103.mp3",
  "/audio/wheel/104.mp3",
  "/audio/wheel/105.mp3",
  "/audio/wheel/110.mp3",
  "/audio/wheel/111.mp3",
  "/audio/wheel/130.mp3",
  "/audio/wheel/138.mp3",
  "/audio/wheel/139.mp3",
  "/audio/wheel/140.mp3",
  "/audio/wheel/142.mp3",
  "/audio/wheel/147.mp3",
  "/audio/wheel/148.mp3",
  "/audio/wheel/150.mp3",
  "/audio/wheel/154.mp3",
  "/audio/wheel/162.mp3",
] as const;

export const WHEEL_CEREMONY_AUDIO = {
  cheer: "/audio/wheel/WheelCheer.mp3",
  encrypt: "/audio/wheel/WheelEncrypt.mp3",
} as const;

export function selectWheelSpinAudioPath(random = Math.random): string {
  const index = Math.floor(Math.max(0, Math.min(0.999999999, random())) * WHEEL_SPIN_AUDIO_PATHS.length);
  return WHEEL_SPIN_AUDIO_PATHS[index] ?? WHEEL_SPIN_AUDIO_PATHS[0];
}

export function isWheelSpinAudioPath(path: unknown): path is (typeof WHEEL_SPIN_AUDIO_PATHS)[number] {
  return typeof path === "string" && (WHEEL_SPIN_AUDIO_PATHS as readonly string[]).includes(path);
}

export function wheelAudioFallbackCandidates(primary?: string | null): string[] {
  const verifiedPrimary = isWheelSpinAudioPath(primary) ? primary : null;
  const fallbacks = verifiedPrimary ? WHEEL_SPIN_AUDIO_PATHS.filter((path) => path !== verifiedPrimary) : WHEEL_SPIN_AUDIO_PATHS;
  return verifiedPrimary ? [verifiedPrimary, ...fallbacks.slice(0, 1)] : fallbacks.slice(0, 1);
}
