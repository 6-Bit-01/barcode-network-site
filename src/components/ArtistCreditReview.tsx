"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { ArtistCredit, ArtistCreditRevision } from "@/lib/artist-credits";
import { suggestCreditSplit } from "@/lib/artist-credits";
type Row = { sessionId: string; trackId: string; showTitle: string; title: string; original: string; credit: ArtistCredit; history: ArtistCreditRevision[] };
type Review = { revision: number; records: Row[] };
const input = "w-full min-w-0 rounded border border-border bg-background p-3 text-sm text-foreground";
const button = "rounded border border-border px-3 py-2 text-sm text-foreground hover:border-accent disabled:opacity-40";
export function ArtistCreditReview() {
  const [data, setData] = useState<Review | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Row | null>(null);
  const [primary, setPrimary] = useState("");
  const [features, setFeatures] = useState("");
  const [decision, setDecision] = useState<ArtistCredit["decision"]>("whole");
  const [all, setAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function load() { try { const response = await fetch("/api/admin/queue/artist-credits", { cache: "no-store" }); const next = await response.json(); if (!response.ok) throw new Error(next.error); setData(next); setError(""); } catch (e) { setError(e instanceof Error ? e.message : "Could not load credits."); } }
  useEffect(() => { void load(); }, []);
  function choose(row: Row) { setSelected(row); setPrimary(row.credit.primary); setFeatures(row.credit.collaborators.join(", ")); setDecision(row.credit.decision); setAll(false); setMessage(""); }
  async function save(undo = false) {
    if (!selected || !data) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/admin/queue/artist-credits", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision: data.revision, sessionId: selected.sessionId, trackId: selected.trackId, primary, collaborators: features, decision, applyToMatching: all, undo }) });
      const next = await response.json(); if (!response.ok) throw new Error(next.error);
      setData(next); const updated = next.records.find((row: Row) => row.sessionId === selected.sessionId && row.trackId === selected.trackId); if (updated) choose(updated);
      setMessage(`${undo ? "Restored previous credits for" : "Saved credits for"} ${next.changed} submission${next.changed === 1 ? "" : "s"}. Published song tags retain their saved labels; their existing artist links follow the corrected Archive identity.`);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save credits."); } finally { setBusy(false); }
  }
  const rows = data?.records.filter(row => `${row.original} ${row.credit.primary} ${row.title}`.toLowerCase().includes(query.toLowerCase())) ?? [];
  const matching = selected ? data?.records.filter(row => row.original.toLowerCase() === selected.original.toLowerCase()).length ?? 0 : 0;
  const split = selected && suggestCreditSplit(selected.original);
  return <div className="space-y-6"><div><Link href="/admin/ballads" className="text-sm text-accent">← Ballad workspace</Link><h1 className="mt-4 text-3xl font-black text-foreground">Artist credit corrections</h1><p className="mt-3 text-sm text-muted">Correct a full name, primary / featured credits, or an alias. Original submissions stay in history. These decisions organize artist cards; they do not verify ownership.</p></div>
    <div className="flex flex-wrap gap-3"><label className="min-w-0 flex-1"><span className="sr-only">Search artist credits</span><input className={input} value={query} onChange={e => setQuery(e.target.value)} placeholder="Search artist or track…" /></label><button className={button} onClick={() => void load()}>Reload credits</button></div>
    {error && <p role="alert" className="text-sm text-danger">{error}</p>}{message && <p role="status" className="text-sm text-accent">{message}</p>}
    <label className="block space-y-2 text-sm text-muted"><span>Submission to correct</span><select aria-label="Submission to correct" className={input} value={selected ? `${selected.sessionId}:${selected.trackId}` : ""} onChange={e => { const row = rows.find(row => `${row.sessionId}:${row.trackId}` === e.target.value); if (row) choose(row); }}><option value="">Choose a submission ({rows.length})</option>{rows.map(row => <option key={`${row.sessionId}:${row.trackId}`} value={`${row.sessionId}:${row.trackId}`}>{row.original} — {row.title} · {row.showTitle}</option>)}</select></label>
    {selected && <div className="space-y-4 rounded border border-border p-5"><p className="break-words text-sm text-muted">Original: <strong className="text-foreground">{selected.original}</strong> · {selected.credit.source === "inferred" ? "Suggested from an existing primary artist" : `Current decision: ${selected.credit.source}`}</p>
      <label className="block space-y-2 text-sm text-muted"><span>Correction type</span><select aria-label="Correction type" className={input} value={decision} onChange={e => { const value = e.target.value as ArtistCredit["decision"]; setDecision(value); if (value === "whole") { setPrimary(selected.original); setFeatures(""); } else if (value === "split" && split) { setPrimary(split.primary); setFeatures(split.collaborators.join(", ")); } }}><option value="whole">Keep as one artist / keep separate</option><option value="split">Set primary and featured artists</option><option value="alias">Alias / merge into an artist card</option></select></label>
      <label className="block space-y-2 text-sm text-muted"><span>Primary artist</span><input className={input} list="credit-primary-artists" maxLength={200} value={primary} onChange={e => setPrimary(e.target.value)} /></label><datalist id="credit-primary-artists">{[...new Set(data?.records.map(row => row.credit.primary))].sort().map(name => <option key={name} value={name} />)}</datalist>
      <label className="block space-y-2 text-sm text-muted"><span>Featured / collaborators</span><input className={input} maxLength={1000} value={features} onChange={e => setFeatures(e.target.value)} placeholder="Separate artists with commas" /></label>
      <p className="text-sm text-muted">Preview: <strong className="text-foreground">{primary || "Choose a primary artist"}</strong>{features && ` · Featuring ${features}`}</p>
      <label className="flex gap-3 text-sm text-muted"><input type="checkbox" checked={all} onChange={e => setAll(e.target.checked)} />Apply to all {matching} submissions using this original artist label</label>
      <div className="flex flex-wrap gap-3"><button className={`${button} border-accent text-accent`} disabled={busy || !primary.trim()} onClick={() => void save()}>Save credit correction</button><button className={button} disabled={busy || !selected.history.length} onClick={() => void save(true)}>Undo last correction</button></div>
      <details className="text-sm text-muted"><summary className="cursor-pointer">Correction history ({selected.history.length})</summary>{selected.history.map((revision, i) => <p className="mt-2" key={i}>{revision.at}: previous credits — {revision.credit ? `${revision.credit.primary}${revision.credit.collaborators.length ? ` · ${revision.credit.collaborators.join(", ")}` : ""}` : "Original submitted credits"}</p>)}</details>
    </div>}
  </div>;
}
