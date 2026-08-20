export function studioOverlayAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.hash.replace(/^#/, "")).get("access");
}

export function studioOverlayRequestHeaders(): HeadersInit | undefined {
  const accessToken = studioOverlayAccessToken();
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined;
}
