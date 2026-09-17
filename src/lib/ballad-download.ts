export function balladDownloadHref(showId: string, audioId: string) {
  return `/api/ballads/media?showId=${encodeURIComponent(showId)}&audioId=${encodeURIComponent(audioId)}&download=1`;
}
export function balladDownloadFilename(title: string, showDate: string, contentType: string) {
  const cleaned = title.normalize("NFKC").replace(/[\p{C}<>:"/\\|?*]/gu, " ").replace(/\s+/g, "_").replace(/^[._-]+|[._-]+$/g, "");
  let name = "";
  for (const char of cleaned) { if (encodeURIComponent(name + char).replace(/%[A-F\d]{2}/gi, "x").length > 140) break; name += char; }
  const date = /^\d{4}-\d{2}-\d{2}$/.test(showDate) ? showDate : "date-unavailable";
  const extension = ["audio/wav", "audio/wave", "audio/x-wav"].includes(contentType.split(";")[0].toLowerCase()) ? "wav" : "mp3";
  return `BARCODE_RADIO_${name || "Untitled"}_${date}.${extension}`;
}
export function balladDownloadDisposition(filename: string) {
  const ascii = filename.normalize("NFKD").replace(/[^\x20-\x7E]|["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename).replace(/['()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)}`;
}
