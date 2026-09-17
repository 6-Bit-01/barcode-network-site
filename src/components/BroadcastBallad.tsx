/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import type { PublicBallad } from "@/lib/bnl-ballads";
import { BalladLinkedText } from "@/components/BalladArtistLinks";
import { BalladTrackStory } from "@/components/BalladTrackStory";
import { BalladPlayback } from "@/components/BalladPlayback";
export function BroadcastBallad({ ballad }: { ballad: PublicBallad }) {
  return <section id="broadcast-ballad" className="mt-6 scroll-mt-24 overflow-hidden rounded border border-accent/50 bg-accent/5" aria-label="This broadcast’s Ballad">
    <div className="space-y-4 p-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      {ballad.presentation.artworkUrl && <img src={ballad.presentation.artworkUrl} alt={`Cover for ${ballad.version.title}`} className="h-24 w-24 shrink-0 rounded object-cover" />}
      <div className="min-w-0"><p className="text-xs font-bold uppercase tracking-widest text-accent">This broadcast’s Ballad</p><h3 className="mt-2 break-words text-2xl font-black text-foreground">{ballad.version.title}</h3><p className="mt-1 text-sm text-muted">By <Link href={`/bnl/music#release-${encodeURIComponent(ballad.show.sessionId)}`} className="text-accent underline underline-offset-4">BNL-01 · View discography</Link></p></div>
      </div>
      <BalladPlayback ballad={ballad} />
      <p className="text-xs text-muted">{ballad.presentation.credits}</p>
    </div>
    <details className="group border-t border-accent/30"><summary className="cursor-pointer px-5 py-4 text-base font-bold text-accent hover:bg-accent/10">Lyrics, story & credits</summary><div className="space-y-5 p-5">
      {ballad.presentation.sunoUrl && <a href={ballad.presentation.sunoUrl} target="_blank" rel="noopener noreferrer" className="inline-block text-xs text-accent">Listen on Suno ↗</a>}
      <details><summary className="cursor-pointer text-sm font-bold text-foreground">Lyrics</summary><p className="mt-4 whitespace-pre-wrap break-words text-sm leading-relaxed text-muted"><BalladLinkedText text={ballad.version.lyrics} artistLinks={ballad.artistLinks} /></p></details>
      <BalladTrackStory notes={ballad.linerNotes} artistLinks={ballad.artistLinks} />
      <details><summary className="cursor-pointer text-sm font-bold text-foreground">Sound & production</summary><p className="mt-3 text-sm text-muted">{ballad.version.style}</p>{Object.entries(ballad.version.palette).filter(([, value]) => value).map(([name, value]) => <p key={name} className="mt-2 text-xs text-muted"><span className="capitalize">{name}</span>: {value}</p>)}<p className="mt-3 text-xs text-muted">{ballad.presentation.sunoModel} {ballad.presentation.sunoSettings}</p></details>
      <p className="text-xs text-muted">A creative interpretation of the broadcast, in BNL’s own words.</p>
    </div></details>
  </section>;
}
