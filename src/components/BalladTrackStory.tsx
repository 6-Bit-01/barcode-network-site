import { BalladLinkedText, BalladArtistCards } from "@/components/BalladArtistLinks";
import type { BalladArtistLink } from "@/lib/bnl-ballad-artists";
import { BALLAD_LINER_NOTE_FIELDS, normalizeBalladLinerNotes, type BalladLinerNotes } from "@/lib/bnl-ballads";

export function BalladTrackStory({ notes, artistLinks }: { notes?: BalladLinerNotes; artistLinks?: BalladArtistLink[] }) {
  const entries = (Object.entries(normalizeBalladLinerNotes(notes)) as [keyof BalladLinerNotes, string][]).filter(([, text]) => text);
  if (!entries.length) return <BalladArtistCards artistLinks={artistLinks} />;
  return <><div className="grid gap-6 border-t border-border p-6 md:grid-cols-2">
    {entries.map(([key, text]) => <section key={key}>
      <h3 className="text-sm font-bold text-foreground">{BALLAD_LINER_NOTE_FIELDS[key]}</h3>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-muted"><BalladLinkedText text={text} artistLinks={artistLinks} /></p>
    </section>)}
  </div><BalladArtistCards artistLinks={artistLinks} /></>;
}
