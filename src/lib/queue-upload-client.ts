// Shared browser-side audio preparation for intake and own-song replacement.
export function safeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-").slice(0, 120) || "track";
}

export function audioMimeTypeForFile(file: File): string {
  const browserType = file.type.toLowerCase();
  if (["audio/mpeg", "audio/mp3", "audio/wav", "audio/wave", "audio/x-wav"].includes(browserType)) return browserType;
  if (/\.mp3$/i.test(file.name)) return "audio/mpeg";
  if (/\.wav$/i.test(file.name)) return "audio/wav";
  return browserType || "application/octet-stream";
}

export function readAudioDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const audio = document.createElement("audio");
    const url = URL.createObjectURL(file);
    let settled = false;
    const finish = (duration: number | null) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      resolve(duration && Number.isFinite(duration) && duration > 0 ? duration : null);
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
