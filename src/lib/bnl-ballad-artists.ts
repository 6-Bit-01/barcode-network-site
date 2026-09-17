import { normalizeBroadcastArchiveProjectKey, resolveArchiveArtist } from "@/lib/broadcast-archive";

export type BalladArtistProfile = { projectKey: string; projectLabel: string; aliases?: string[] };
/** An empty name adds an artist card without tagging any words in the song. */
export type BalladArtistLink = BalladArtistProfile & { name: string };
const nameKey = (value: string) => normalizeBroadcastArchiveProjectKey(value);
const searchKey = (value: string) => nameKey(value).normalize("NFKD").replace(/\p{M}/gu, "").replace(/[^\p{L}\p{N}]/gu, "");

/** Only the existing public Archive projection supplies selectable destinations. */
export function balladArtistProfiles(artists: readonly BalladArtistProfile[]): BalladArtistProfile[] {
  const unique = new Map<string, BalladArtistProfile>();
  for (const artist of artists) {
    if (!artist.projectLabel?.trim() || artist.projectLabel.length > 200) continue;
    if (artist.projectKey !== nameKey(artist.projectLabel)) continue;
    unique.set(artist.projectKey, { projectKey: artist.projectKey, projectLabel: artist.projectLabel, ...(artist.aliases ? { aliases: artist.aliases.filter(alias => typeof alias === "string" && alias.length <= 200).slice(0, 100) } : {}) });
  }
  return [...unique.values()].sort((a, b) => a.projectLabel.localeCompare(b.projectLabel));
}

/** Strip unknown properties even from legacy/stored snapshots before public rendering. */
export function normalizeBalladArtistLinks(value: unknown): BalladArtistLink[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const links: BalladArtistLink[] = [];
  for (const item of value.slice(0, 50)) {
    if (!item || typeof item !== "object" || typeof item.name !== "string" || typeof item.projectKey !== "string" || typeof item.projectLabel !== "string") continue;
    const name = item.name.trim();
    if (name.length > 120 || !balladArtistProfiles([item]).length) continue;
    const key = name ? `name:${nameKey(name)}` : `card:${item.projectKey}`;
    if (seen.has(key)) continue;
    seen.add(key);
    links.push({ name, projectKey: item.projectKey, projectLabel: item.projectLabel });
  }
  return links;
}

/** Validate admin choices against current public profiles; never trust a supplied URL/label. */
export function resolveBalladArtistLinks(value: unknown, profiles: readonly BalladArtistProfile[]): BalladArtistLink[] {
  if (!Array.isArray(value) || value.length > 50) throw new Error("Choose up to 50 artist links.");
  const allowed = new Map(balladArtistProfiles(profiles).map(profile => [profile.projectKey, profile]));
  const links = value.map(item => {
    if (!item || typeof item !== "object" || typeof item.name !== "string" || item.name.trim().length > 120 || /[\r\n]/.test(item.name)) throw new Error("Use a short name for each artist tag.");
    const profile = resolveArchiveArtist([...allowed.values()], item.projectKey);
    if (!profile) throw new Error("An artist card is no longer available. Choose an individual artist from the current Archive, or remove that link.");
    return { ...profile, name: item.name.trim() };
  });
  const normalized = normalizeBalladArtistLinks(links);
  if (normalized.length !== links.length) throw new Error("Each name can link to one artist. Remove duplicate tags or cards.");
  return normalized;
}

function distance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(next[j - 1] + 1, previous[j] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    previous = next;
  }
  return previous[b.length];
}

