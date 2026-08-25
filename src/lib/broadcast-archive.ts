export type BroadcastArchiveView = "shows" | "artists";

export function normalizeBroadcastArchiveProjectKey(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFKC")
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("en-US");
}

export function broadcastArchiveArtistHref(projectLabelOrKey: string): string {
  const key = normalizeBroadcastArchiveProjectKey(projectLabelOrKey);
  return `/radio/archive?view=artists&artist=${encodeURIComponent(key)}`;
}

export function broadcastArchiveShowHref(sessionId: string): string {
  return `/radio/archive?view=shows&show=${encodeURIComponent(sessionId)}`;
}
