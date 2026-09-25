import Link from "next/link";
import { listOwnArt, type BNLOwnArt } from "@/lib/bnl-own-art";

export function OwnArtPiece({ art }: { art: BNLOwnArt }) {
  return <figure className="overflow-hidden border border-accent/20 bg-surface">
    {/* Native lazy loading avoids caching media beyond its current public visibility. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={`/api/bnl/art?id=${encodeURIComponent(art.artId)}`} alt={art.meaning} width={1024} height={1024} loading="lazy" className="aspect-square w-full object-contain" />
    <figcaption className="p-5">
      <h3 className="font-oxanium text-xl text-foreground">{art.title}</h3>
      <p className="mt-2 text-sm leading-6 text-muted">{art.meaning}</p>
      {art.journal && <Link href={`/journal/${encodeURIComponent(art.journal.entryId)}`} className="mt-4 inline-block text-xs uppercase tracking-widest text-accent">Related Journal →</Link>}
    </figcaption>
  </figure>;
}
export async function BNLOwnArtGallery() {
  const art = await listOwnArt();
  if (!art.length) return null;
  return <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6" aria-label="BNL's original artwork">
    <h2 className="text-xs font-bold uppercase tracking-[0.3em] text-accent">Images by BNL-01</h2>
    <p className="mb-6 mt-3 text-sm text-muted">Thoughts, memories and imagined places, in his own images.</p>
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{art.map(piece => <OwnArtPiece key={piece.artId} art={piece} />)}</div>
  </section>;
}
export async function JournalArtwork({ entryId }: { entryId: string }) {
  const [art] = await listOwnArt(entryId);
  return art ? <div className="mt-6 max-w-xl"><OwnArtPiece art={art} /></div> : null;
}
