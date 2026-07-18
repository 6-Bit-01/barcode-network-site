import { NextResponse } from "next/server";
import { BNL_JOURNAL_MAX_PAYLOAD_BYTES, authenticateBNLJournalRequest, validateBNLJournalPayload } from "@/lib/bnl-journal-contract";
import { publishBNLJournalEntry } from "@/lib/bnl-journal-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const HEADERS = { "Cache-Control": "no-store" };
function json(body: unknown, status: number) { return NextResponse.json(body, { status, headers: HEADERS }); }

export async function POST(req: Request) {
  if (!authenticateBNLJournalRequest(req.headers.get("x-api-key"))) return json({ ok: false, error: "Unauthorized." }, 401);
  if (!req.headers.get("content-type")?.toLowerCase().includes("application/json")) return json({ ok: false, error: "Invalid Journal contract." }, 400);
  let body: unknown;
  let raw = "";
  try { raw = await req.text(); } catch { return json({ ok: false, error: "Invalid Journal contract." }, 400); }
  if (Buffer.byteLength(raw, "utf8") > BNL_JOURNAL_MAX_PAYLOAD_BYTES) return json({ ok: false, error: "Invalid Journal contract." }, 400);
  try { body = JSON.parse(raw); } catch { return json({ ok: false, error: "Invalid Journal contract." }, 400); }
  const validated = validateBNLJournalPayload(body);
  if (!validated.ok) return json({ ok: false, error: "Invalid Journal contract." }, 400);
  const result = await publishBNLJournalEntry(validated.entry);
  if (result.ok) return json(result, 200);
  if ("conflict" in result) return json({ ok: false, error: "Journal entry conflict." }, 409);
  return json({ ok: false, error: "Journal signal unavailable." }, 503);
}
