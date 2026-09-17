import { NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth";
import { correctQueueArtistCredit, getQueueArtistCreditReview } from "@/lib/queue";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers });
export async function GET(req: Request) {
  if (!await verifyAdminRequest(req)) return json({ error: "Unauthorized" }, 401);
  try { return json(await getQueueArtistCreditReview()); } catch { return json({ error: "Artist credits unavailable." }, 503); }
}
export async function POST(req: Request) {
  if (!await verifyAdminRequest(req)) return json({ error: "Unauthorized" }, 401);
  try {
    const raw = await req.text();
    if (raw.length > 6000) return json({ error: "Credit edit is too large." }, 413);
    const body = JSON.parse(raw);
    if (typeof body.sessionId !== "string" || typeof body.trackId !== "string" || !Number.isInteger(body.revision)) return json({ error: "Choose a submission and reload its current revision." }, 400);
    if (body.undo !== true && (typeof body.primary !== "string" || typeof body.collaborators !== "string" || !["whole", "split", "alias"].includes(body.decision))) return json({ error: "Invalid artist credits." }, 400);
    const result = await correctQueueArtistCredit({ revision: body.revision, sessionId: body.sessionId, trackId: body.trackId, primary: body.primary, collaborators: body.collaborators, decision: body.decision, applyToMatching: body.applyToMatching === true, undo: body.undo === true });
    return json({ ...result, ...await getQueueArtistCreditReview() });
  } catch (error) { const message = error instanceof Error ? error.message : "Could not save artist credits."; return json({ error: message }, message.includes("queue changed") ? 409 : 400); }
}
