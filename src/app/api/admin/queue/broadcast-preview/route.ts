import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { COOKIE_NAME, verifyAdminToken } from "@/lib/auth";
import { getLiveOverlayRuntimeState } from "@/lib/live-overlay";
import {
  getPublicQueueSnapshot,
  getQueueAdminPreviewReadback,
  getQueueAdminPreviewStats,
} from "@/lib/queue";
import { attachQueueLiveTiming } from "@/lib/queue-live-timing";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Robots-Tag": "noindex, nofollow, noarchive, noimageindex",
};

async function assertAdmin(): Promise<boolean> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  return token ? verifyAdminToken(token) : false;
}

export async function GET(request: Request) {
  if (!(await assertAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE_HEADERS });
  }

  const params = new URL(request.url).searchParams;
  const sessionId = params.get("sessionId")?.trim();
  if (!sessionId) {
    return NextResponse.json({ error: "Queue session ID is required." }, { status: 400, headers: NO_STORE_HEADERS });
  }

  try {
    const kind = params.get("kind") ?? "snapshot";
    if (kind === "stats") {
      const submitterToken = request.headers.get("x-barcode-submitter-token")?.trim() ?? "";
      if (submitterToken.length > 512) {
        return NextResponse.json({ error: "Invalid submission browser token." }, { status: 400, headers: NO_STORE_HEADERS });
      }
      return NextResponse.json(await getQueueAdminPreviewStats(sessionId, submitterToken || null), { headers: NO_STORE_HEADERS });
    }
    if (kind === "readback") {
      return NextResponse.json(await getQueueAdminPreviewReadback(sessionId), { headers: NO_STORE_HEADERS });
    }
    if (kind !== "snapshot") {
      return NextResponse.json({ error: "Unknown preview read." }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const snapshot = await getPublicQueueSnapshot(sessionId, {
      submitterToken: params.get("submitterToken"),
      tiktokHandle: params.get("tiktokHandle"),
      contactEmail: params.get("contactEmail"),
      artist: params.get("artist"),
    });
    if (snapshot.session?.sessionId !== sessionId) {
      return NextResponse.json({ error: "Queue session not found." }, { status: 404, headers: NO_STORE_HEADERS });
    }
    if (snapshot.sessionActive !== true) {
      return NextResponse.json(attachQueueLiveTiming(snapshot, null, null), { headers: NO_STORE_HEADERS });
    }
    const { playerSync, overlayState } = await getLiveOverlayRuntimeState();
    return NextResponse.json(attachQueueLiveTiming(snapshot, playerSync, overlayState), { headers: NO_STORE_HEADERS });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Private broadcast preview is unavailable.";
    const status = message === "Queue session not found." ? 404 : 500;
    return NextResponse.json({ error: message }, { status, headers: NO_STORE_HEADERS });
  }
}
