"use client";

import { useRef, useState, useEffect } from "react";

/**
 * CRT-styled video player with scanline overlay, glitch border,
 * and Max Headroom broadcast aesthetic.
 *
 * Supports Google Drive iframe embeds and local video files.
 * Falls back to a placeholder transmission card if no video is found.
 */
export function BroadcastVideo({
  src,
  poster,
  transcript,
}: {
  src?: string;
  poster?: string;
  transcript?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isMuted, setIsMuted] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasVideo, setHasVideo] = useState(!!src);

  // Detect Google Drive embed URLs
  const isDriveEmbed = src?.includes("drive.google.com");

  useEffect(() => {
    if (videoRef.current && src && !isDriveEmbed) {
      videoRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false));
    }
  }, [src, isDriveEmbed]);

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const togglePlay = () => {
    if (videoRef.current) {
      if (videoRef.current.paused) {
        videoRef.current.play();
        setIsPlaying(true);
      } else {
        videoRef.current.pause();
        setIsPlaying(false);
      }
    }
  };

  return (
    <div className="relative w-full max-w-2xl mx-auto">
      {/* CRT outer frame */}
      <div className="relative border-2 border-accent/20 bg-black p-1 sm:p-2 animate-border-pulse">
        {/* Screen bezel */}
        <div className="relative overflow-hidden bg-black aspect-video">
          {hasVideo && src ? (
            isDriveEmbed ? (
              <>
                <iframe
                  src={src}
                  className="w-full h-full absolute inset-0"
                  allow="autoplay; encrypted-media"
                  allowFullScreen
                  style={{ border: 0 }}
                />

                {/* Scanline overlay */}
                <div
                  className="absolute inset-0 pointer-events-none z-10"
                  style={{
                    background:
                      "repeating-linear-gradient(0deg, rgba(0,0,0,0.06) 0px, rgba(0,0,0,0.06) 1px, transparent 1px, transparent 3px)",
                  }}
                />

                {/* CRT vignette */}
                <div
                  className="absolute inset-0 pointer-events-none z-10"
                  style={{
                    background:
                      "radial-gradient(ellipse at center, transparent 60%, rgba(0,0,0,0.6) 100%)",
                  }}
                />

                {/* REC indicator */}
                <div className="absolute top-3 left-3 z-20 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-status-blink" />
                  <span className="text-xs text-red-400/80 uppercase tracking-wider font-mono">
                    REC
                  </span>
                </div>

                {/* Channel label */}
                <div className="absolute top-3 right-3 z-20">
                  <span className="text-xs text-accent/40 font-mono">
                    CH.01 // BARCODE
                  </span>
                </div>
              </>
            ) : (
              <>
                <video
                  ref={videoRef}
                  src={src}
                  poster={poster}
                  muted={isMuted}
                  loop
                  playsInline
                  className="w-full h-full object-cover"
                  onError={() => setHasVideo(false)}
                />

                {/* Scanline overlay */}
                <div
                  className="absolute inset-0 pointer-events-none z-10"
                  style={{
                    background:
                      "repeating-linear-gradient(0deg, rgba(0,0,0,0.06) 0px, rgba(0,0,0,0.06) 1px, transparent 1px, transparent 3px)",
                  }}
                />

                {/* CRT vignette */}
                <div
                  className="absolute inset-0 pointer-events-none z-10"
                  style={{
                    background:
                      "radial-gradient(ellipse at center, transparent 60%, rgba(0,0,0,0.6) 100%)",
                  }}
                />

                {/* Controls */}
                <div className="absolute bottom-3 right-3 z-20 flex gap-2">
                  <button
                    onClick={togglePlay}
                    className="px-2 py-1 text-xs uppercase tracking-wider border border-accent/40 text-accent/70 bg-black/70 hover:bg-accent/10 transition-colors"
                  >
                    {isPlaying ? "❚❚" : "▶"}
                  </button>
                  <button
                    onClick={toggleMute}
                    className="px-2 py-1 text-xs uppercase tracking-wider border border-accent/40 text-accent/70 bg-black/70 hover:bg-accent/10 transition-colors"
                  >
                    {isMuted ? "🔇 UNMUTE" : "🔊 MUTE"}
                  </button>
                </div>

                {/* REC indicator */}
                <div className="absolute top-3 left-3 z-20 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-status-blink" />
                  <span className="text-xs text-red-400/80 uppercase tracking-wider font-mono">
                    REC
                  </span>
                </div>

                {/* Timecode */}
                <div className="absolute top-3 right-3 z-20">
                  <span className="text-xs text-accent/40 font-mono">
                    CH.01 // BARCODE
                  </span>
                </div>
              </>
            )
          ) : (
            /* Placeholder — shown until video file is added */
            <div className="w-full h-full flex flex-col items-center justify-center bg-black aspect-video relative">
              {/* Static noise background */}
              <div className="absolute inset-0 noise-bg opacity-30" />

              {/* Scanlines */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background:
                    "repeating-linear-gradient(0deg, rgba(0,255,136,0.03) 0px, rgba(0,255,136,0.03) 1px, transparent 1px, transparent 3px)",
                }}
              />

              {/* Content */}
              <div className="relative z-10 text-center px-4">
                <div className="flex items-center justify-center gap-2 mb-4">
                  <span className="w-2 h-2 rounded-full bg-accent animate-status-blink" />
                  <span className="text-xs text-accent/60 uppercase tracking-[0.3em] font-mono">
                    Standby
                  </span>
                </div>

                <p className="text-accent/30 font-mono text-sm sm:text-base mb-2 animate-flicker">
                  ▌▌▌ TRANSMISSION INCOMING ▌▌▌
                </p>
                <p className="text-accent/15 font-mono text-xs">
                  BROADCAST FEED // AWAITING SIGNAL
                </p>
              </div>

              {/* Corner markers */}
              <div className="absolute top-2 left-2 w-4 h-4 border-t border-l border-accent/20" />
              <div className="absolute top-2 right-2 w-4 h-4 border-t border-r border-accent/20" />
              <div className="absolute bottom-2 left-2 w-4 h-4 border-b border-l border-accent/20" />
              <div className="absolute bottom-2 right-2 w-4 h-4 border-b border-r border-accent/20" />
            </div>
          )}
        </div>
      </div>

      {/* Label under the monitor */}
      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-accent/40" />
          <span className="text-xs text-muted/50 uppercase tracking-[0.3em] font-mono">
            Broadcast Feed
          </span>
        </div>
        <span className="text-xs text-muted/30 font-mono">
          BARCODE Network // CH.01
        </span>
      </div>

      {/* Transcript — glitchy subtitle style */}
      {transcript && (
        <div className="mt-4 border border-border/50 bg-surface/50 p-4">
          <p className="text-xs text-muted/40 uppercase tracking-[0.3em] mb-2 font-mono">
            // Transcript
          </p>
          <p className="text-sm text-foreground/50 leading-relaxed font-mono italic">
            &quot;{transcript}&quot;
          </p>
        </div>
      )}
    </div>
  );
}