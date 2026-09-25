/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { BalladPlayback } from "@/components/BalladPlayback";
import type { PublicBallad } from "@/lib/bnl-ballads";
import { broadcastArchiveShowHref } from "@/lib/broadcast-archive";
import { balladDateLabel, balladGenres, catalogFilters, selectCatalog } from "@/lib/ballad-catalog";
import { listPublicBallads } from "@/lib/bnl-ballads-store";

export async function BNLFeaturedBallad() {
  const catalog = await listPublicBallads().then(releases => ({ releases, unavailable: false })).catch(() => ({ releases: [], unavailable: true }));
  return <BNLFeaturedBalladView {...catalog} />;
}

export function BNLFeaturedBalladView({ releases, unavailable = false, loading = false }: { releases: PublicBallad[]; unavailable?: boolean; loading?: boolean }) {
  const latest = unavailable || loading ? undefined : selectCatalog(releases, catalogFilters({ sort: "published" })).entries[0];
  return <section aria-labelledby="bnl-featured-ballad-title" className="min-w-0 border border-accent/35 bg-surface p-5 sm:p-6">
    <p className="text-xs font-bold uppercase tracking-[0.22em] text-accent">{latest ? "Latest released Ballad" : "Broadcast Ballads"}</p>
    {latest ? <>
      <div className="mt-5 flex items-start gap-4">
        {latest.presentation.artworkUrl ? <img src={latest.presentation.artworkUrl} alt="" loading="lazy" className="h-16 w-16 shrink-0 rounded object-cover" /> : null}
        <div className="min-w-0">
          <h2 id="bnl-featured-ballad-title" className="break-words text-2xl font-black leading-tight text-foreground">{latest.version.title}</h2>
          <p className="mt-3 text-xs leading-relaxed text-muted">By BNL-01 · Published <time dateTime={latest.publishedAt}>{balladDateLabel(latest.publishedAt)}</time></p>
        </div>
      </div>
      <p className="mt-4 break-words text-sm leading-relaxed text-accent">{balladGenres(latest).slice(0, 3).join(" · ")}</p>
      <div className="mt-5"><BalladPlayback ballad={latest} /></div>
      <div className="mt-5 border-t border-border pt-4">
        <p className="text-xs uppercase tracking-widest text-muted">From the broadcast · <time dateTime={latest.show.showDate}>{balladDateLabel(latest.show.showDate)}</time></p>
        <Link href={`${broadcastArchiveShowHref(latest.show.sessionId)}#broadcast-ballad`} className="mt-1 inline-flex min-h-11 items-center break-words text-sm font-bold text-foreground underline decoration-accent/50 underline-offset-4 hover:text-accent">{latest.show.title} →</Link>
      </div>
    </> : <>
      <h2 id="bnl-featured-ballad-title" className="mt-4 text-2xl font-black leading-tight text-foreground">Music from the nights we share.</h2>
      <p role="status" className="mt-4 text-sm leading-relaxed text-muted">{loading ? "Loading released music…" : unavailable ? "The released music could not be loaded right now. Open the discography to try again." : "No Ballads have been published yet. Explore past shows and the artists behind them in the Archive."}</p>
      <Link href="/radio/archive" className="mt-4 inline-flex min-h-11 items-center text-sm font-bold text-accent hover:underline">Open Broadcast Archive →</Link>
    </>}
    <Link href="/bnl/music" className="mt-4 inline-flex min-h-11 items-center text-sm font-bold text-accent hover:underline">Explore the full discography →</Link>
  </section>;
}
