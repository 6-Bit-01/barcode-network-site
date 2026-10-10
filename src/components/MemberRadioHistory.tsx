"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { MemberRadioHistoryResponse } from "@/lib/member-artists";
import { memberHistoryView } from "@/lib/member-history-view";

const factLabel = (value: string) => value.replaceAll("_", " ");
export function MemberRadioHistory({ memberId, compact = false }: { memberId?: string; compact?: boolean }) {
  const [data, setData] = useState<MemberRadioHistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [guest, setGuest] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [showFilter, setShowFilter] = useState("");
  const [search, setSearch] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    async function readHistory() {
      controller.current?.abort();
      const current = new AbortController(); controller.current = current;
      setData(null); setLoading(true); setError(""); setGuest(false); setShowFilter(""); setSearch("");
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

  // A changed account cannot render the old account's cached songs before its
  // effect runs. Focus/pageshow still revalidate grants through the same API.
  const historyData = data && (!memberId || data.user.id === memberId) ? data : null;
  const view = historyData && !compact ? memberHistoryView(historyData.history.tracks, showFilter, search) : null;
  const filtered = Boolean(showFilter || search.trim());

  return <section aria-label="Private Artist and show history" className={compact ? "rounded border border-border bg-surface p-4 sm:p-5" : "account-workspace rounded-xl border border-border bg-surface p-4 sm:p-6"}>
    <h2 className="text-lg font-bold">Artist &amp; show participation</h2>
    <p className="mt-2 text-sm text-muted">Signed-in submissions and Owner-approved Artist history follow your account across devices.</p>
    {loading && <p className="mt-3 text-sm" role="status">Checking your private history…</p>}
    {guest && <p className="mt-3 text-sm text-muted"><Link href="/account" className="text-accent underline">Sign in</Link> to see your private history. Guest music submissions stay open.</p>}
    {error && <div className="mt-3 text-sm text-muted"><p role="alert">{error}</p><button className="mt-2 text-accent underline" disabled={loading} onClick={() => setRefresh(value => value + 1)}>Refresh private history</button></div>}
    {historyData && <>
      <div className="mt-5">
        <h3 className="font-semibold">Approved Artist projects</h3>
        {historyData.artists.length ? <ul aria-label="Approved Artist projects" className={compact ? "mt-2 flex flex-wrap gap-2" : "mt-3 grid gap-3 sm:grid-cols-2"}>
          {historyData.artists.map(artist => <li key={artist.id} className={compact ? "rounded border border-border px-3 py-2 text-sm" : "relative min-w-0 overflow-hidden rounded-lg border border-accent/30 bg-background p-4"}>
            {!compact && <><span className="absolute inset-y-0 left-0 w-1 bg-accent" aria-hidden="true" /><p className="text-xs font-semibold uppercase tracking-wider text-accent">Approved Artist</p></>}
            <p className={compact ? "" : "mt-2 break-words text-lg font-bold"}>{artist.archiveHref ? <Link href={artist.archiveHref} className="text-accent underline decoration-accent/40 underline-offset-4">{artist.projectLabel ?? artist.projectKey}</Link> : artist.projectLabel ?? artist.projectKey}</p>
            {!compact && <p className="mt-2 text-xs text-muted">{artist.archiveHref ? "Explore this project’s existing Artist archive." : "No Artist archive link is available for this approved project."}</p>}
          </li>)}
        </ul> : <p className="mt-2 text-sm text-muted">No Artist project has been approved for this account. Your own signed-in submissions still appear here.</p>}
      </div>
      <div aria-label="All eligible participation totals" className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">{([['Submitted', historyData.history.totals.submitted], ['Shows', historyData.history.totals.shows], ['Finished outcomes', historyData.history.totals.finished], ['Skipped', historyData.history.totals.skipped], ['Removed', historyData.history.totals.removed], ['Unknown outcomes', historyData.history.totals.unknown]] as const).map(([label, value]) => <div key={label} className="rounded-lg border border-border bg-background/40 p-3"><p className="text-xs text-muted">{label}</p><p className="mt-1 text-xl font-bold tabular-nums">{value}</p></div>)}</div>
      <p className="mt-2 text-xs text-muted">A finished outcome does not prove full airplay. Older records can have partial coverage or unknown playback.</p>
      {historyData.history.currentShow && <p className="mt-4 text-sm"><strong>{historyData.history.currentShow.label}</strong> · {historyData.history.currentShow.submitted} submitted · {historyData.history.currentShow.active} active · {historyData.history.currentShow.finished} finished outcomes · {historyData.history.currentShow.unknown} unknown outcomes</p>}
      {compact ? <ul className="mt-4 space-y-3" aria-label="Your show participation">{historyData.history.tracks.slice(0, 5).map(track => <li key={track.key} className="rounded border border-border p-3"><p className="font-semibold">{track.title}</p><p className="mt-1 text-sm">{track.artist}</p><p className="mt-2 text-xs text-muted">{track.showLabel} · {track.showDate}{track.currentShow ? " · Current show" : ""}</p><p className="mt-1 text-xs text-muted">Outcome: {factLabel(track.status)} · Airplay: {factLabel(track.airplay)} · Completion: {factLabel(track.completion)} · Coverage: {factLabel(track.coverage)}</p></li>)}</ul> : view && <>
        {historyData.history.tracks.length > 0 && <div className="mt-6 rounded-lg border border-border bg-background/40 p-4">
          <h3 className="font-semibold">Your show history</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="min-w-0 text-sm">Show<select aria-label="Filter history by show" value={showFilter} onChange={event => setShowFilter(event.target.value)} className="mt-1 block w-full rounded border border-border bg-background px-3 py-2 text-foreground"><option value="">All available shows</option>{view.allGroups.map(group => <option key={group.key} value={group.key}>{group.label} · {group.date} · {group.recordLabel}</option>)}</select></label>
            <label className="min-w-0 text-sm">Song or Artist <span className="text-xs text-muted">(optional)</span><input type="search" aria-label="Search history by song or Artist" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search available songs" className="mt-1 block w-full rounded border border-border bg-background px-3 py-2 text-foreground" /></label>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><p role="status" className="text-xs text-muted">{filtered ? `${view.visibleSongs} of ${historyData.history.tracks.length} available songs match` : `${historyData.history.tracks.length} available songs`}. Totals above cover all eligible records.</p><button type="button" className="btn-secondary text-sm" onClick={() => { setShowFilter(""); setSearch(""); }} disabled={!showFilter && !search}>Reset filters</button></div>
        </div>}
        <div className="mt-4 space-y-5">
          {view.groups.map(group => <section key={group.key} aria-label={`History for ${group.label} ${group.date} ${group.recordLabel}`} className="overflow-hidden rounded-lg border border-border">
            <div className="border-b border-border bg-background/50 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-bold">{group.label}</h4><span className="rounded border border-border px-2 py-1 text-xs text-muted">{group.recordLabel}</span></div><p className="mt-1 text-xs text-muted">{group.date}{group.currentShow ? " · Current show" : ""} · {group.tracks.length} {filtered ? "matching" : "listed"} {group.tracks.length === 1 ? "song" : "songs"}</p></div>
            <ul aria-label="Songs in this show record" className="divide-y divide-border">{group.tracks.map(track => <li key={track.key} className="p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><p className="break-words font-semibold">{track.title}</p><p className="mt-1 break-words text-sm text-muted">{track.artist}</p></div><span className={`rounded-full border px-2.5 py-1 text-xs ${track.status === "active" ? "border-accent/40 text-accent" : "border-border text-muted"}`}>Outcome: {factLabel(track.status)}</span></div><details className="mt-3 text-xs text-muted"><summary className="cursor-pointer text-foreground">Playback &amp; coverage details</summary><div className="mt-2 space-y-1 border-l border-border pl-3"><p>{track.source === "historical" ? "Historical record" : "Native show record"}</p><p>Airplay: {factLabel(track.airplay)}</p><p>Completion: {factLabel(track.completion)}</p><p>Coverage: {factLabel(track.coverage)}</p></div></details></li>)}</ul>
          </section>)}
        </div>
        {historyData.history.tracks.length > 0 && view.groups.length === 0 && <p className="mt-4 rounded-lg border border-border p-4 text-sm text-muted">No songs match these filters. Try another show or reset your filters.</p>}
      </>}
      {!historyData.history.tracks.length && <p className="mt-4 text-sm text-muted">No approved show participation is available yet.</p>}
      {compact ? <p className="mt-3 text-xs text-muted">Showing up to five recent songs. <Link href="/account" className="text-accent underline">Open your account for full private history</Link>.</p> : historyData.history.truncated && <p className="mt-3 text-xs text-muted">Showing the latest 100 songs. Totals include all eligible records. Filters apply to these available songs.</p>}
    </>}
  </section>;
}
