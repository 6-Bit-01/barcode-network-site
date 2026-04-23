"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

function SuccessContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const [status, setStatus] = useState<"loading" | "success" | "already" | "error">("loading");

  useEffect(() => {
    if (!sessionId) {
      setStatus("error");
      return;
    }

    // Confirm payment with Stripe and add entry to queue
    // Deduplicates with webhook — safe to call even if webhook already fired
    async function confirmPayment() {
      try {
        const res = await fetch("/api/queue/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });

        if (res.ok) {
          const data = await res.json();
          setStatus(data.status === "already_queued" ? "already" : "success");
        } else {
          // 402 = not paid yet, retry after short delay (Stripe may still be processing)
          if (res.status === 402) {
            setTimeout(confirmPayment, 2000);
            return;
          }
          setStatus("error");
        }
      } catch {
        setStatus("error");
      }
    }

    confirmPayment();
  }, [sessionId]);

  if (status === "loading") {
    return (
      <div className="pt-14 min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-accent animate-pulse uppercase tracking-widest">
            Processing...
          </p>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="pt-14 min-h-screen flex items-center justify-center">
        <div className="text-center max-w-md mx-auto px-4">
          <p className="text-xs uppercase tracking-[0.5em] text-danger mb-4">
            // ERROR
          </p>
          <h1 className="text-2xl font-bold text-foreground mb-4">
            Session Not Found
          </h1>
          <p className="text-sm text-muted mb-8">
            No payment session detected. If you completed a payment and are
            seeing this, your track will still be queued.
          </p>
          <Link
            href="/queue"
            className="inline-flex items-center justify-center px-6 py-3 text-sm uppercase tracking-widest font-bold border border-accent text-accent hover:bg-accent/10 transition-all"
          >
            ← Back to Queue
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-14 min-h-screen flex items-center justify-center">
      <div className="text-center max-w-md mx-auto px-4">
        <div className="mb-6">
          <span className="inline-flex items-center justify-center w-16 h-16 border-2 border-accent rounded-full mb-4">
            <span className="text-2xl text-accent">✓</span>
          </span>
        </div>

        <p className="text-xs uppercase tracking-[0.5em] text-accent mb-4">
          // PAYMENT CONFIRMED
        </p>
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-4">
          Request Queued
        </h1>
        <p className="text-sm text-muted leading-relaxed mb-2">
          Your track has been added to the AI stream queue.
          It will play based on your tier priority.
        </p>

        {/* Tier info */}
        <div className="border border-accent/20 bg-accent/5 p-4 mt-6 mb-8 text-left">
          <p className="text-xs text-muted uppercase tracking-wider mb-2">
            Receipt
          </p>
          <p className="text-xs text-muted font-mono">
            Session: {sessionId?.slice(0, 20)}...
          </p>
          <p className="text-xs text-muted/50 mt-1">
            Paid requests are guaranteed plays. If your track doesn&apos;t play
            before the nightly reset, it carries over to the next day.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/queue"
            className="inline-flex items-center justify-center px-6 py-3 text-sm uppercase tracking-widest font-bold bg-accent text-background hover:bg-accent-dim transition-all"
          >
            View Queue
          </Link>
          <Link
            href="/radio"
            className="inline-flex items-center justify-center px-6 py-3 text-sm uppercase tracking-widest font-bold border border-border text-foreground/80 hover:border-accent hover:text-accent transition-all"
          >
            BARCODE Radio →
          </Link>
        </div>

        {/* Terminal readout */}
        <div className="mt-12 text-left max-w-xs mx-auto">
          <p className="text-xs text-muted/30 font-mono">
            QUEUE_SYSTEM ................ CONFIRMED
          </p>
          <p className="text-xs text-muted/30 font-mono">
            PAYMENT ..................... VERIFIED
          </p>
          <p className="text-xs text-muted/30 font-mono">
            ENTRY_STATUS ................ QUEUED
          </p>
          <p className="text-xs text-muted/30 font-mono">
            PLAY_GUARANTEE .............. ACTIVE
          </p>
        </div>
      </div>
    </div>
  );
}

export default function QueueSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="pt-14 min-h-screen flex items-center justify-center">
          <p className="text-sm text-accent animate-pulse uppercase tracking-widest">
            Processing...
          </p>
        </div>
      }
    >
      <SuccessContent />
    </Suspense>
  );
}