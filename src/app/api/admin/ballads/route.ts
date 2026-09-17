import { randomUUID } from "crypto";
import { head } from "@vercel/blob";
import { NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth";
import { readBallad, saveBallad, readBalladConfig, saveBalladConfig, eligibleBalladShows, requireBalladShow } from "@/lib/bnl-ballads-store";
import { publishBallad, selectBalladAudio, archiveBallad, saveBalladLinerNotes, BALLAD_LINER_NOTE_FIELDS, type BalladOptions, type BalladPresentation, type BalladCommand } from "@/lib/bnl-ballads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
function json(body: unknown, status = 200) { return NextResponse.json(body, { status, headers }); }
function string(value: unknown, max: number) { if (typeof value !== "string" || value.length > max) throw new Error("Invalid field length."); return value; }
function httpsUrl(value: unknown, host?: string) {
  const text = string(value, 1500);
  if (!text) return text;
  const url = new URL(text);
  if (url.protocol !== "https:" || url.username || url.password || (host && url.hostname !== host)) throw new Error("Use a valid HTTPS URL.");
  return url.toString();
}
export async function GET(req: Request) {
  if (!await verifyAdminRequest(req)) return json({ error: "Unauthorized" }, 401);
  try {
    const shows = await eligibleBalladShows();
    const id = new URL(req.url).searchParams.get("showId") || shows[0]?.sessionId;
    const show = shows.find(s => s.sessionId === id) ?? null;
    return json({ shows, show, document: show ? await readBallad(show.sessionId) : null, config: await readBalladConfig() });
  } catch { return json({ error: "Ballad workspace is temporarily unavailable." }, 503); }
}
export async function POST(req: Request) {
  if (!await verifyAdminRequest(req)) return json({ error: "Unauthorized" }, 401);
  try {
    const raw = await req.text();
    if (Buffer.byteLength(raw) > 180000) return json({ error: "Draft is too large." }, 413);
    const body = JSON.parse(raw);
    if (body.action === "saveAutomation") {
      if (typeof body.enabled !== "boolean" || !Number.isInteger(body.revision)) throw new Error("Invalid automation settings.");
      return json({ ok: true, config: await saveBalladConfig(body.enabled, body.revision) });
    }
    const show = await requireBalladShow(body.showId);
    let doc = await readBallad(show.sessionId);
    if (body.revision !== doc.revision) return json({ error: "This workspace changed. Reload before saving; your edits are still in the boxes." }, 409);
    if (body.action === "saveOptions") {
      const o = body.options || {};
      const options: BalladOptions = { direction: string(o.direction, 6000), genres: string(o.genres, 1000), era: string(o.era, 150), feedback: string(o.feedback, 4000) };
      doc = { ...doc, options };
    } else if (body.action === "savePresentation") {
      const p = body.presentation || {};
      const presentation: BalladPresentation = { credits: string(p.credits, 1500), sunoUrl: httpsUrl(p.sunoUrl, "suno.com"), sunoModel: string(p.sunoModel, 150), sunoSettings: string(p.sunoSettings, 1500), artworkUrl: httpsUrl(p.artworkUrl) };
      doc = { ...doc, presentation };
    } else if (body.action === "saveLinerNotes") {
      const notes = Object.fromEntries(Object.keys(BALLAD_LINER_NOTE_FIELDS).map(key => [key, string(body.linerNotes?.[key] ?? "", 1500)]));
      doc = saveBalladLinerNotes(doc, string(body.versionId, 160), notes);
    } else if (["generate", "polish", "edit", "restore"].includes(body.action)) {
      if (doc.commands.some(c => c.status === "queued")) return json({ error: "BNL is still handling the previous request. Your current edits can stay here." }, 409);
      if ((body.action === "generate" || body.action === "polish") && body.options) {
        const o = body.options;
        doc = { ...doc, options: { direction: string(o.direction, 6000), genres: string(o.genres, 1000), era: string(o.era, 150), feedback: string(o.feedback, 4000) } };
      }
      const command: BalladCommand = { id: randomUUID(), showId: show.sessionId, showDate: show.showDate, kind: body.action, baseVersion: doc.versions.at(-1)?.id ?? null, options: { ...doc.options }, requestedAt: new Date().toISOString(), status: "queued" };
      if ((body.action === "polish" || body.action === "edit") && body.sourceVersion) {
        if (!doc.versions.some(v => v.id === body.sourceVersion)) throw new Error("Saved version not found.");
        command.sourceVersion = string(body.sourceVersion, 160);
      }
      if (body.action === "edit") {
        command.content = { title: string(body.content?.title, 180), lyrics: string(body.content?.lyrics, 60000), style: string(body.content?.style, 10000) };
        if (!command.content.title.trim() || !command.content.lyrics.trim()) throw new Error("Give the draft a title and lyrics.");
        if (body.content.palette) {
          command.content.palette = Object.fromEntries(["angle", "hook", "topics", "imagery", "genres", "era", "arrangement"].map(key => [key, string(body.content.palette[key] ?? "", 1500)]));
        }
      }
      if (body.action === "restore") {
        if (!doc.versions.some(v => v.id === body.restoreVersion)) throw new Error("Saved version not found.");
        command.restoreVersion = body.restoreVersion;
      }
      if (body.action === "polish" && !doc.versions.length) throw new Error("Save a draft before requesting a polish.");
      doc = { ...doc, commands: [...doc.commands, command] };
    } else if (body.action === "attachAudio") {
      if (!doc.versions.some(v => v.id === body.versionId)) throw new Error("Choose the saved prompt version used for this audio.");
      const url = new URL(string(body.url, 2000));
      if (url.protocol !== "https:" || url.username || url.password || !url.hostname.endsWith(".private.blob.vercel-storage.com")) throw new Error("Invalid upload.");
      const blob = await head(url.toString());
      if (!blob.pathname.startsWith(`bnl-ballads/${show.sessionId}/`) || !["audio/mpeg", "audio/mp3", "audio/wav", "audio/wave", "audio/x-wav"].includes(blob.contentType) || blob.size > 100 * 1024 * 1024) throw new Error("Use a Ballad workspace MP3 or WAV upload.");
      if (doc.audio.some(a => a.url === blob.url)) return json({ ok: true, document: doc });
      const duration = typeof body.duration === "number" && Number.isFinite(body.duration) && body.duration > 0 ? body.duration : null;
      doc = { ...doc, audio: [...doc.audio, { id: randomUUID(), versionId: body.versionId, url: blob.url, pathname: blob.pathname, filename: string(body.filename, 250), contentType: blob.contentType, bytes: blob.size, duration, createdAt: new Date().toISOString() }] };
    } else if (body.action === "selectAudio") doc = selectBalladAudio(doc, body.audioId);
    else if (body.action === "publish") doc = publishBallad(doc);
    else if (body.action === "archive") doc = archiveBallad(doc);
    else if (body.action === "archiveReplace") doc = archiveBallad(doc, string(body.audioId, 160));
    else throw new Error("Unknown workspace action.");
    return json({ ok: true, document: await saveBallad(doc, body.revision) });
  } catch (e) { return json({ error: e instanceof Error ? e.message : "Could not save the workspace." }, 400); }
}
