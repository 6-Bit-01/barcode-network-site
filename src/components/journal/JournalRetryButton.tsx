"use client";

import { useRouter } from "next/navigation";

export function JournalRetryButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.refresh()}
      className="mt-5 inline-flex border border-accent px-4 py-2 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background"
    >
      Retry
    </button>
  );
}
