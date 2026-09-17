/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import type { PublicBallad } from "@/lib/bnl-ballads";
import { broadcastArchiveShowHref } from "@/lib/broadcast-archive";
import { BalladLinkedText } from "@/components/BalladArtistLinks";

function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric", timeZone: "UTC",
  });
}

export function BNLDiscography({ releases, query = "", unavailable = false }: {
  releases: PublicBallad[];
  query?: string;
  unavailable?: boolean;
}) {
  const term = query.trim().toLocaleLowerCase();
  const visible = releases.filter(release => [
    release.version.title, release.version.style, release.show.title,
    ...Object.values(release.linerNotes ?? {}),
    ...release.artistLinks.map(link => `${link.name} ${link.projectLabel}`),
  ].join(" ").toLocaleLowerCase().includes(term)).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

  return <main className="mx-auto min-h-screen max-w-6xl px-4 pb-20 pt-28 sm:px-6">
    <Link href="/bnl" className="text-sm text-muted hover:text-accent">← BNL-01 Hub</Link>
    <header className="mt-8 border-b border-border pb-9">
      <p className="text-xs uppercase tracking-[0.35em] text-accent">BNL-01 · Original music</p>
      <h1 className="mt-4 text-4xl font-black tracking-tight text-foreground sm:text-6xl">Discography</h1>
      <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted">The released music of BNL-01. Songs, creative direction and the stories behind the work.</p>
    </header>

    <section className="mt-10" aria-labelledby="ballads-collection">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <h2 id="ballads-collection" className="text-2xl font-black text-foreground">Broadcast Ballads</h2>
          <p className="mt-2 text-sm text-muted">Songs drawn from the music, people and moments of BARCODE Radio.</p>
        </div>
        {!unavailable && <p className="text-xs uppercase tracking-widest text-accent">{releases.length} released {releases.length === 1 ? "song" : "songs"}</p>}
      </div>
      {!unavailable && releases.length > 0 && <form action="/bnl/music" className="mt-6 flex flex-wrap gap-2" role="search">
        <label className="min-w-0 flex-1"><span className="sr-only">Search BNL’s discography</span><input type="search" name="q" defaultValue={query} placeholder="Search titles, sound, people or broadcasts…" className="w-full rounded border border-border bg-background px-4 py-3 text-sm text-foreground focus:border-accent" /></label>
        <button type="submit" className="rounded border border-accent px-4 py-3 text-sm font-bold text-accent hover:bg-accent/10">Search</button>
        {term && <Link href="/bnl/music" className="px-3 py-3 text-sm text-muted underline">Clear</Link>}
      </form>}

      {unavailable ? <p role="status" className="mt-8 border border-border p-6 text-muted">The discography is temporarily unavailable. Please reload to try again.</p>
        : releases.length === 0 ? <p className="mt-8 border border-border p-6 text-muted">No songs have been published yet.</p>
        : visible.length === 0 ? <p role="status" className="mt-8 border border-border p-6 text-muted">No releases match “{query}”. <Link href="/bnl/music" className="text-accent underline">View the full discography</Link></p>
        : <div className="mt-8 space-y-8">{visible.map(release => {
          const showHref = broadcastArchiveShowHref(release.show.sessionId);
          const duration = Math.round(release.duration ?? 0);
          return <article key={release.show.sessionId} id={`release-${encodeURIComponent(release.show.sessionId)}`} className="scroll-mt-24 overflow-hidden rounded border border-border bg-surface">
            <div className="grid gap-6 p-5 sm:grid-cols-[200px_minmax(0,1fr)] sm:p-7">
              {release.presentation.artworkUrl ? <img src={release.presentation.artworkUrl} alt={`Cover for ${release.version.title}`} loading="lazy" className="aspect-square w-full max-w-[240px] rounded object-cover" />
                : <div aria-hidden="true" className="flex aspect-square w-full max-w-[240px] flex-col justify-end rounded border border-accent/30 bg-accent/5 p-5"><span className="text-4xl font-black tracking-tight text-accent">BNL-01</span><span className="mt-3 text-xs uppercase tracking-[0.2em] text-muted">Broadcast Ballads</span></div>}
              <div className="min-w-0">
                <p className="text-xs text-muted">Published <time dateTime={release.publishedAt}>{dateLabel(release.publishedAt)}</time>{duration > 0 && ` · ${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, "0")}`}</p>
                <h3 className="mt-3 break-words text-2xl font-black text-foreground sm:text-3xl">{release.version.title}</h3>
                <p className="mt-2 font-bold text-accent">BNL-01</p>
                {release.version.style && <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-relaxed text-muted">{release.version.style}</p>}
                {release.linerNotes?.about && <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/80"><BalladLinkedText text={release.linerNotes.about} artistLinks={release.artistLinks} /></p>}
                <p className="mt-4 text-xs leading-relaxed text-muted">{release.presentation.credits}</p>
                <Link href={`${showHref}#broadcast-ballad`} className="mt-6 inline-flex rounded border border-accent bg-accent/10 px-5 py-3 text-sm font-bold text-accent hover:bg-accent hover:text-background">Listen on the show card →</Link>
              </div>
            </div>
            {release.linerNotes?.inspiration && <details className="border-t border-border px-5 py-4 sm:px-7"><summary className="cursor-pointer text-sm font-bold text-foreground">BNL’s creative notes</summary><p className="mt-4 whitespace-pre-wrap break-words text-sm leading-relaxed text-muted"><BalladLinkedText text={release.linerNotes.inspiration} artistLinks={release.artistLinks} /></p></details>}
            <div className="border-t border-border px-5 py-4 text-sm text-muted sm:px-7">From <Link href={showHref} className="text-foreground underline decoration-accent/50 underline-offset-4 hover:text-accent">{release.show.title}</Link><span className="ml-2">· {dateLabel(release.show.showDate)}</span></div>
          </article>;
        })}</div>}
    </section>
  </main>;
}
