import { get } from "@vercel/blob";
import { verifyAdminRequest } from "@/lib/auth";
import { requireBalladShow, readBallad } from "@/lib/bnl-ballads-store";
import { serveAdminQueueAudio } from "@/lib/queue-audio-response";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  try {
    const show = await requireBalladShow(params.get("showId") || "");
    const doc = await readBallad(show.sessionId);
    const audio = doc.audio.find(a => a.id === params.get("audioId"));
    if (!audio || (doc.published?.audioId !== audio.id && !await verifyAdminRequest(req))) return new Response("Audio unavailable.", { status: 404 });
    return serveAdminQueueAudio({ entry: { id: audio.id, sourceType: "upload", fileUrl: audio.url, fileName: audio.filename, mimeType: audio.contentType }, rangeHeader: req.headers.get("range"), getBlob: (url, options) => get(url, options) });
  } catch { return new Response("Audio unavailable.", { status: 404, headers: { "Cache-Control": "no-store" } }); }
}
