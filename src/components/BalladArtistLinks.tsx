import { broadcastArchiveArtistHref } from "@/lib/broadcast-archive";
import { balladLinkedTextParts, normalizeBalladArtistLinks, type BalladArtistLink } from "@/lib/bnl-ballad-artists";

export function BalladLinkedText({ text, artistLinks }: { text: string; artistLinks?: BalladArtistLink[] }) {
  return <>{balladLinkedTextParts(text, artistLinks).map((part, i) => part.link ? <a key={i} href={broadcastArchiveArtistHref(part.link.projectKey)} className="text-accent underline underline-offset-4">{part.text}</a> : part.text)}</>;
}

export function BalladArtistCards({ artistLinks }: { artistLinks?: BalladArtistLink[] }) {
  const profiles = [...new Map(normalizeBalladArtistLinks(artistLinks).map(link => [link.projectKey, link])).values()];
  if (!profiles.length) return null;
  return <section className="border-t border-border p-6" aria-label="Linked artist cards">
    <h3 className="text-sm font-bold text-foreground">Explore the artists</h3>
    <div className="mt-3 flex flex-wrap gap-3">{profiles.map(profile => <a key={profile.projectKey} href={broadcastArchiveArtistHref(profile.projectKey)} className="max-w-full rounded border border-accent/40 px-4 py-3 text-sm text-accent hover:border-accent">
      <span className="break-words font-bold">{profile.projectLabel}</span><span className="mt-1 block text-xs text-muted">View Archive artist card ↗</span>
    </a>)}</div>
  </section>;
}
