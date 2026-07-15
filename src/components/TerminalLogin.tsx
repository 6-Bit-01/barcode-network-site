"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Phase = "boot" | "username" | "password" | "auth" | "code" | "granted";

const bootSequence = [
  "BARCODE NETWORK ARCHIVE TERMINAL",
  "INIT PUBLIC ARCHIVE CONNECTION... READY",
  "LOAD DATABASE INDEX... READY",
  "SYNC TRANSMISSION ARCHIVE... READY",
  "LINK BNL RELAY... CONNECTED",
  "MOUNT BROADCAST RECORDS... READY",
  "VERIFY SIGNAL INTEGRITY... PASS",
  "UNINDEXED NODE COUNT: 01",
];

const codeFlash = [
  "INDEX // DOSSIERS.PUBLIC",
  "INDEX // TRANSMISSIONS.PUBLIC",
  "INDEX // RELEASES.PUBLIC",
  "RELAY // BNL-01.PUBLIC",
  "SESSION // OBSERVER.PERMISSIONS",
];

const username = "PUBLIC_OBSERVER";
const accessGranted = "ACCESS GRANTED // PUBLIC ARCHIVE SESSION";
const sessionKey = "barcode-terminal-public-observer";

export function clearTerminalSession() {
  if (typeof window !== "undefined") {
    window.sessionStorage.removeItem(sessionKey);
  }
}

