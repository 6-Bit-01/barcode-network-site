import { authenticateBNLJournalRequest } from "@/lib/bnl-journal-contract";
import { MAX_ART_BODY, ownArtEnabled, publishOwnArt, readOwnArtImage, validateOwnArt } from "@/lib/bnl-own-art";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const json = (body: unknown, status: number) => Response.json(body, { status, headers });
export async function POST(req: Request) {
  if (!authenticateBNLJournalRequest(req.headers.get("x-api-key"))) return json({ ok: false }, 401);
  if (!ownArtEnabled()) return json({ ok: false, error: "Art publication is disabled." }, 409);
  if (!req.headers.get("content-type")?.toLowerCase().includes("application/json")) return json({ ok: false }, 400);
  try {
    const reader = req.body?.getReader();
    if (!reader) return json({ ok: false }, 400);
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > MAX_ART_BODY) { await reader.cancel(); return json({ ok: false }, 413); }
      chunks.push(next.value);
    }
    const parsed = validateOwnArt(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    if (!parsed) return json({ ok: false }, 400);
    const result = await publishOwnArt(parsed.art, parsed.png);
    return json(result, result.ok ? 200 : 409);
  } catch { return json({ ok: false, error: "Art publication unavailable." }, 503); }
}
export async function GET(req: Request) {
  try {
    const image = await readOwnArtImage(new URL(req.url).searchParams.get("id") || "");
    if (image) return new Response(image.stream, { headers: { ...headers, "Content-Type": "image/png", "Content-Security-Policy": "default-src 'none'; sandbox" } });
  } catch { /* Missing media remains unavailable, never a broken public URL. */ }
  return new Response(null, { status: 404, headers });
}
