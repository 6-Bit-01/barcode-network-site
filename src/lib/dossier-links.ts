import type { DatabaseEntry, DossierLink, DossierLinkType } from "@/content";

function safeUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function hostnameFor(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function inferDossierLinkType(url: string): DossierLinkType {
  const hostname = hostnameFor(url)?.toLowerCase() ?? "";
  if (hostname.includes("aux.fan")) return "submission";
  if (hostname.includes("discord.gg") || hostname.includes("discord.com")) return "community";
  if (hostname.includes("spotify.com") || hostname.includes("soundcloud.com") || hostname.includes("youtube.com") || hostname.includes("youtu.be")) return "music";
  if (hostname.includes("tiktok.com") || hostname.includes("instagram.com") || hostname.includes("facebook.com")) return "social";
  return "other";
}

export function legacyDossierLink(url: string | undefined): DossierLink | null {
  const safe = safeUrl(url);
  if (!safe) return null;
  const hostname = hostnameFor(safe);
  return {
    label: hostname ?? "Official Link",
    url: safe,
    type: inferDossierLinkType(safe),
    selectedBy: "legacy",
    publicSafe: true,
  };
}

export function normalizeDossierLink(link: DossierLink | null | undefined): DossierLink | null {
  if (!link || link.publicSafe === false) return null;
  const safe = safeUrl(link.url);
  if (!safe) return null;
  return {
    label: link.label.trim() || hostnameFor(safe) || "Official Link",
    url: safe,
    type: link.type || inferDossierLinkType(safe),
    selectedBy: link.selectedBy,
    publicSafe: true,
  };
}

function pushUniqueLink(links: DossierLink[], candidate: DossierLink | null) {
  if (!candidate) return;
  if (links.some((link) => link.url === candidate.url)) return;
  links.push(candidate);
}

export function getDossierPrimaryLink(entry: Pick<DatabaseEntry, "primaryLink" | "links" | "link">): DossierLink | null {
  const primary = normalizeDossierLink(entry.primaryLink);
  if (primary) return primary;

  const firstPublicLink = entry.links?.map(normalizeDossierLink).find((link): link is DossierLink => Boolean(link));
  if (firstPublicLink) return firstPublicLink;

  return legacyDossierLink(entry.link);
}

export function getDossierPublicLinks(entry: Pick<DatabaseEntry, "primaryLink" | "links" | "link">): DossierLink[] {
  const links: DossierLink[] = [];
  pushUniqueLink(links, normalizeDossierLink(entry.primaryLink));
  for (const link of entry.links ?? []) pushUniqueLink(links, normalizeDossierLink(link));
  pushUniqueLink(links, legacyDossierLink(entry.link));
  return links;
}