export function TerminalLogin({ onUnlock }: { onUnlock: (restored?: boolean) => void }) {
  const [phase, setPhase] = useState<Phase>("boot");
  const [lines, setLines] = useState<string[]>([]);
  const [currentTyping, setCurrentTyping] = useState("");
  const [passwordDots, setPasswordDots] = useState("");
  const [codeLines, setCodeLines] = useState<string[]>([]);
  const [showCursor, setShowCursor] = useState(true);
  const [skipped, setSkipped] = useState(false);
  const terminalRef = useRef<HTMLDivElement>(null);
  const unlockedRef = useRef(false);

  const unlock = useCallback((restored = false) => {
    if (unlockedRef.current) return;
    unlockedRef.current = true;
    window.sessionStorage.setItem(sessionKey, "unlocked");
    onUnlock(restored);
  }, [onUnlock]);

  useEffect(() => {
    if (window.sessionStorage.getItem(sessionKey) === "unlocked") {
      const restoreId = window.setTimeout(() => setLines(["SESSION RESTORED // PUBLIC OBSERVER", "", "Routing to archive console..."]), 0);
      const id = window.setTimeout(() => unlock(true), 650);
      return () => { window.clearTimeout(restoreId); window.clearTimeout(id); };
    }
  }, [unlock]);

  useEffect(() => {
    if (terminalRef.current) terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
  }, [lines, currentTyping, passwordDots, codeLines]);

  const handleSkip = useCallback(() => {
    if (skipped) return;
    setSkipped(true);
    setLines([
      ...bootSequence,
      "",
      `login: ${username}`,
      "password: ••••••••••••",
      "",
      "Authenticating public archive session... OK",
      "",
      ...codeFlash,
      "",
      `[${accessGranted}]`,
    ]);
    setCurrentTyping("");
    setPasswordDots("");
    setCodeLines([]);
    window.setTimeout(() => unlock(false), 400);
  }, [skipped, unlock]);

  useEffect(() => {
    if (skipped || unlockedRef.current) return;
    let cancelled = false;
    const delay = (ms: number) => new Promise<void>((resolve) => window.setTimeout(() => !cancelled && resolve(), ms));

    async function run() {
      setPhase("boot");
      for (const line of bootSequence) {
        if (cancelled) return;
        setLines((prev) => [...prev, line]);
        await delay(260);
      }
      await delay(220);
      setPhase("username");
      setLines((prev) => [...prev, ""]);
      for (let i = 0; i <= username.length; i++) {
        if (cancelled) return;
        setCurrentTyping(username.slice(0, i));
        await delay(45 + Math.random() * 35);
      }
      setLines((prev) => [...prev, `login: ${username}`]);
      setCurrentTyping("");
      setPhase("password");
      for (let i = 0; i <= 12; i++) {
        if (cancelled) return;
        setPasswordDots("•".repeat(i));
        await delay(35 + Math.random() * 25);
      }
      setLines((prev) => [...prev, `password: ${"•".repeat(12)}`]);
      setPasswordDots("");
      setPhase("auth");
      setLines((prev) => [...prev, "", "Authenticating public archive session..."]);
      await delay(700);
      setLines((prev) => [...prev.slice(0, -1), "Authenticating public archive session... OK"]);
      await delay(250);
      setPhase("code");
      setLines((prev) => [...prev, ""]);
      for (const codeLine of codeFlash) {
        if (cancelled) return;
        setCodeLines((prev) => [...prev, codeLine]);
        await delay(55);
      }
      setLines((prev) => [...prev, ...codeFlash, ""]);
      setCodeLines([]);
      setPhase("granted");
      setLines((prev) => [...prev, `[${accessGranted}]`]);
      await delay(700);
      if (!cancelled) unlock(false);
    }
    run();
    return () => { cancelled = true; };
  }, [skipped, unlock]);

  useEffect(() => {
    const id = window.setInterval(() => setShowCursor((c) => !c), 530);
    return () => window.clearInterval(id);
  }, []);

  const cursor = showCursor ? "█" : " ";
  return (
    <div className="relative w-full">
      <button onClick={handleSkip} className="absolute top-4 right-4 z-10 border border-border px-3 py-1.5 text-xs uppercase tracking-widest text-muted transition-colors hover:border-accent/40 hover:text-accent focus:outline-none focus:ring-2 focus:ring-accent/60">
        Skip →
      </button>
      <div className="terminal-login-frame bg-[#050505] border border-accent/20 rounded-sm overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2 bg-accent/5 border-b border-accent/20">
          <span className="h-2 w-2 rounded-full bg-accent/60" /><span className="h-2 w-2 rounded-full bg-yellow-500/60" /><span className="h-2 w-2 rounded-full bg-red-500/60" />
          <span className="ml-3 text-xs font-mono text-muted tracking-wider">BARCODE_NET — PUBLIC ARCHIVE</span>
        </div>
        <div ref={terminalRef} className="terminal-scrollbar max-h-[70vh] overflow-y-auto p-4 font-mono text-sm leading-relaxed sm:p-6">
          {lines.map((line, i) => <div key={i} className={getLineClass(line)}>{line || "\u00A0"}</div>)}
          {phase === "username" && <div className="text-accent"><span className="text-muted">login: </span>{currentTyping}<span className="terminal-cursor">{cursor}</span></div>}
          {phase === "password" && <div className="text-accent"><span className="text-muted">password: </span>{passwordDots}<span className="terminal-cursor">{cursor}</span></div>}
          {phase === "code" && codeLines.map((line, i) => <div key={line} className={`text-accent/70 ${i === codeLines.length - 1 ? "code-flash-latest" : ""}`}>{line}</div>)}
          {(phase === "boot" || phase === "auth") && <div className="mt-1 text-accent"><span className="terminal-cursor">{cursor}</span></div>}
        </div>
        <div className="pointer-events-none absolute inset-0 terminal-scanlines" />
      </div>
    </div>
  );
}

function getLineClass(line: string): string {
  if (line.includes("ACCESS GRANTED") || line.includes("SESSION RESTORED")) return "text-accent font-bold text-base mt-2 animate-glow-breathe";
  if (line.includes("Authenticating")) return "text-yellow-400/80";
  if (line.includes("READY") || line.includes("PASS") || line.includes("CONNECTED")) return "text-accent/80";
  if (line.startsWith("INDEX") || line.startsWith("RELAY") || line.startsWith("SESSION")) return "text-accent/50";
  if (line.startsWith("login:") || line.startsWith("password:")) return "text-accent";
  return "text-foreground/60";
}
