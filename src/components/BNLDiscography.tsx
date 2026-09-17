/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import Form from "next/form";
import type { PublicBallad } from "@/lib/bnl-ballads";
import { broadcastArchiveShowHref } from "@/lib/broadcast-archive";
import { BalladLinkedText } from "@/components/BalladArtistLinks";
import { BalladTrackStory } from "@/components/BalladTrackStory";
import { BalladPlayback } from "@/components/BalladPlayback";
import { balladDateLabel, balladGenres, catalogFacets, catalogFilters, catalogPageHref, selectCatalog, type CatalogFilters } from "@/lib/ballad-catalog";

const field = "mt-1 w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-accent";

export function BNLDiscography({ releases, query = "", filters: supplied, unavailable = false }: {
  releases: PublicBallad[]; query?: string; filters?: CatalogFilters; unavailable?: boolean;
}) {
  const filters = supplied ?? catalogFilters({ q: query });
  const facets = catalogFacets(releases);
  const result = selectCatalog(releases, filters);
  const activeFilters = [filters.genre, filters.artist, filters.year, filters.from, filters.to].filter(Boolean).length;
  const groups = new Map<string, PublicBallad[]>();
  for (const release of result.entries) {
    const group = ["newest", "oldest"].includes(filters.sort) ? release.show.showDate.slice(0, 4) || "Undated" : "Songs";
    groups.set(group, [...(groups.get(group) ?? []), release]);
  }
  return <main className="mx-auto min-h-screen max-w-6xl px-4 pb-20 pt-28 sm:px-6">
    <Link href="/bnl" className="text-sm text-muted hover:text-accent">← BNL-01 Hub</Link>
    <header className="mt-6 border-b border-border pb-6">
      <p className="text-xs uppercase tracking-[0.35em] text-accent">BNL-01 · Original music</p>
      <h1 className="mt-3 text-4xl font-black tracking-tight text-foreground sm:text-5xl">Discography</h1>
      <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted">The released music of BNL-01. Songs, creative direction and the stories behind the work.</p>
    </header>
    <section className="mt-7" aria-labelledby="ballads-collection">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h2 id="ballads-collection" className="text-xl font-black text-foreground">Broadcast Ballads</h2><p className="mt-1 text-sm text-muted">Songs from BARCODE Radio. Play here, keep browsing, or download free for listening.</p></div>
        {!unavailable && <p className="text-xs text-accent">{releases.length} released {releases.length === 1 ? "song" : "songs"}</p>}
      </div>
      {!unavailable && releases.length > 0 && <Form key={JSON.stringify(filters)} action="/bnl/music" className="mt-5 rounded border border-border bg-surface p-4" role="search">
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-[180px] flex-1 text-xs text-muted">Search BNL’s discography<input type="search" name="q" defaultValue={filters.q} placeholder='Title, lyrics, person, topic… use "quotes" for phrases' className={field} /></label>
          <label className="text-xs text-muted">Sort<select aria-label="Sort" name="sort" defaultValue={filters.sort} className={field}><option value="newest">Newest show</option><option value="oldest">Oldest show</option><option value="published">Recently published</option><option value="title">Title A–Z</option></select></label>
          <button type="submit" className="min-h-11 rounded border border-accent px-5 py-2 text-sm font-bold text-accent hover:bg-accent/10">Search / Apply</button>
          {(filters.q || activeFilters > 0) && <Link href="/bnl/music" className="px-2 py-3 text-sm text-muted underline">Clear all</Link>}
        </div>
        <details open={activeFilters > 0} className="mt-4 border-t border-border pt-3"><summary className="cursor-pointer text-sm font-bold text-foreground">Filters{activeFilters > 0 ? ` · ${activeFilters} active` : " · genre, people & show dates"}</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <label className="text-xs text-muted">Genre / sound<select aria-label="Genre / sound" name="genre" defaultValue={filters.genre} className={field}><option value="">All sounds</option>{filters.genre && !facets.genres.some(item => item.value === filters.genre) && <option value={filters.genre}>{filters.genre} (0)</option>}{facets.genres.map(item => <option key={item.value} value={item.value}>{item.label} ({item.count})</option>)}</select></label>
            <label className="text-xs text-muted">Linked artist<select aria-label="Linked artist" name="artist" defaultValue={filters.artist} className={field}><option value="">All linked people</option>{filters.artist && !facets.artists.some(item => item.value === filters.artist) && <option value={filters.artist}>{filters.artist} (0)</option>}{facets.artists.map(item => <option key={item.value} value={item.value}>{item.label} ({item.count})</option>)}</select></label>
            <label className="text-xs text-muted">Show year<select aria-label="Show year" name="year" defaultValue={filters.year} className={field}><option value="">All years</option>{filters.year && !facets.years.includes(filters.year) && <option>{filters.year}</option>}{facets.years.map(year => <option key={year}>{year}</option>)}</select></label>
            <label className="text-xs text-muted">Shows from<input type="date" name="from" defaultValue={filters.from} className={field} /></label>
            <label className="text-xs text-muted">Shows through<input type="date" name="to" defaultValue={filters.to} className={field} /></label>
          </div>
          <p className="mt-3 text-xs text-muted">People filters use the song’s linked artist profiles, including people mentioned in the lyrics. Search also covers unlinked names, lyrics, credits and creative notes.</p>
        </details>
        {filters.from && filters.to && filters.from > filters.to && <p role="alert" className="mt-3 text-sm text-danger">The start date is after the end date. Adjust the show dates to find releases.</p>}
      </Form>}
      <div id="discography-results" className="scroll-mt-24">
        {unavailable ? <p role="status" className="mt-6 border border-border p-5 text-muted">The discography is temporarily unavailable. Please reload to try again.</p>
          : releases.length === 0 ? <p className="mt-6 border border-border p-5 text-muted">No songs have been published yet.</p>
          : <>
            <p role="status" className="my-4 text-xs text-muted">{result.total} matching {result.total === 1 ? "song" : "songs"}{result.total > 0 && ` · Page ${result.page} of ${result.pages}`}</p>
            {result.total === 0 ? <p className="border border-border p-5 text-muted">No releases match these search terms and filters. <Link href="/bnl/music" className="text-accent underline">View the full discography</Link></p> : [...groups].map(([year, entries]) => <details key={year} open className="mb-5 rounded border border-border">
              <summary className="cursor-pointer bg-surface px-4 py-3 font-bold text-foreground">{year} <span className="ml-2 text-xs font-normal text-muted">{entries.length} on this page</span></summary>
              <div className="divide-y divide-border">{entries.map(release => <ReleaseCard key={release.show.sessionId} release={release} />)}</div>
            </details>)}
            {result.pages > 1 && <nav aria-label="Discography pages" className="mt-5 flex items-center justify-between gap-4 text-sm">
              {result.page > 1 ? <Link href={catalogPageHref(filters, result.page - 1)} className="rounded border border-accent/40 px-4 py-3 text-accent">← Previous</Link> : <span />}
              <span className="text-muted">{result.page} / {result.pages}</span>
              {result.page < result.pages ? <Link href={catalogPageHref(filters, result.page + 1)} className="rounded border border-accent/40 px-4 py-3 text-accent">Next →</Link> : <span />}
            </nav>}
          </>}
      </div>
    </section>
  </main>;
}

