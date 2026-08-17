/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type RecoveryLineItem = {
  description: string;
  descriptionSource: "product_description" | "line_item_description";
};

type RecoveryCheckoutSession = {
  sessionId: string;
  status: string | null;
  paymentStatus: string | null;
  amountTotal: number | null;
  currency: string | null;
  created: string;
  metadata: {
    source: "barcode-radio-priority-signal";
    trackId: string | null;
    queueSessionId: string | null;
  };
  lineItems: RecoveryLineItem[];
};

type RecoveryInventory = {
  readOnly: true;
  complete: true;
  truncated: false;
  source: "barcode-radio-priority-signal";
  window: {
    startInclusive: string;
    endInclusive: string;
  };
  sessionListCalls: number;
  lineItemListCalls: number;
  count: number;
  sessions: RecoveryCheckoutSession[];
};

type RecoveryError = {
  error?: string;
  reason?: string;
};

export default function QueueRecoveryPriorityCheckoutsPage() {
  const [inventory, setInventory] = useState<RecoveryInventory | null>(null);
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadInventory() {
      try {
        const response = await fetch("/api/admin/queue/recovery/priority-checkouts", {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => ({}))) as
          | RecoveryInventory
          | RecoveryError;

        if (cancelled) return;
        if (response.status === 401) {
          setUnauthorized(true);
          return;
        }
        if (!response.ok) {
          const failure = payload as RecoveryError;
          throw new Error(
            failure.error || failure.reason || `Inventory request failed (${response.status})`,
          );
        }
        setInventory(payload as RecoveryInventory);
      } catch (caught) {
        if (!cancelled) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Priority checkout recovery inventory failed to load.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadInventory();
    return () => {
      cancelled = true;
    };
  }, []);

  const paidCount =
    inventory?.sessions.filter((session) => session.paymentStatus === "paid").length ?? 0;
  const exactIdentityCount =
    inventory?.sessions.filter((session) =>
      session.lineItems.some((item) => item.descriptionSource === "product_description"),
    ).length ?? 0;

  return (
    <main className="min-h-screen pt-14">
      <section className="border-b border-border noise-bg">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <p className="text-xs uppercase tracking-[0.45em] text-accent">
            {"// ADMIN: QUEUE RECOVERY"}
          </p>
          <h1 className="mt-3 text-3xl font-bold text-foreground sm:text-4xl">
            Priority checkout recovery inventory
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-muted">
            Read-only, non-customer evidence from live Priority Signal checkout sessions in
            the fixed August recovery window. This view does not create, update, refund, or
            cancel any Stripe object or change the queue.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
        {loading && (
          <p className="border border-border bg-surface p-5 text-xs uppercase tracking-[0.35em] text-muted animate-pulse">
            Loading priority recovery inventory…
          </p>
        )}

        {unauthorized && (
          <section className="border border-danger/50 bg-surface p-6">
            <p className="text-xs uppercase tracking-[0.35em] text-danger">
              Admin access required
            </p>
            <p className="mt-3 text-sm text-muted">
              Authenticate through the admin panel, then return to this private view.
            </p>
            <Link
              href="/admin"
              className="mt-5 inline-flex border border-accent px-4 py-2 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background transition-all"
            >
              Open Admin Login
            </Link>
          </section>
        )}

        {error && (
          <section className="border border-danger/50 bg-danger/10 p-5">
            <p className="text-xs uppercase tracking-[0.35em] text-danger">
              Inventory unavailable
            </p>
            <p className="mt-3 text-sm text-danger">{error}</p>
          </section>
        )}

        {inventory && (
          <>
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="border border-border bg-surface p-4">
                <p className="text-xs uppercase tracking-widest text-muted">Checkouts</p>
                <p className="mt-2 text-2xl font-bold text-foreground">{inventory.count}</p>
              </div>
              <div className="border border-border bg-surface p-4">
                <p className="text-xs uppercase tracking-widest text-muted">Paid</p>
                <p className="mt-2 text-2xl font-bold text-foreground">{paidCount}</p>
              </div>
              <div className="border border-border bg-surface p-4">
                <p className="text-xs uppercase tracking-widest text-muted">
                  Exact product descriptions
                </p>
                <p className="mt-2 text-2xl font-bold text-foreground">
                  {exactIdentityCount}
                </p>
              </div>
              <div className="border border-accent/50 bg-surface p-4">
                <p className="text-xs uppercase tracking-widest text-accent">
                  Inventory state
                </p>
                <p className="mt-2 text-sm font-bold uppercase tracking-wider text-accent">
                  {inventory.readOnly && inventory.complete && !inventory.truncated
                    ? "Complete · read only"
                    : "Review required"}
                </p>
              </div>
            </section>

            <section className="border border-border bg-surface p-5 text-sm leading-6 text-muted">
              <p>
                A product description is the strongest Stripe identity evidence because the
                checkout creation code stored the submitted artist and title there. A value
                labeled <code>line_item_description</code> may be only a generic fallback and
                must not be treated as an exact identity. Checkout evidence does not prove
                playback.
              </p>
            </section>

            <section className="space-y-3">
              <div>
                <h2 className="text-sm font-bold uppercase tracking-widest text-foreground">
                  Machine-readable inventory
                </h2>
                <p className="mt-2 text-xs text-muted">
                  Customer details, addresses, payment methods, checkout URLs, and secrets are
                  not included.
                </p>
              </div>
              <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-all border border-border bg-black/40 p-4 text-xs leading-5 text-muted">
                {JSON.stringify(inventory, null, 2)}
              </pre>
            </section>
          </>
        )}
      </section>
    </main>
  );
}
