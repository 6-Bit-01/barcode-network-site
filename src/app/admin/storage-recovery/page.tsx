"use client";

import { useState } from "react";

type Report = Record<string, unknown> & { estimatedReclaimableBytes?: number; supersededArchiveIdsEligibleForCleanup?: string[]; orphanedArchiveManifestIds?: string[]; orphanedArchiveChunkKeys?: string[] };

function numberValue(value: unknown): string { return typeof value === "number" ? value.toLocaleString() : "0"; }

export default function StorageRecoveryPage() {
  const [analysis, setAnalysis] = useState<Report | null>(null);
  const [result, setResult] = useState<Report | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function analyze() {
    setLoading("analyze"); setError(null); setResult(null);
    try { const res = await fetch("/api/admin/storage-recovery", { cache: "no-store" }); const payload = await res.json(); if (!res.ok) throw new Error(payload.reason || payload.error || "analysis_failed"); setAnalysis(payload); }
    catch (err) { setError(err instanceof Error ? err.message : "Analysis failed"); }
    finally { setLoading(null); }
  }

  async function cleanup() {
    if (!analysis) return;
    const ok = window.confirm("Delete only superseded BARCODE dossier Source File archive keys? Queue, relay, presence, overlay, payment, flags, workflow state, and unrelated keys are not deletable by this action.");
    if (!ok) return;
    setLoading("cleanup"); setError(null);
    try { const res = await fetch("/api/admin/storage-recovery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "cleanupSupersededSourceFileArchives", confirmation: "CLEAN SUPERSEDED SOURCE FILE ARCHIVES" }) }); const payload = await res.json(); if (!res.ok && res.status !== 207) throw new Error(payload.reason || payload.error || "cleanup_failed"); setResult(payload); }
    catch (err) { setError(err instanceof Error ? err.message : "Cleanup failed"); }
    finally { setLoading(null); }
  }

  const reclaim = analysis?.estimatedReclaimableBytes;
  return <main className="pt-14 min-h-screen"><section className="mx-auto max-w-5xl px-4 py-12 space-y-6"><div><p className="text-xs uppercase tracking-[0.45em] text-accent">{"// Admin Storage Recovery"}</p><h1 className="mt-3 text-3xl font-bold text-foreground">Redis Storage Recovery</h1><p className="mt-2 text-sm text-muted">Dry-run first. Cleanup is explicit and restricted to barcode:dossier-source-file-archive:v1:* archive manifests and chunks.</p></div><div className="flex flex-wrap gap-3"><button onClick={analyze} disabled={Boolean(loading)} className="border border-accent px-4 py-2 text-xs uppercase tracking-widest text-accent disabled:opacity-50">{loading === "analyze" ? "Analyzing…" : "Analyze Redis Storage"}</button><button onClick={cleanup} disabled={!analysis || Boolean(loading)} className="border border-danger px-4 py-2 text-xs uppercase tracking-widest text-danger disabled:opacity-50">{loading === "cleanup" ? "Cleaning…" : "Clean Superseded Source File Archives"}</button></div>{error && <p className="border border-danger/50 bg-danger/10 p-3 text-sm text-danger">{error}</p>}{analysis && <section className="grid gap-3 md:grid-cols-3"><div className="border border-border p-4"><p className="text-xs uppercase text-muted">Total keys</p><p className="text-2xl font-bold">{numberValue(analysis.totalKeyCount)}</p></div><div className="border border-border p-4"><p className="text-xs uppercase text-muted">Archive manifests</p><p className="text-2xl font-bold">{numberValue(analysis.dossierSourceFileArchiveManifestCount)}</p></div><div className="border border-border p-4"><p className="text-xs uppercase text-muted">Estimated reclaim</p><p className="text-2xl font-bold">{numberValue(reclaim)} bytes</p></div><pre className="md:col-span-3 max-h-96 overflow-auto border border-border bg-black/40 p-4 text-xs text-muted">{JSON.stringify(analysis, null, 2)}</pre></section>}{result && <section className="space-y-3"><h2 className="text-xl font-bold text-foreground">Final cleanup report</h2><pre className="max-h-96 overflow-auto border border-border bg-black/40 p-4 text-xs text-muted">{JSON.stringify(result, null, 2)}</pre></section>}</section></main>;
}
