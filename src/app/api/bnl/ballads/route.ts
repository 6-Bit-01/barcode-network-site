import { NextResponse } from "next/server";
import { authenticateBNLJournalRequest } from "@/lib/bnl-journal-contract";
import { eligibleBalladShows, readBallad, readBalladConfig, automationBaseline, saveBallad, requireBalladShow } from "@/lib/bnl-ballads-store";
import { applyBalladReceipt, type BalladCommand } from "@/lib/bnl-ballads";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function json(body: unknown, status = 200) { return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } }); }
function authorized(req: Request) { return authenticateBNLJournalRequest(req.headers.get("x-api-key")); }
export async function GET(req: Request) {
  if (!authorized(req)) return json({ error: "Unauthorized" }, 401);
  try {
    const [shows, config, baseline] = await Promise.all([eligibleBalladShows(), readBalladConfig(), automationBaseline()]);
    const commands: BalladCommand[] = [];
    const catalogVersions: Record<string, string> = {};
    for (const show of shows) {
      let doc = await readBallad(show.sessionId);
      // Enabling begins with future finalized shows, not a historical backfill.
      const recentEnough = Boolean(config.enabledSince && show.showDate >= new Date(Date.parse(config.enabledSince) - 86400000).toISOString().slice(0, 10));
      if (config.enabled && recentEnough && !baseline.includes(show.sessionId) && !doc.commands.length && !doc.versions.length) {
        const command: BalladCommand = { id: `auto-${show.sessionId}`, showId: show.sessionId, showDate: show.showDate, kind: "generate", baseVersion: null, options: { ...doc.options }, requestedAt: new Date().toISOString(), status: "queued" };
        try { doc = await saveBallad({ ...doc, commands: [command] }, doc.revision); }
        catch { doc = await readBallad(show.sessionId); }
      }
      const accepted = doc.published?.versionId ?? doc.audio.find(a => a.id === doc.selectedAudioId)?.versionId ?? doc.archivedSongs.at(-1)?.versionId;
      if (accepted) catalogVersions[show.sessionId] = accepted;
      commands.push(...doc.commands.filter(c => c.status === "queued"));
    }
    return json({ contractVersion: 1, catalogVersions, commands: commands.sort((a, b) => a.requestedAt.localeCompare(b.requestedAt)).slice(0, 2) });
  } catch { return json({ error: "Ballad controls unavailable." }, 503); }
}
export async function POST(req: Request) {
  if (!authorized(req)) return json({ error: "Unauthorized" }, 401);
  try {
    const raw = await req.text();
    if (Buffer.byteLength(raw) > 240000) return json({ error: "Payload too large." }, 413);
    const receipt = JSON.parse(raw);
    await requireBalladShow(receipt.showId);
    for (let attempt = 0; attempt < 3; attempt++) {
      const doc = await readBallad(receipt.showId);
      const next = applyBalladReceipt(doc, receipt);
      if (next === doc) return json({ ok: true });
      try { await saveBallad(next, doc.revision); return json({ ok: true }); }
      catch { if (attempt === 2) return json({ error: "Workspace changed; retry delivery." }, 409); }
    }
  } catch { return json({ error: "Invalid Ballad receipt or ineligible show." }, 400); }
  return json({ error: "Delivery unavailable." }, 503);
}
