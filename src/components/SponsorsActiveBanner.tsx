"use client";

import { useLiveStatus } from "./LiveStatusProvider";

export function SponsorsActiveBanner() {
  const { sponsorsActive } = useLiveStatus();

  if (!sponsorsActive) return null;

  return (
    <div className="border-b border-accent/40 bg-accent/10 shadow-[0_0_28px_rgba(255,0,0,0.10)]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="flex flex-col items-center justify-center gap-1 py-3 text-center sm:flex-row sm:gap-4">
          <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.35em] text-accent text-glow-red">
            <span className="h-2 w-2 bg-accent shadow-[0_0_12px_rgba(255,0,0,0.85)]" aria-hidden="true" />
            Sponsors Active
          </span>
          <span className="text-[11px] uppercase tracking-[0.18em] text-muted sm:text-xs">
            Commercial signal occupying the broadcast layer.
          </span>
        </div>
      </div>
    </div>
  );
}
