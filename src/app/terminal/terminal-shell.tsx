"use client";

import { useCallback, useState } from "react";
import { NetworkArchiveTerminal, type ArchivePayload } from "@/components/NetworkArchiveTerminal";
import { TerminalLogin } from "@/components/TerminalLogin";

export function TerminalShell({ archive }: { archive: ArchivePayload }) {
  const [unlocked, setUnlocked] = useState(false);
  const [restored, setRestored] = useState(false);
  const handleUnlock = useCallback((sessionRestored = false) => {
    setRestored(sessionRestored);
    setUnlocked(true);
  }, []);
  const handleLock = useCallback(() => {
    setUnlocked(false);
    setRestored(false);
  }, []);

  return unlocked ? (
    <NetworkArchiveTerminal archive={archive} restored={restored} onLock={handleLock} />
  ) : (
    <div className="mx-auto max-w-4xl">
      <TerminalLogin onUnlock={handleUnlock} />
    </div>
  );
}
