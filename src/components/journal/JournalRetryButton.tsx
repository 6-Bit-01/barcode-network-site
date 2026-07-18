"use client";

export function JournalRetryButton() {
  return <button onClick={() => window.location.reload()} className="mt-5 border border-accent px-4 py-2 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background">Retry</button>;
}
