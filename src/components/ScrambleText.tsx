"use client";

import { useEffect, useState } from "react";

const DECODE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$%&*!?<>█▓▒░";

/**
 * Text that "decodes" from random characters on mount.
 * Like watching encrypted data resolve into readable text.
 */
export function ScrambleText({
  text,
  className = "",
  speed = 30,
  delay = 0,
}: {
  text: string;
  className?: string;
  speed?: number;
  delay?: number;
}) {
  const [display, setDisplay] = useState("");
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => setStarted(true), delay);
    return () => clearTimeout(timeout);
  }, [delay]);

  useEffect(() => {
    if (!started) return;

    let iteration = 0;
    const totalIterations = text.length;

    const interval = setInterval(() => {
      const resolved = text.slice(0, iteration);
      const scrambled = text
        .slice(iteration)
        .split("")
        .map((ch) =>
          ch === " " ? " " : DECODE_CHARS[Math.floor(Math.random() * DECODE_CHARS.length)]
        )
        .join("");

      setDisplay(resolved + scrambled);
      iteration++;

      if (iteration > totalIterations) {
        clearInterval(interval);
        setDisplay(text);
      }
    }, speed);

    return () => clearInterval(interval);
  }, [text, speed, started]);

  return <span className={className}>{display || text.replace(/./g, " ")}</span>;
}