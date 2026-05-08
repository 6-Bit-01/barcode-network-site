import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { COOKIE_NAME, verifyAdminToken } from "@/lib/auth";
import { archiveCurrentQueueSession, getRadioQueueState, setQueueOpen, startNewQueueSession, activateQueueSession, updatePriorityUpgradeSettings, updateRadioTrack } from "@/lib/queue";

export const dynamic = "force-dynamic";

async function assertAdmin(): Promise<boolean> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  return token ? verifyAdminToken(token) : false;
}

export async function GET(req: Request) {
  if (!(await assertAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sessionId = new URL(req.url).searchParams.get("sessionId") ?? undefined;
  return NextResponse.json(await getRadioQueueState(sessionId));
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
    }));
  }
  if (body.action === "updatePriorityUpgradeSettings") {
    return NextResponse.json(await updatePriorityUpgradeSettings({
      enabled: body.enabled === true,
      label: typeof body.label === "string" ? body.label : undefined,
      instructions: typeof body.instructions === "string" ? body.instructions : undefined,
    }));
  }
  if (body.action === "archiveSession") return NextResponse.json(await archiveCurrentQueueSession());
  if (body.action === "activateSession" && typeof body.sessionId === "string") return NextResponse.json(await activateQueueSession(body.sessionId));
  if (body.action === "viewSession" && typeof body.sessionId === "string") return NextResponse.json(await getRadioQueueState(body.sessionId));
  if (body.action === "pullNext") return NextResponse.json(await updateRadioTrack("", "pullNext"));
  if (["load", "finish", "remove", "priority", "regular", "wheel", "moveBack", "spotlight", "removeSpotlight", "restoreRegular", "restorePriority"].includes(body.action) && typeof body.id === "string") {
    return NextResponse.json(await updateRadioTrack(body.id, body.action));
  }
  return NextResponse.json({ error: "Unknown queue action" }, { status: 400 });
}
