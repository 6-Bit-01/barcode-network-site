"use client";

import { useEffect, useState, useRef } from "react";

const GLITCH_CHARS = "█▓▒░╔╗╚╝║═╬┤├┴┬│─┼@#$%&*!?<>01";

/**
 * Text that randomly glitches individual characters.
 * Subtle — only 1-2 chars at a time, infrequent bursts.
 */
export function GlitchText({
  text,
  className = "",
  intensity = "low",
}: {
  text: string;
  className?: string;
  intensity?: "low" | "medium" | "high";
}) {
  const [glitch, setGlitch] = useState<{ source: string; value: string } | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const restoreRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const config = {
    low: { interval: 4000, duration: 150, maxChars: 1 },
    medium: { interval: 2500, duration: 200, maxChars: 2 },
    high: { interval: 1500, duration: 250, maxChars: 3 },
  }[intensity];

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      // Random chance to glitch (60% of intervals)
      if (Math.random() > 0.6) return;

      const chars = text.split("");
      const numGlitch = Math.ceil(Math.random() * config.maxChars);

      for (let i = 0; i < numGlitch; i++) {
        const idx = Math.floor(Math.random() * chars.length);
        if (chars[idx] !== " ") {
          chars[idx] = GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)];
        }
      }

      setGlitch({ source: text, value: chars.join("") });

      // Restore original text after brief flash
      clearTimeout(restoreRef.current);
      restoreRef.current = setTimeout(() => setGlitch(null), config.duration);
    }, config.interval);

    return () => {
      clearInterval(intervalRef.current);
      clearTimeout(restoreRef.current);
    };
  }, [text, config.interval, config.duration, config.maxChars]);

  const display = glitch?.source === text ? glitch.value : text;
  return <span className={className}>{display}</span>;
}
