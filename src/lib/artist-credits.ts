import { normalizeBroadcastArchiveProjectKey as key } from "./broadcast-archive";

export type ArtistCredit = {
  primary: string;
  collaborators: string[];
  original: string;
  decision: "whole" | "split" | "alias";
  source: "submitter" | "admin" | "inferred";
};
export type ArtistCreditRevision = { at: string; changeId?: string; credit: ArtistCredit | null };
export type CreditEntry = { artist: string; submittedArtistName?: string; collaboratorNames?: string | null; artistCredit?: ArtistCredit | null };
export type ArtistProfile = { projectKey: string; projectLabel: string; aliases?: string[] };

const clean = (value: string) => value.normalize("NFKC").replace(/\s+/g, " ").trim();
export function collaboratorList(text: string): string[] {
  return [...new Map(text.split(/[,;\n]+/u).map(clean).filter(Boolean).map(name => [key(name), name])).values()];
}

/** A suggestion, never an automatic rename. Word markers require word boundaries;
 * an unspaced slash remains part of a name (AI/ML Music, AC/DC). */
export function suggestCreditSplit(value: string): { primary: string; collaborators: string[] } | null {
  const text = clean(value);
  const marker = /\s+(?:feat|ft)\.\s*|\s*\(\s*(?:feat\.?|featuring|ft\.?)\s+|\s+(?:feat\.?|featuring|ft\.?|and|with|also|alongside|versus|vs\.?|x|collab(?:oration)?(?:\s+with)?|w\/)\s+|\s*[&+×,;|]\s*|\s+\/\s+/iu;
  const match = marker.exec(text);
  if (!match) return null;
  const primary = text.slice(0, match.index).trim();
  const rest = text.slice(match.index + match[0].length).replace(/\)$/, "").trim();
  if (!primary || !rest) return null;
  // Keep the remaining wording intact. An '&' may belong to a featured artist.
  return { primary, collaborators: collaboratorList(rest) };
}

export function moveCreditSuggestion(artist: string, existing: string) {
  const split = suggestCreditSplit(artist);
  if (!split) return null;
  const collaborators = collaboratorList([...collaboratorList(existing), ...split.collaborators].join(", "));
  const collaboratorNames = collaborators.join(", ");
  return collaboratorNames.length <= 200 ? { artist: split.primary, collaboratorNames } : null;
}

export function normalizeArtistCredit(value: unknown): ArtistCredit | null {
  if (!value || typeof value !== "object") return null;
  const v = value as ArtistCredit;
  if (typeof v.primary !== "string" || !clean(v.primary) || v.primary.length > 200 || typeof v.original !== "string" || !clean(v.original) || v.original.length > 400) return null;
  if (!["whole", "split", "alias"].includes(v.decision) || !["submitter", "admin", "inferred"].includes(v.source)) return null;
  if (!Array.isArray(v.collaborators) || v.collaborators.length > 20 || v.collaborators.some(n => typeof n !== "string" || !clean(n) || n.length > 200)) return null;
  return { primary: clean(v.primary), original: clean(v.original), collaborators: collaboratorList(v.collaborators.join(", ")), decision: v.decision, source: v.source };
}

/** Evidence is restricted by the caller to the same public/private catalog scope.
 * Only explicit admin alias decisions teach a global rename. */
export function artistCreditResolver(entries: readonly CreditEntry[]) {
  const known = new Map<string, string>();
  const aliases = new Map<string, string>();
  const keptWhole = new Set<string>();
  const conflictingAliases = new Set<string>();
  for (const entry of entries) {
    const credit = normalizeArtistCredit(entry.artistCredit);
    const name = clean(entry.submittedArtistName ?? entry.artist);
    if (credit) {
      known.set(key(credit.primary), credit.primary);
      if (credit.decision === "whole") keptWhole.add(key(credit.primary));
      if (credit.source === "admin" && credit.decision === "alias") {
        const existing = aliases.get(key(credit.original));
        if (existing && key(existing) !== key(credit.primary)) conflictingAliases.add(key(credit.original));
        aliases.set(key(credit.original), credit.primary);
      }
    } else if (!suggestCreditSplit(name) || entry.collaboratorNames?.trim()) known.set(key(name), name);
  }
  for (const name of [...keptWhole, ...conflictingAliases]) aliases.delete(name);
  const canonical = (name: string) => {
    const seen = new Set<string>();
    let next = name;
    while (aliases.has(key(next))) {
      if (seen.has(key(next))) return name;
      seen.add(key(next));
      next = aliases.get(key(next))!;
    }
    return next;
  };
  return (entry: CreditEntry): ArtistCredit => {
    const explicit = normalizeArtistCredit(entry.artistCredit);
    const original = clean(entry.submittedArtistName ?? entry.artist);
    if (explicit) return { ...explicit, primary: explicit.decision === "whole" ? explicit.primary : canonical(explicit.primary), collaborators: explicit.collaborators.map(canonical) };
    const collaborators = collaboratorList(entry.collaboratorNames ?? "").map(canonical);
    const renamed = canonical(original);
    if (renamed !== original) return { primary: renamed, collaborators, original, decision: "alias", source: "admin" };
    const split = suggestCreditSplit(original);
    if (!collaborators.length && !known.has(key(original)) && split && known.has(key(split.primary))) {
      return { primary: canonical(known.get(key(split.primary))!), collaborators: split.collaborators.map(canonical), original, decision: "split", source: "inferred" };
    }
    return { primary: original, collaborators, original, decision: "whole", source: "submitter" };
  };
}
