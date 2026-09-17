/** Shared Ballad contract. Creative publication history never grants factual authority. */
export type BalladOptions = { direction: string; genres: string; era: string; feedback: string };
export const DEFAULT_BALLAD_OPTIONS: BalladOptions = { direction: "", genres: "", era: "", feedback: "" };
export const BALLAD_LINER_NOTE_FIELDS = {
  about: "About the track", inspiration: "BNL’s inspiration",
  mentions: "People in the lyrics", inspiredBy: "People & moments behind it",
} as const;
export type BalladLinerNotes = Record<keyof typeof BALLAD_LINER_NOTE_FIELDS, string>;
export function normalizeBalladLinerNotes(value: unknown): BalladLinerNotes {
  const notes = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return Object.fromEntries(Object.keys(BALLAD_LINER_NOTE_FIELDS).map(key => [key, typeof notes[key] === "string" ? notes[key].trim().slice(0, 1500) : ""])) as BalladLinerNotes;
}
export type BalladVersion = {
  id: string; showId: string; ordinal: number; parentId: string | null;
  title: string; lyrics: string; style: string; palette: Record<string, string>;
  createdAt: string; kind: "generate" | "polish" | "edit" | "restore";
  sourceDigest: string; promptVersion: string; rawOutput: string; note: string;
  options: BalladOptions; author: "BNL-01"; contentHash: string;
  linerNotes?: BalladLinerNotes;
};
export type BalladCommand = {
  id: string; showId: string; showDate: string; kind: BalladVersion["kind"];
  baseVersion: string | null; options: BalladOptions; requestedAt: string;
  status: "queued" | "complete" | "failed"; error?: string;
  content?: Pick<BalladVersion, "title" | "lyrics" | "style"> & { palette?: Record<string, string> }; restoreVersion?: string;
};
export type BalladAudio = {
  id: string; versionId: string; url: string; pathname: string; filename: string;
  contentType: string; bytes: number; duration: number | null; createdAt: string;
};
export type BalladPresentation = { credits: string; sunoUrl: string; sunoModel: string; sunoSettings: string; artworkUrl: string };
export const DEFAULT_BALLAD_PRESENTATION: BalladPresentation = {
  credits: "Lyrics and creative direction: BNL-01 · Audio created with Suno · Selection and production: 6 Bit",
  sunoUrl: "", sunoModel: "", sunoSettings: "", artworkUrl: "",
};
export type ArchivedBallad = { audioId: string; versionId: string; selectedAt: string; archivedAt: string; publishedAt: string | null; presentation: BalladPresentation; linerNotes?: BalladLinerNotes };
export type BalladDocument = {
  showId: string; revision: number; options: BalladOptions; presentation: BalladPresentation;
  versions: BalladVersion[]; commands: BalladCommand[]; audio: BalladAudio[];
  selectedAudioId: string | null; selectedAt: string | null; archivedSongs: ArchivedBallad[];
  linerNotesByVersion?: Record<string, BalladLinerNotes>;
  published: { versionId: string; audioId: string; at: string; presentation: BalladPresentation; linerNotes?: BalladLinerNotes } | null;
};
export type BalladConfig = { revision: number; enabled: boolean; enabledSince: string | null };
export type BalladShow = { sessionId: string; title: string; showDate: string };
export type PublicBallad = { show: BalladShow; version: Pick<BalladVersion, "id" | "title" | "lyrics" | "style" | "palette" | "author">; presentation: BalladPresentation; linerNotes: BalladLinerNotes; publishedAt: string; duration: number | null; audioId: string };
export function balladLinerNotesForVersion(doc: BalladDocument, versionId: string): BalladLinerNotes {
  return normalizeBalladLinerNotes(doc.linerNotesByVersion?.[versionId] ?? doc.versions.find(v => v.id === versionId)?.linerNotes);
}
export function saveBalladLinerNotes(doc: BalladDocument, versionId: string, notes: unknown): BalladDocument {
  if (!doc.versions.some(v => v.id === versionId)) throw new Error("Choose a saved song version for these notes.");
  return { ...doc, linerNotesByVersion: { ...doc.linerNotesByVersion, [versionId]: normalizeBalladLinerNotes(notes) } };
}
export function newBallad(showId: string): BalladDocument {
  return { showId, revision: 0, options: { ...DEFAULT_BALLAD_OPTIONS }, presentation: { ...DEFAULT_BALLAD_PRESENTATION }, versions: [], commands: [], audio: [], selectedAudioId: null, selectedAt: null, archivedSongs: [], published: null };
}
export function validId(value: unknown): value is string { return typeof value === "string" && /^[a-zA-Z0-9_.:-]{1,160}$/.test(value); }
export function validVersion(value: unknown, showId: string, command: BalladCommand, ordinal: number): value is BalladVersion {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as BalladVersion;
  return v.id === command.id && v.showId === showId && v.ordinal === ordinal && v.parentId === command.baseVersion && v.kind === command.kind &&
    v.author === "BNL-01" && typeof v.contentHash === "string" && /^[a-f0-9]{64}$/.test(v.contentHash) &&
    typeof v.title === "string" && v.title.trim().length > 0 && v.title.length <= 300 &&
    typeof v.lyrics === "string" && v.lyrics.trim().length > 0 && v.lyrics.length <= 60000 &&
    typeof v.style === "string" && v.style.length <= 10000 &&
    typeof v.rawOutput === "string" && v.rawOutput.length <= 80000 &&
    typeof v.createdAt === "string" && Number.isFinite(Date.parse(v.createdAt)) &&
    Boolean(v.palette) && typeof v.palette === "object" && !Array.isArray(v.palette) && Object.values(v.palette).every(x => typeof x === "string");
}
export function publicBallad(doc: BalladDocument, show: BalladShow): PublicBallad | null {
  const release = doc.published;
  if (!release) return null;
  const version = doc.versions.find(v => v.id === release.versionId);
  const audio = doc.audio.find(a => a.id === release.audioId && a.versionId === release.versionId);
  if (!version || !audio) return null;
  return { show, version: { id: version.id, title: version.title, lyrics: version.lyrics, style: version.style, palette: version.palette, author: version.author }, presentation: release.presentation, linerNotes: normalizeBalladLinerNotes(release.linerNotes), publishedAt: release.at, duration: audio.duration, audioId: audio.id };
}
export function selectBalladAudio(doc: BalladDocument, audioId: string) {
  if (!doc.audio.some(a => a.id === audioId && doc.versions.some(v => v.id === a.versionId))) throw new Error("Choose an uploaded take attached to a saved draft.");
  if (doc.selectedAudioId === audioId) return doc;
  if (doc.selectedAudioId) throw new Error("This show’s song slot is locked. Archive the chosen song before replacing it.");
  return { ...doc, selectedAudioId: audioId, selectedAt: new Date().toISOString() };
}
export function archiveBallad(doc: BalladDocument, replacementAudioId?: string, now = new Date().toISOString()): BalladDocument {
  const chosen = doc.audio.find(a => a.id === doc.selectedAudioId);
  if (!chosen) throw new Error("No chosen song to archive.");
  if (replacementAudioId !== undefined && !validId(replacementAudioId)) throw new Error("Choose a valid replacement take.");
  if (replacementAudioId === chosen.id) throw new Error("Choose a different replacement take.");
  const archived: ArchivedBallad = { audioId: chosen.id, versionId: chosen.versionId, selectedAt: doc.selectedAt ?? now, archivedAt: now, publishedAt: doc.published?.at ?? null, presentation: { ...(doc.published?.presentation ?? doc.presentation) }, linerNotes: doc.published ? normalizeBalladLinerNotes(doc.published.linerNotes) : balladLinerNotesForVersion(doc, chosen.versionId) };
  const next: BalladDocument = { ...doc, selectedAudioId: null, selectedAt: null, published: null, archivedSongs: [...doc.archivedSongs, archived] };
  return replacementAudioId ? selectBalladAudio(next, replacementAudioId) : next;
}
export function publishBallad(doc: BalladDocument, now = new Date().toISOString()): BalladDocument {
  const audio = doc.audio.find(a => a.id === doc.selectedAudioId);
  if (!audio || !doc.versions.some(v => v.id === audio.versionId)) throw new Error("Confirm an audio take before publishing.");
  return { ...doc, published: { versionId: audio.versionId, audioId: audio.id, at: now, presentation: { ...doc.presentation }, linerNotes: balladLinerNotesForVersion(doc, audio.versionId) } };
}
export function applyBalladReceipt(doc: BalladDocument, receipt: { commandId: string; outcome: string; version?: unknown; error?: string }): BalladDocument {
  const command = doc.commands.find(c => c.id === receipt.commandId);
  if (!command) throw new Error("Unknown command.");
  if (command.status !== "queued" || receipt.outcome === "pending") return doc;
  if (receipt.outcome !== "complete" && receipt.outcome !== "failed") throw new Error("Invalid result.");
  const next = structuredClone(doc);
  if (receipt.outcome === "complete") {
    if (!validVersion(receipt.version, doc.showId, command, doc.versions.length + 1)) throw new Error("Invalid draft receipt.");
    if (command.baseVersion !== (doc.versions.at(-1)?.id ?? null)) throw new Error("Draft changed.");
    next.versions.push(receipt.version);
    const notesSource = command.kind === "restore" ? command.restoreVersion : command.kind === "edit" ? command.baseVersion : null;
    if (notesSource && doc.linerNotesByVersion?.[notesSource]) {
      next.linerNotesByVersion = { ...next.linerNotesByVersion, [receipt.version.id]: normalizeBalladLinerNotes(doc.linerNotesByVersion[notesSource]) };
    }
  }
  next.commands = next.commands.map(c => c.id === command.id ? { ...c, status: receipt.outcome as "complete" | "failed", error: receipt.error?.slice(0, 180) } : c);
  return next;
}
