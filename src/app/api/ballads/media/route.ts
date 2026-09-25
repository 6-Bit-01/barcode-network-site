import { get } from "@vercel/blob";
import { verifyAdminRequest } from "@/lib/auth";
import { requireBalladShow, readBallad } from "@/lib/bnl-ballads-store";
import { serveAdminQueueAudio } from "@/lib/queue-audio-response";
import { publicBallad } from "@/lib/bnl-ballads";
import { balladDownloadDisposition, balladDownloadFilename } from "@/lib/ballad-download";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  try {
    const show = await requireBalladShow(params.get("showId") || "");
    const doc = await readBallad(show.sessionId);
    const audio = doc.audio.find(a => a.id === params.get("audioId"));
    // The public player must never inherit the owner's draft-preview permission.
    const publicOnly = params.get("public") === "1";
    if (publicOnly && (!audio || publicBallad(doc, show)?.audioId !== audio.id)) return new Response("Audio unavailable.", { status: 404, headers: { "Cache-Control": "no-store" } });
    if (!audio || (doc.published?.audioId !== audio.id && !await verifyAdminRequest(req))) return new Response("Audio unavailable.", { status: 404 });
    const download = params.get("download") === "1";
    const release = download ? publicBallad(doc, show) : null;
    if (download && (!release || release.audioId !== audio.id)) return new Response("Download unavailable.", { status: 404, headers: { "Cache-Control": "no-store" } });
    const response = await serveAdminQueueAudio({ entry: { id: audio.id, sourceType: "upload", fileUrl: audio.url, fileName: audio.filename, mimeType: audio.contentType }, rangeHeader: req.headers.get("range"), getBlob: (url, options) => get(url, options) });
    if (release && response.ok) response.headers.set("content-disposition", balladDownloadDisposition(balladDownloadFilename(release.version.title, show.showDate, response.headers.get("content-type") ?? audio.contentType)));
    return response;
  } catch { return new Response("Audio unavailable.", { status: 404, headers: { "Cache-Control": "no-store" } }); }
}
