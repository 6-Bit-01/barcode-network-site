import type { PublicBallad } from "@/lib/bnl-ballads";

export type CatalogFilters = { q: string; genre: string; artist: string; year: string; from: string; to: string; sort: string; page: number; release: string };
export const CATALOG_PAGE_SIZE = 12;
export const catalogText = (text: string) => text.normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase("en-US");
export function catalogDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value ? value : "";
}
export function catalogFilters(params: Record<string, unknown> = {}): CatalogFilters {
  const value = (key: string, max = 200) => typeof params[key] === "string" ? params[key].trim().slice(0, max) : "";
  return { q: value("q"), genre: value("genre"), artist: value("artist"), year: /^\d{4}$/.test(value("year")) ? value("year") : "", from: catalogDate(value("from")), to: catalogDate(value("to")), sort: ["oldest", "title", "published"].includes(value("sort")) ? value("sort") : "newest", page: Math.max(1, Math.min(100000, Number.parseInt(value("page"), 10) || 1)), release: value("release") };
}
/** Published catalog tags, not model-inferred genres or new identity claims. */
export function balladGenres(release: PublicBallad): string[] {
  return [...new Map((release.version.palette?.genres ?? "").split(/[,;|\n]+/).map(value => value.trim()).filter(Boolean).map(value => [catalogText(value), value])).values()];
}
export function catalogFacets(releases: PublicBallad[]) {
  const genres = new Map<string, { value: string; label: string; count: number }>();
  const artists = new Map<string, { value: string; label: string; count: number }>();
  const years = new Set<string>();
  for (const release of releases) {
    const year = catalogDate(release.show.showDate).slice(0, 4); if (year) years.add(year);
    for (const genre of balladGenres(release)) { const key = catalogText(genre); const prior = genres.get(key); genres.set(key, { value: key, label: prior?.label ?? genre, count: (prior?.count ?? 0) + 1 }); }
    for (const link of new Map(release.artistLinks.map(link => [link.projectKey, link])).values()) { const prior = artists.get(link.projectKey); artists.set(link.projectKey, { value: link.projectKey, label: link.projectLabel, count: (prior?.count ?? 0) + 1 }); }
  }
  return { genres: [...genres.values()].sort((a, b) => a.label.localeCompare(b.label)), artists: [...artists.values()].sort((a, b) => a.label.localeCompare(b.label)), years: [...years].sort().reverse() };
}
export function selectCatalog(releases: PublicBallad[], filters: CatalogFilters) {
  const terms = [...catalogText(filters.q).matchAll(/"([^"]+)"|(\S+)/g)].map(match => match[1] ?? match[2]);
  const matches = releases.filter(release => {
    const text = catalogText([release.version.title, release.version.lyrics, release.version.style, ...Object.values(release.version.palette), ...Object.values(release.linerNotes ?? {}), release.presentation.credits, release.show.title, release.show.showDate, ...release.artistLinks.flatMap(link => [link.name, link.projectLabel])].join(" "));
    return terms.every(term => text.includes(term)) && (!filters.genre || balladGenres(release).some(genre => catalogText(genre) === catalogText(filters.genre))) && (!filters.artist || release.artistLinks.some(link => link.projectKey === filters.artist)) && (!filters.year || release.show.showDate.startsWith(filters.year)) && (!filters.from || release.show.showDate >= filters.from) && (!filters.to || release.show.showDate <= filters.to);
  }).sort((a, b) => {
    if (filters.sort === "title") return a.version.title.localeCompare(b.version.title) || a.show.sessionId.localeCompare(b.show.sessionId);
    if (filters.sort === "published") return b.publishedAt.localeCompare(a.publishedAt) || a.show.sessionId.localeCompare(b.show.sessionId);
    return (filters.sort === "oldest" ? a.show.showDate.localeCompare(b.show.showDate) : b.show.showDate.localeCompare(a.show.showDate)) || b.publishedAt.localeCompare(a.publishedAt) || a.show.sessionId.localeCompare(b.show.sessionId);
  });
  const pages = Math.max(1, Math.ceil(matches.length / CATALOG_PAGE_SIZE));
  const target = filters.release ? matches.findIndex(release => release.show.sessionId === filters.release) : -1;
  const page = target >= 0 ? Math.floor(target / CATALOG_PAGE_SIZE) + 1 : Math.min(filters.page, pages);
  return { entries: matches.slice((page - 1) * CATALOG_PAGE_SIZE, page * CATALOG_PAGE_SIZE), total: matches.length, pages, page };
}
export function catalogPageHref(filters: CatalogFilters, page: number) {
  const params = new URLSearchParams();
  for (const key of ["q", "genre", "artist", "year", "from", "to", "sort"] as const) if (filters[key]) params.set(key, filters[key]);
  params.set("page", String(page));
  return `/bnl/music?${params}#discography-results`;
}
export function balladDateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}
