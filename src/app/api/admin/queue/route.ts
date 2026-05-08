import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { COOKIE_NAME, verifyAdminToken } from "@/lib/auth";
import { archiveCurrentQueueSession, getRadioQueueState, setQueueOpen, startNewQueueSession, activateQueueSession, updatePriorityUpgradeSettings, updateRadioTrack } from "@/lib/queue";
import type { QueueEntry } from "@/lib/queue-types";

export const dynamic = "force-dynamic";


function findAdminTrack(state: Awaited<ReturnType<typeof getRadioQueueState>>, id: string): QueueEntry | null {
  return [state.nowPlaying, state.nextInLine, state.loadedTrack, ...state.queue, ...state.history, ...(state.removed ?? []), ...(state.spotlight ?? [])].find((entry): entry is QueueEntry => Boolean(entry && entry.id === id)) ?? null;
}

async function privateAudioResponse(entry: QueueEntry, range: string | null): Promise<Response> {
  if (entry.sourceType !== "upload" || !entry.fileUrl) return NextResponse.json({ error: "Audio not found" }, { status: 404 });
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return NextResponse.json({ error: "Upload storage is not configured" }, { status: 503 });
  const response = await fetch(entry.fileUrl, {
    headers: {
      authorization: `Bearer ${token}`,
      ...(range ? { range } : {}),
    },
    cache: "no-store",
  });
  if (!response.ok || !response.body) return NextResponse.json({ error: "Audio unavailable" }, { status: response.status === 404 ? 404 : 502 });
  const headers = new Headers();
  headers.set("content-type", entry.mimeType || response.headers.get("content-type") || "audio/mpeg");
  headers.set("cache-control", "private, no-store");
  headers.set("accept-ranges", response.headers.get("accept-ranges") || "bytes");
  for (const key of ["content-length", "content-range"]) {
    const value = response.headers.get(key);
    if (value) headers.set(key, value);
  }
  return new Response(response.body, { status: response.status, headers });
}

async function assertAdmin(): Promise<boolean> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  return token ? verifyAdminToken(token) : false;
}

export async function GET(req: Request) {
  if (!(await assertAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const params = new URL(req.url).searchParams;
  const audioId = params.get("audioId");
  const sessionId = params.get("sessionId") ?? undefined;
  const state = await getRadioQueueState(sessionId);
  if (audioId) {
    const entry = findAdminTrack(state, audioId);
    if (!entry) return NextResponse.json({ error: "Audio not found" }, { status: 404 });
    return privateAudioResponse(entry, req.headers.get("range"));
  }
  return NextResponse.json(state);
}

export async function POST(req: Request) {
  if (!(await assertAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (body.action === "setOpen") {
    await setQueueOpen(Boolean(body.isOpen));
    return NextResponse.json(await getRadioQueueState());
  }
  if (body.action === "startSession") {
    const trackLimitPerArtist = Number(body.trackLimitPerArtist);
    const skipGameTapTarget = Number(body.skipGameTapTarget);
    const queueCapacity = Number(body.queueCapacity);
    return NextResponse.json(await startNewQueueSession({
      title: typeof body.title === "string" ? body.title : undefined,
      showDate: typeof body.showDate === "string" ? body.showDate : undefined,
      description: typeof body.description === "string" ? body.description : undefined,
      trackLimitPerArtist: Number.isFinite(trackLimitPerArtist) && trackLimitPerArtist > 0 ? trackLimitPerArtist : undefined,
      queueCapacity: Number.isFinite(queueCapacity) && queueCapacity > 0 ? queueCapacity : undefined,
      skipGameTapTarget: Number.isFinite(skipGameTapTarget) && skipGameTapTarget > 0 ? skipGameTapTarget : undefined,
      priorityUpgradesEnabled: body.priorityUpgradesEnabled === true,
      priorityUpgradeLabel: typeof body.priorityUpgradeLabel === "string" ? body.priorityUpgradeLabel : undefined,
      priorityUpgradeInstructions: typeof body.priorityUpgradeInstructions === "string" ? body.priorityUpgradeInstructions : undefined,
      priorityUpgradePriceCents: Number.isFinite(Number(body.priorityUpgradePriceCents)) ? Number(body.priorityUpgradePriceCents) : undefined,
      priorityUpgradeCurrency: typeof body.priorityUpgradeCurrency === "string" ? body.priorityUpgradeCurrency : undefined,
      priorityUpgradePaymentsEnabled: false,
    }));
  }
  if (body.action === "updatePriorityUpgradeSettings") {
    return NextResponse.json(await updatePriorityUpgradeSettings({
      enabled: body.enabled === true,
      label: typeof body.label === "string" ? body.label : undefined,
      instructions: typeof body.instructions === "string" ? body.instructions : undefined,
      priceCents: Number.isFinite(Number(body.priceCents)) ? Number(body.priceCents) : undefined,
      currency: typeof body.currency === "string" ? body.currency : undefined,
      paymentsEnabled: false,
    }));
  }
  if (body.action === "archiveSession") return NextResponse.json(await archiveCurrentQueueSession());
  if (body.action === "activateSession" && typeof body.sessionId === "string") return NextResponse.json(await activateQueueSession(body.sessionId));
  if (body.action === "viewSession" && typeof body.sessionId === "string") return NextResponse.json(await getRadioQueueState(body.sessionId));
  if (body.action === "pullNext") return NextResponse.json(await updateRadioTrack("", "pullNext"));
  if (["load", "finish", "remove", "priority", "regular", "wheel", "moveBack", "spotlight", "removeSpotlight", "restoreRegular", "restorePriority", "markPriorityManual", "markPriorityPaid", "markPriorityRequested", "markPriorityCheckoutPending"].includes(body.action) && typeof body.id === "string") {
    return NextResponse.json(await updateRadioTrack(body.id, body.action));
  }
  return NextResponse.json({ error: "Unknown queue action" }, { status: 400 });
}
