import { NextResponse } from "next/server";
import { parseHellcatNowPlaying } from "@/lib/hellcat-now-playing";
import { authorizeHellcatRadio, getHellcatNowPlaying, HellcatRadioBodyError,
  readHellcatRadioBody, saveHellcatNowPlaying } from "@/lib/hellcat-now-playing.server";

export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };

export async function GET() {
  return NextResponse.json(await getHellcatNowPlaying(), { headers });
}

export async function POST(request: Request) {
  if (!authorizeHellcatRadio(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  try {
    const state = parseHellcatNowPlaying(await readHellcatRadioBody(request));
    if (!state) return NextResponse.json({ error: "Invalid radio update" }, { status: 400, headers });
    if (!await saveHellcatNowPlaying(state)) return NextResponse.json({ error: "Radio update unavailable" }, { status: 503, headers });
    return NextResponse.json({ ok: true }, { headers });
  } catch (error) {
    return NextResponse.json({ error: "Invalid radio update" }, {
      status: error instanceof HellcatRadioBodyError ? error.status : 400, headers,
    });
  }
}