/** Rank the current primary catalog and reviewed aliases, never infer a global merge. */
export function suggestBalladArtists(name: string, profiles: readonly BalladArtistProfile[]): BalladArtistProfile[] {
  const needle = searchKey(name).slice(0, 120);
  if (!needle) return [];
  return balladArtistProfiles(profiles).map(profile => {
    const label = searchKey(profile.projectLabel);
    const score = label === needle || profile.aliases?.some(alias => searchKey(alias) === needle) ? 1 : (label.includes(needle) || needle.includes(label)) && Math.min(label.length, needle.length) >= 3 ? 0.85 : Math.abs(label.length - needle.length) <= 4 ? 1 - distance(needle, label) / Math.max(needle.length, label.length) : 0;
    return { profile, score };
  }).filter(item => item.score >= 0.68).sort((a, b) => b.score - a.score || a.profile.projectLabel.localeCompare(b.profile.projectLabel)).slice(0, 8).map(item => item.profile);
}

export type BalladTextPart = { text: string; link?: BalladArtistLink };
export function balladLinkedTextParts(text: string, value: unknown): BalladTextPart[] {
  const links = normalizeBalladArtistLinks(value).filter(link => link.name).sort((a, b) => b.name.length - a.name.length);
  if (!links.length) return [{ text }];
  const escaped = links.map(link => link.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+"));
  const pattern = new RegExp(`(^|[^\\p{L}\\p{N}_])(${escaped.join("|")})(?=$|[^\\p{L}\\p{N}_])`, "giu");
  const parts: BalladTextPart[] = [];
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index! + match[1].length;
    if (start > cursor) parts.push({ text: text.slice(cursor, start) });
    parts.push({ text: match[2], link: links.find(link => nameKey(link.name) === nameKey(match[2])) });
    cursor = start + match[2].length;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor) });
  return parts;
}

/** Best-effort name chips from BNL's prose. Missing/unusual names can be added manually. */
export function suggestedBalladNames(text: string, profiles: readonly BalladArtistProfile[]): string[] {
  const names: string[] = [];
  const known = balladArtistProfiles(profiles).map(profile => ({ ...profile, name: profile.projectLabel }));
  for (const link of known) {
    for (const part of balladLinkedTextParts(text, [link])) if (part.link) names.push(part.text);
  }
  const chunks = text.slice(0, 1500).split(/[,;\n|]|\s+(?:and|with)\s+|\s*&\s*/iu);
  for (const chunk of chunks) {
    const lead = chunk.split(/\s+[—–-]\s+|:/u)[0];
    for (const match of lead.matchAll(/[\p{Lu}\p{N}][\p{L}\p{N}’'._/-]*(?:\s+[\p{Lu}\p{N}][\p{L}\p{N}’'._/-]*){0,5}/gu)) {
      const name = match[0].replace(/[.]+$/, "").trim();
      if (name.length >= 2 && !/^(?:The|A|An|I|BNL-01|People|Lyrics|Verse|Chorus|Bridge)$/i.test(name)) names.push(name);
    }
  }
  const unique = [...new Map(names.map(name => [nameKey(name), name])).values()];
  return unique.filter(name => !unique.some(other => name !== other && nameKey(other).includes(nameKey(name)))).sort((a, b) => text.toLocaleLowerCase().indexOf(a.toLocaleLowerCase()) - text.toLocaleLowerCase().indexOf(b.toLocaleLowerCase())).slice(0, 50);
}

/** Autofill only a clear best match; the saved version remains the publication boundary. */
export function autofillBalladArtistLinks(names: string[], profiles: readonly BalladArtistProfile[], links: BalladArtistLink[], reviewed: readonly string[] = []): BalladArtistLink[] {
  const result = [...links];
  const decided = new Set([...reviewed, ...links.map(link => link.name)].map(nameKey));
  for (const name of names) {
    if (decided.has(nameKey(name))) continue;
    const suggestions = suggestBalladArtists(name, profiles);
    if (!suggestions.length) continue;
    const exact = suggestions.filter(profile => [profile.projectLabel, ...(profile.aliases ?? [])].some(label => searchKey(label) === searchKey(name)));
    const best = exact.length === 1 ? exact[0] : suggestions.length === 1 ? suggestions[0] : null;
    if (best) result.push({ name, projectKey: best.projectKey, projectLabel: best.projectLabel });
  }
  return result.slice(0, 50);
}
