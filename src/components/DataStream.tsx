"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Ambient floating data particles — random hex/binary values
 * that drift slowly across the background like a living system.
 * Pure CSS animation, lightweight.
 */
export function DataStream({ className = "" }: { className?: string }) {
  const [particles, setParticles] = useState<
    { id: number; char: string; x: number; y: number; speed: number; opacity: number }[]
  >([]);

  const chars = "0123456789ABCDEF";
  const idRef = useRef(0);

  useEffect(() => {
    const spawn = () => {
      const id = idRef.current++;
      const char = Array.from({ length: 2 }, () =>
        chars[Math.floor(Math.random() * chars.length)]
      ).join("");

      setParticles((prev) => [
        ...prev.slice(-15), // keep max 15 particles
        {
          id,
          char,
          x: Math.random() * 100,
          y: -5,
          speed: 20 + Math.random() * 40,
          opacity: 0.03 + Math.random() * 0.06,
        },
      ]);
    };

    const interval = setInterval(spawn, 3000);
    spawn(); // initial
    return () => clearInterval(interval);
  }, []);

  return (
    <div
      className={`fixed inset-0 pointer-events-none overflow-hidden z-0 hidden md:block ${className}`}
      aria-hidden="true"
    >
      {particles.map((p) => (
        <span
          key={p.id}
          className="absolute font-mono text-accent animate-data-fall"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            opacity: p.opacity,
            fontSize: "10px",
            animationDuration: `${p.speed}s`,
          }}
        >
          {p.char}
        </span>
      ))}
    </div>
  );
}