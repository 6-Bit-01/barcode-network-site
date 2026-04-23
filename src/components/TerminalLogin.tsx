"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { terminalLogin } from "@/content";

type Phase =
  | "boot"        // Boot sequence text
  | "username"    // Typing username
  | "password"    // Typing password dots
  | "auth"        // "Authenticating..."
  | "code"        // Code/data flash
  | "granted"     // ACCESS GRANTED
  | "nav";        // Show navigation

export function TerminalLogin() {
  const [phase, setPhase] = useState<Phase>("boot");
  const [lines, setLines] = useState<string[]>([]);
  const [currentTyping, setCurrentTyping] = useState("");
  const [passwordDots, setPasswordDots] = useState("");
  const [codeLines, setCodeLines] = useState<string[]>([]);
  const [showNav, setShowNav] = useState(false);
  const [showCursor, setShowCursor] = useState(true);
  const [skipped, setSkipped] = useState(false);
  const terminalRef = useRef<HTMLDivElement>(null);
  const phaseRef = useRef(phase);

  // Keep phaseRef in sync
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // Auto-scroll terminal
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [lines, currentTyping, passwordDots, codeLines, showNav]);

  // Skip handler
  const handleSkip = useCallback(() => {
    if (skipped) return;
    setSkipped(true);
    setPhase("nav");
    setLines([
      ...terminalLogin.bootSequence,
      "",
      `login: ${terminalLogin.username}`,
      "password: ••••••••••••",
      "",
      "Authenticating... OK",
      "",
      ...terminalLogin.codeFlash,
      "",
      `[${terminalLogin.accessGranted}]`,
      "",
    ]);
    setCurrentTyping("");
    setPasswordDots("");
    setCodeLines([]);
    setShowNav(true);
  }, [skipped]);

  // Main animation sequence
  useEffect(() => {
    if (skipped) return;

    let cancelled = false;
    const delay = (ms: number) =>
      new Promise<void>((resolve) => {
        const id = setTimeout(() => {
          if (!cancelled) resolve();
        }, ms);
        return () => clearTimeout(id);
      });

    async function run() {
      // PHASE: BOOT
      setPhase("boot");
      for (const line of terminalLogin.bootSequence) {
        if (cancelled) return;
        setLines((prev) => [...prev, line]);
        await delay(400);
      }
      await delay(300);

      // PHASE: USERNAME
      if (cancelled) return;
      setPhase("username");
      setLines((prev) => [...prev, ""]);
      const username = terminalLogin.username;
      for (let i = 0; i <= username.length; i++) {
        if (cancelled) return;
        setCurrentTyping(username.slice(0, i));
        await delay(80 + Math.random() * 60);
      }
      await delay(400);

      // Commit username line
      setLines((prev) => [...prev, `login: ${username}`]);
      setCurrentTyping("");

      // PHASE: PASSWORD
      if (cancelled) return;
      setPhase("password");
      const passLen = 12;
      for (let i = 0; i <= passLen; i++) {
        if (cancelled) return;
        setPasswordDots("•".repeat(i));
        await delay(50 + Math.random() * 40);
      }
      await delay(300);

      // Commit password line
      setLines((prev) => [...prev, `password: ${"•".repeat(passLen)}`]);
      setPasswordDots("");

      // PHASE: AUTH
      if (cancelled) return;
      setPhase("auth");
      setLines((prev) => [...prev, ""]);
      setLines((prev) => [...prev, "Authenticating..."]);
      await delay(1200);
      setLines((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = "Authenticating... OK";
        return copy;
      });
      await delay(500);

      // PHASE: CODE FLASH
      if (cancelled) return;
      setPhase("code");
      setLines((prev) => [...prev, ""]);
      for (const codeLine of terminalLogin.codeFlash) {
        if (cancelled) return;
        setCodeLines((prev) => [...prev, codeLine]);
        await delay(80);
      }
      await delay(600);

      // Commit code lines
      setLines((prev) => [...prev, ...terminalLogin.codeFlash, ""]);
      setCodeLines([]);

      // PHASE: GRANTED
      if (cancelled) return;
      setPhase("granted");
      setLines((prev) => [...prev, `[${terminalLogin.accessGranted}]`, ""]);
      await delay(1000);

      // PHASE: NAV
      if (cancelled) return;
      setPhase("nav");
      setShowNav(true);
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [skipped]);

  // Cursor blink
  useEffect(() => {
    const id = setInterval(() => setShowCursor((c) => !c), 530);
    return () => clearInterval(id);
  }, []);

  const cursor = showCursor ? "█" : " ";

  return (
    <div className="relative w-full">
      {/* Skip button */}
      {!showNav && (
        <button
          onClick={handleSkip}
          className="absolute top-4 right-4 z-10 text-xs uppercase tracking-widest text-muted hover:text-accent transition-colors border border-border hover:border-accent/30 px-3 py-1.5"
        >
          Skip →
        </button>
      )}

      {/* CRT terminal frame */}
      <div className="terminal-login-frame bg-[#050505] border border-accent/20 rounded-sm overflow-hidden">
        {/* Title bar */}
        <div className="flex items-center gap-2 px-4 py-2 bg-accent/5 border-b border-accent/20">
          <span className="w-2 h-2 rounded-full bg-accent/60" />
          <span className="w-2 h-2 rounded-full bg-yellow-500/60" />
          <span className="w-2 h-2 rounded-full bg-red-500/60" />
          <span className="ml-3 text-xs font-mono text-muted tracking-wider">
            BARCODE_NET — SECURE TERMINAL
          </span>
        </div>

        {/* Terminal body */}
        <div
          ref={terminalRef}
          className="p-4 sm:p-6 font-mono text-sm leading-relaxed max-h-[70vh] overflow-y-auto terminal-scrollbar"
        >
          {/* Rendered lines */}
          {lines.map((line, i) => (
            <div key={i} className={getLineClass(line)}>
              {line === "" ? "\u00A0" : line}
            </div>
          ))}

          {/* Active typing: username */}
          {phase === "username" && (
            <div className="text-accent">
              <span className="text-muted">login: </span>
              {currentTyping}
              <span className="terminal-cursor">{cursor}</span>
            </div>
          )}

          {/* Active typing: password */}
          {phase === "password" && (
            <div className="text-accent">
              <span className="text-muted">password: </span>
              {passwordDots}
              <span className="terminal-cursor">{cursor}</span>
            </div>
          )}

          {/* Code flash */}
          {phase === "code" && codeLines.length > 0 && (
            <div className="code-flash-container">
              {codeLines.map((cl, i) => (
                <div
                  key={i}
                  className={`text-accent/70 ${
                    i === codeLines.length - 1 ? "code-flash-latest" : ""
                  }`}
                >
                  {cl}
                </div>
              ))}
            </div>
          )}

          {/* Idle cursor */}
          {(phase === "boot" || phase === "auth") && (
            <div className="text-accent mt-1">
              <span className="terminal-cursor">{cursor}</span>
            </div>
          )}

          {/* Navigation panel */}
          {showNav && (
            <div className="mt-4 terminal-nav-reveal">
              <div className="text-xs text-muted mb-4 uppercase tracking-widest">
                ── NETWORK ACCESS POINTS ──
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {terminalLogin.navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="group block border border-border hover:border-accent/40 bg-surface/50 hover:bg-accent/5 p-4 transition-all"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-accent animate-status-blink" />
                      <span className="text-sm font-bold text-foreground group-hover:text-accent transition-colors tracking-wider">
                        {item.label}
                      </span>
                    </div>
                    <p className="text-xs text-muted pl-3.5">
                      {item.description}
                    </p>
                  </Link>
                ))}
              </div>

              {/* Persistent cursor at bottom */}
              <div className="mt-6 text-accent text-sm">
                &gt; READY<span className="cursor-blink">_</span>
              </div>
            </div>
          )}
        </div>

        {/* Scanline overlay */}
        <div className="pointer-events-none absolute inset-0 terminal-scanlines" />
      </div>
    </div>
  );
}

/** Color lines based on content */
function getLineClass(line: string): string {
  if (line.startsWith("[") && line.includes("ACCESS GRANTED"))
    return "text-accent font-bold text-base mt-2 animate-glow-breathe";
  if (line.startsWith("Authenticating"))
    return "text-yellow-400/80";
  if (line.includes("OK") || line.includes("PASS") || line.includes("CONNECTED") || line.includes("OPERATIONAL") || line.includes("READY"))
    return "text-accent/80";
  if (line.startsWith("DECRYPT") || line.startsWith("0x") || line.startsWith("AUTH TOKEN") || line.startsWith("SESSION"))
    return "text-accent/50";
  if (line.startsWith("LOAD") || line.startsWith("INIT") || line.startsWith("SYNC") || line.startsWith("mapping"))
    return "text-foreground/50";
  if (line.startsWith("login:"))
    return "text-accent";
  if (line.startsWith("password:"))
    return "text-accent";
  return "text-foreground/60";
}