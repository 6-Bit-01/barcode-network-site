export const SONG_LIMITS = { maxLyricsWords: 2000, targetSeconds: 300, maxLyricsCharacters: 40000, maxStyleCharacters: 6000 } as const;
export const SONG_ERROR_CODES = ["INVALID_COMMAND", "BUDGET_UNAVAILABLE", "BUDGET_DAILY_TOKENS", "BUDGET_DAILY_COST", "BUDGET_MONTHLY_COST", "BUDGET_PRICING_UNAVAILABLE", "PROVIDER_BILLING_REQUIRED", "PROVIDER_UNAVAILABLE", "INVALID_RESULT", "LYRICS_TOO_LONG", "RESULT_TOO_LONG", "CONTEXT_UNAVAILABLE", "GENERATION_INTERRUPTED", "AUTHORITY_REVOKED"] as const;
export type SongText = { title: string; lyrics: string; style: string };
export type SongOptions = { idea?: string; musicalDirection?: string; mood?: string; lengthStructure?: string; revisionInstructions?: string };
export type SongRequest = { requestId: string; expectedRevision: number; kind: "generate" | "lyrics" | "style" | "undo" | "select"; options?: SongOptions; base?: SongText; trackId?: string };
export type SongTrack = { id: string; title: string; createdAt: number; updatedAt: number };
export type SongDraft = SongText & { revision: number; previous: SongText | null; pending: { id: string; status: string } | null; errorCode: string | null; resetAt?: string | null; selectedTrackId: string | null; options: SongOptions; tracks: SongTrack[] };
export const countLyricsWords = (value: string) => value.trim() ? value.trim().split(/\s+/u).length : 0;
function record(value: unknown): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("INVALID_COMMAND"); return value as Record<string, unknown>; }
function keys(value: Record<string, unknown>, allowed: string[]) { if (Object.keys(value).some(key => !allowed.includes(key))) throw Error("INVALID_COMMAND"); }
function text(value: unknown, maximum: number): string { if (typeof value !== "string" || value.length > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) throw Error("INVALID_RESULT"); return value; }
export function parseSongText(value: unknown): SongText {
 const item = record(value); const result = { title: text(item.title,160), lyrics: text(item.lyrics,40000), style: text(item.style,6000) };
 if (countLyricsWords(result.lyrics) > 2000) throw Error("LYRICS_TOO_LONG"); return result;
}
export function parseSongOptions(value: unknown): SongOptions {
 const item=record(value); const allowed=["idea","musicalDirection","mood","lengthStructure","revisionInstructions"]; keys(item,allowed);
 const result: SongOptions={}; for (const key of allowed as (keyof SongOptions)[]) if (item[key] !== undefined) result[key]=text(item[key],6000); return result;
}
export function parseSongRequest(value: unknown): SongRequest {
 const item=record(value); keys(item,["requestId","expectedRevision","kind","options","base","trackId"]);
 if (typeof item.requestId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.requestId) || !Number.isSafeInteger(item.expectedRevision) || (item.expectedRevision as number)<0 || !["generate","lyrics","style","undo","select"].includes(item.kind as string)) throw Error("INVALID_COMMAND");
 if(item.kind==="select" ? (typeof item.trackId!=="string"||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.trackId)||item.options!==undefined||item.base!==undefined) : item.trackId!==undefined) throw Error("INVALID_COMMAND");
 return {requestId:item.requestId,expectedRevision:item.expectedRevision as number,kind:item.kind as SongRequest["kind"],...(item.trackId===undefined?{}:{trackId:item.trackId as string}),...(item.options===undefined?{}:{options:parseSongOptions(item.options)}),...(item.base===undefined?{}:{base:parseSongText(item.base)})};
}
export function parseSongResetAt(value: unknown): string | null | undefined {
 if (value === undefined || value === null) return value;
 if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|\+00:00)$/.test(value) || (!Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0,19) !== value.slice(0,19))) throw Error("INVALID_RESULT");
 return value;
}
export function parseSongDraft(value: unknown): SongDraft {
 const item=record(value); const base=parseSongText(item);
 if (!Number.isSafeInteger(item.revision) || (item.revision as number)<0 || !(item.errorCode===null || SONG_ERROR_CODES.includes(item.errorCode as typeof SONG_ERROR_CODES[number]))) throw Error("INVALID_RESULT");
 const resetAt = parseSongResetAt(item.resetAt);
 let pending: SongDraft["pending"]=null;
 if (item.pending!==null) { const job=record(item.pending); if(typeof job.id!=="string" || !/^[A-Za-z0-9_-]{1,128}$/.test(job.id) || !["queued","claimed","running"].includes(job.status as string)) throw Error("INVALID_RESULT"); pending={id:job.id,status:job.status as string}; }
 if(!Array.isArray(item.tracks)||item.tracks.length>40) throw Error("INVALID_RESULT");
 const tracks:SongTrack[]=item.tracks.map(value=>{const track=record(value);if(typeof track.id!=="string"||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(track.id)||!Number.isSafeInteger(track.createdAt)||(track.createdAt as number)<0||!Number.isSafeInteger(track.updatedAt)||(track.updatedAt as number)<0)throw Error("INVALID_RESULT");return{id:track.id,title:text(track.title,160),createdAt:track.createdAt as number,updatedAt:track.updatedAt as number};});
 if(new Set(tracks.map(track=>track.id)).size!==tracks.length||!(item.selectedTrackId===null || (typeof item.selectedTrackId==="string"&&tracks.some(track=>track.id===item.selectedTrackId))))throw Error("INVALID_RESULT");
 return {...base,selectedTrackId:item.selectedTrackId as string|null,options:parseSongOptions(item.options),tracks,revision:item.revision as number,previous:item.previous===null?null:parseSongText(item.previous),pending,errorCode:item.errorCode as string|null,...(resetAt === undefined ? {} : {resetAt})};
}
