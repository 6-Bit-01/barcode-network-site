/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type RecoveryWindow = {
  label: string;
  startInclusive: string;
  endExclusive?: string;
  endInclusive?: string;
  count: number;
};

type RecoveryUpload = {
  pathname: string;
  uploadedAt: string;
  size: number;
  contentType?: string;
  recoveryWindow: string;
  clientEpochMs: number | null;
  clientEpochAt: string | null;
  epochPrefixDeltaMs: number | null;
  epochPrefixDiscrepancy: boolean;
};

type RecoveryInventory = {
  readOnly: true;
  complete: true;
  truncated: false;
  prefix: string;
  listCalls: number;
  windows: RecoveryWindow[];
  count: number;
  uploads: RecoveryUpload[];
};

type RecoveryError = {
  error?: string;
  reason?: string;
  readOnly?: boolean;
};

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const unitIndex = Math.min(
    Math.floor(Math.log(value) / Math.log(1024)),
    units.length - 1,
  );
  const amount = value / 1024 ** unitIndex;
  return `${amount.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

export default function QueueRecoveryUploadsPage() {
  const [inventory, setInventory] = useState<RecoveryInventory | null>(null);
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadInventory() {
      try {
        const response = await fetch("/api/admin/queue/recovery/uploads", {
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
              : "Upload recovery inventory failed to load.",
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

  const totalBytes =
    inventory?.uploads.reduce((total, upload) => total + upload.size, 0) ?? 0;
  const discrepancyCount =
    inventory?.uploads.filter((upload) => upload.epochPrefixDiscrepancy).length ?? 0;

  return (
    <main className="min-h-screen pt-14">
      <section className="border-b border-border noise-bg">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <p className="text-xs uppercase tracking-[0.45em] text-accent">
            {"// ADMIN: QUEUE RECOVERY"}
          </p>
          <h1 className="mt-3 text-3xl font-bold text-foreground sm:text-4xl">
            Upload recovery inventory
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-muted">
            Read-only metadata from the existing private BARCODE Radio upload store.
            This view does not download, change, move, or delete any Blob or queue data.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
        {loading && (
          <p className="border border-border bg-surface p-5 text-xs uppercase tracking-[0.35em] text-muted animate-pulse">
            Loading recovery inventory…
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
                <p className="text-xs uppercase tracking-widest text-muted">Uploads</p>
                <p className="mt-2 text-2xl font-bold text-foreground">{inventory.count}</p>
              </div>
              <div className="border border-border bg-surface p-4">
                <p className="text-xs uppercase tracking-widest text-muted">Total size</p>
                <p className="mt-2 text-2xl font-bold text-foreground">{formatBytes(totalBytes)}</p>
              </div>
              <div className="border border-border bg-surface p-4">
                <p className="text-xs uppercase tracking-widest text-muted">Epoch flags</p>
                <p className="mt-2 text-2xl font-bold text-foreground">{discrepancyCount}</p>
              </div>
              <div className="border border-accent/50 bg-surface p-4">
                <p className="text-xs uppercase tracking-widest text-accent">Inventory state</p>
                <p className="mt-2 text-sm font-bold uppercase tracking-wider text-accent">
                  {inventory.readOnly && inventory.complete && !inventory.truncated
                    ? "Complete · read only"
                    : "Review required"}
                </p>
              </div>
            </section>

            <section className="border border-border bg-surface p-5">
              <h2 className="text-sm font-bold uppercase tracking-widest text-foreground">
                Recovery windows
              </h2>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                {inventory.windows.map((window) => (
                  <div key={window.label} className="border border-border p-4">
                    <p className="text-xs uppercase tracking-wider text-muted">
                      {window.label.replaceAll("_", " ")}
                    </p>
                    <p className="mt-2 text-2xl font-bold text-foreground">{window.count}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="space-y-3">
              <div>
                <h2 className="text-sm font-bold uppercase tracking-widest text-foreground">
                  Machine-readable inventory
                </h2>
                <p className="mt-2 text-xs text-muted">
                  Safe metadata only. Blob URLs, tokens, and file contents are not included.
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
