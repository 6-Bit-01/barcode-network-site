export const SONG_LIMITS = { maxLyricsWords: 2000, targetSeconds: 300, maxLyricsCharacters: 40000, maxStyleCharacters: 6000 } as const;
export const SONG_ERROR_CODES = ["INVALID_COMMAND", "BUDGET_UNAVAILABLE", "PROVIDER_UNAVAILABLE", "INVALID_RESULT", "LYRICS_TOO_LONG", "RESULT_TOO_LONG", "CONTEXT_UNAVAILABLE", "GENERATION_INTERRUPTED", "AUTHORITY_REVOKED"] as const;
export type SongText = { title: string; lyrics: string; style: string };
export type SongOptions = { idea?: string; musicalDirection?: string; mood?: string; lengthStructure?: string; revisionInstructions?: string };
export type SongRequest = { requestId: string; expectedRevision: number; kind: "generate" | "lyrics" | "style" | "undo"; options?: SongOptions; base?: SongText };
export type SongDraft = SongText & { revision: number; previous: SongText | null; pending: { id: string; status: string } | null; errorCode: string | null };
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
 const item=record(value); keys(item,["requestId","expectedRevision","kind","options","base"]);
 if (typeof item.requestId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.requestId) || !Number.isSafeInteger(item.expectedRevision) || (item.expectedRevision as number)<0 || !["generate","lyrics","style","undo"].includes(item.kind as string)) throw Error("INVALID_COMMAND");
 return {requestId:item.requestId,expectedRevision:item.expectedRevision as number,kind:item.kind as SongRequest["kind"],...(item.options===undefined?{}:{options:parseSongOptions(item.options)}),...(item.base===undefined?{}:{base:parseSongText(item.base)})};
}
export function parseSongDraft(value: unknown): SongDraft {
 const item=record(value); const base=parseSongText(item);
 if (!Number.isSafeInteger(item.revision) || (item.revision as number)<0 || !(item.errorCode===null || SONG_ERROR_CODES.includes(item.errorCode as typeof SONG_ERROR_CODES[number]))) throw Error("INVALID_RESULT");
 let pending: SongDraft["pending"]=null;
 if (item.pending!==null) { const job=record(item.pending); if(typeof job.id!=="string" || !/^[A-Za-z0-9_-]{1,128}$/.test(job.id) || !["queued","claimed","running"].includes(job.status as string)) throw Error("INVALID_RESULT"); pending={id:job.id,status:job.status as string}; }
 return {...base,revision:item.revision as number,previous:item.previous===null?null:parseSongText(item.previous),pending,errorCode:item.errorCode as string|null};
}
