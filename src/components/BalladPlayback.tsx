"use client";

import type { PublicBallad } from "@/lib/bnl-ballads";
import { audioTime, balladAudioTrack } from "@/lib/site-audio-player";
import { useSiteAudio } from "@/components/SiteAudioProvider";
import { balladDownloadHref } from "@/lib/ballad-download";

export function BalladPlayback({ ballad }: { ballad: PublicBallad }) {
  const audio = useSiteAudio();
  const track = balladAudioTrack(ballad);
  const active = audio.track?.key === track.key;
  const playing = active && ["playing", "loading"].includes(audio.status);
  return <div className="flex flex-wrap items-center gap-3">
    <button type="button" aria-label={`${playing ? "Pause" : "Play"} ${track.title}`} onClick={() => playing ? audio.controller.pause() : audio.controller.play(track)} className="inline-flex min-h-11 items-center gap-3 rounded border border-accent bg-accent/10 px-5 py-3 font-oxanium text-sm font-bold text-accent hover:bg-accent hover:text-background focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent">
      <span aria-hidden="true">{playing ? "Ⅱ" : "▶"}</span>{playing ? "Pause song" : active && audio.currentTime > 0 && audio.status !== "ended" ? "Resume song" : "Play song"}
    </button>
    <a href={balladDownloadHref(ballad.show.sessionId, ballad.audioId)} download className="inline-flex min-h-11 items-center rounded border border-accent/40 px-4 py-2 text-sm font-bold text-accent hover:bg-accent/10" aria-label={`Download ${track.title} free`}>↓ Free download</a>
    <span className="text-xs text-foreground/65">{active ? `${audioTime(audio.currentTime)} / ${audioTime(audio.duration)} · Controls below` : `${track.duration ? `${audioTime(track.duration)} · ` : ""}Keep listening as you explore`}</span>
  </div>;
}
