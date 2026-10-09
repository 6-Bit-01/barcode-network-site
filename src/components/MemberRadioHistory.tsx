"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { MemberRadioHistoryResponse } from "@/lib/member-artists";

const factLabel = (value: string) => value.replaceAll("_", " ");
export function MemberRadioHistory({ memberId, compact = false }: { memberId?: string; compact?: boolean }) {
  const [data, setData] = useState<MemberRadioHistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [guest, setGuest] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    async function readHistory() {
      controller.current?.abort();
      const current = new AbortController(); controller.current = current;
      setData(null); setLoading(true); setError(""); setGuest(false);
      try {
        const response = await fetch("/api/member/radio-history", { credentials: "same-origin", cache: "no-store", signal: current.signal });
        if (current.signal.aborted) return;
        if (response.status === 401) { setGuest(true); return; }
        if (!response.ok) throw new Error("UNAVAILABLE");
        const value: MemberRadioHistoryResponse = await response.json();
        if (current.signal.aborted) return;
        if (!value.user?.id || (memberId && value.user.id !== memberId) || !(Date.parse(value.session?.expiresAt) > Date.now()) || !Array.isArray(value.artists) || !value.history || !Array.isArray(value.history.tracks)) throw new Error("UNAVAILABLE");
        setData(value);
      } catch { if (!current.signal.aborted) setError("Your private show history is unavailable. Return to your account or refresh when the service is available."); }
      finally { if (!current.signal.aborted) setLoading(false); }
    }
    void readHistory();
    window.addEventListener("focus", readHistory); window.addEventListener("pageshow", readHistory);
    return () => { controller.current?.abort(); window.removeEventListener("focus", readHistory); window.removeEventListener("pageshow", readHistory); };
  }, [memberId, refresh]);

  return <section aria-label="Private Artist and show history" className="rounded border border-border bg-surface p-4 sm:p-5">
    <h2 className="text-lg font-bold">Artist &amp; show participation</h2>
    <p className="mt-2 text-sm text-muted">Signed-in submissions and Owner-approved Artist history follow your account across devices.</p>
    {loading && <p className="mt-3 text-sm" role="status">Checking your private history…</p>}
    {guest && <p className="mt-3 text-sm text-muted"><Link href="/account" className="text-accent underline">Sign in</Link> to see your private history. Guest music submissions stay open.</p>}
    {error && <div className="mt-3 text-sm text-muted"><p role="alert">{error}</p><button className="mt-2 text-accent underline" disabled={loading} onClick={() => setRefresh(value => value + 1)}>Refresh private history</button></div>}
    {data && <>
      <div className="mt-4"><h3 className="font-semibold">Approved Artist projects</h3>{data.artists.length ? <ul className="mt-2 flex flex-wrap gap-2">{data.artists.map(artist => <li key={artist.id} className="rounded border border-border px-3 py-2 text-sm">{artist.archiveHref ? <Link href={artist.archiveHref} className="text-accent underline">{artist.projectLabel ?? artist.projectKey}</Link> : artist.projectLabel ?? artist.projectKey}</li>)}</ul> : <p className="mt-2 text-sm text-muted">No Artist project has been approved for this account. Your own signed-in submissions still appear here.</p>}</div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">{([['Submitted', data.history.totals.submitted], ['Shows', data.history.totals.shows], ['Finished outcomes', data.history.totals.finished], ['Skipped', data.history.totals.skipped], ['Removed', data.history.totals.removed], ['Unknown outcomes', data.history.totals.unknown]] as const).map(([label, value]) => <div key={label} className="rounded border border-border p-3"><p className="text-xs text-muted">{label}</p><p className="mt-1 text-xl font-bold">{value}</p></div>)}</div>
      <p className="mt-2 text-xs text-muted">A finished outcome does not prove full airplay. Older records can have partial coverage or unknown playback.</p>
      {data.history.currentShow && <p className="mt-4 text-sm"><strong>{data.history.currentShow.label}</strong> · {data.history.currentShow.submitted} submitted · {data.history.currentShow.active} active · {data.history.currentShow.finished} finished outcomes · {data.history.currentShow.unknown} unknown outcomes</p>}
      <ul className="mt-4 space-y-3" aria-label="Your show participation">{(compact ? data.history.tracks.slice(0, 5) : data.history.tracks).map(track => <li key={track.key} className="rounded border border-border p-3"><p className="font-semibold">{track.title}</p><p className="mt-1 text-sm">{track.artist}</p><p className="mt-2 text-xs text-muted">{track.showLabel} · {track.showDate}{track.currentShow ? " · Current show" : ""}</p><p className="mt-1 text-xs text-muted">Outcome: {factLabel(track.status)} · Airplay: {factLabel(track.airplay)} · Completion: {factLabel(track.completion)} · Coverage: {factLabel(track.coverage)}</p></li>)}</ul>
      {!data.history.tracks.length && <p className="mt-4 text-sm text-muted">No approved show participation is available yet.</p>}
      {compact ? <p className="mt-3 text-xs text-muted">Showing up to five recent songs. <Link href="/account" className="text-accent underline">Open your account for full private history</Link>.</p> : data.history.truncated && <p className="mt-3 text-xs text-muted">Showing the latest 100 songs. Totals include all eligible records.</p>}
    </>}
  </section>;
}