function ReleaseCard({ release }: { release: PublicBallad }) {
  const showHref = `${broadcastArchiveShowHref(release.show.sessionId)}#broadcast-ballad`;
  const genres = balladGenres(release);
  return <article id={`release-${encodeURIComponent(release.show.sessionId)}`} className="scroll-mt-24 bg-background/40 p-4 sm:p-5">
    <div className="flex items-start gap-4">
      {release.presentation.artworkUrl ? <img src={release.presentation.artworkUrl} alt="" loading="lazy" className="h-16 w-16 shrink-0 rounded object-cover sm:h-20 sm:w-20" /> : <div aria-hidden="true" className="flex h-16 w-16 shrink-0 items-center justify-center rounded border border-accent/30 bg-accent/5 text-sm font-black text-accent sm:h-20 sm:w-20">BNL-01</div>}
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted"><time dateTime={release.show.showDate}>{balladDateLabel(release.show.showDate)}</time> · BNL-01</p>
        <h3 className="mt-1 break-words text-lg font-black leading-snug text-foreground sm:text-xl">{release.version.title}</h3>
        <p className="mt-2 text-xs text-accent">{genres.slice(0, 3).join(" · ")}{genres.length > 3 && ` · +${genres.length - 3}`}</p>
        <Link href={showHref} className="mt-2 inline-block text-xs text-muted underline underline-offset-4 hover:text-accent">{release.show.title} →</Link>
      </div>
    </div>
    <div className="mt-4"><BalladPlayback ballad={release} /></div>
    <details className="mt-4 border-t border-border pt-3"><summary className="cursor-pointer text-sm font-bold text-foreground">Song details · lyrics, people & credits</summary>
      <div className="mt-4 space-y-4">
        <p className="text-xs text-muted">Published {balladDateLabel(release.publishedAt)} · {release.presentation.credits}</p>
        {release.version.style && <section><h4 className="text-sm font-bold text-foreground">Sound & production</h4><p className="mt-2 whitespace-pre-wrap break-words text-sm text-muted">{release.version.style}</p></section>}
        <h4 className="text-sm font-bold text-foreground">BNL’s creative notes</h4>
        <BalladTrackStory notes={release.linerNotes} artistLinks={release.artistLinks} />
        <details><summary className="cursor-pointer text-sm font-bold text-accent">Lyrics</summary><p className="mt-4 whitespace-pre-wrap break-words text-sm leading-relaxed text-muted"><BalladLinkedText text={release.version.lyrics} artistLinks={release.artistLinks} /></p></details>
      </div>
    </details>
  </article>;
}
